/**
 * Unit tests for the CSP build step.
 *
 * `e2e/csp.spec.ts` proves the shipped policy is enforced by a real browser.
 * These tests cover the half a browser cannot: that the BUILD refuses to emit a
 * policy that does not do what this repo says it does. Each case below is a way
 * the policy could quietly become decorative — an unfilled placeholder, an
 * `'unsafe-inline'` added to get a build green, a hash left behind for a script
 * that was deleted, a CDN added to `script-src` — and each one has to fail the
 * build rather than reach `dist/`.
 */

import { describe, expect, it } from 'vitest';
import { assertPolicy, withInlineHashes } from '../../build/csp';

const POLICY =
  "default-src 'none'; script-src 'self' {{CSP_SCRIPT_HASHES}}; style-src 'self' {{CSP_STYLE_HASHES}}; " +
  "img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'";

function page(opts: { policy?: string; script?: string; style?: string } = {}): string {
  const { policy = POLICY, script = 'console.log(1);', style = 'body{color:red}' } = opts;
  return [
    '<!DOCTYPE html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    `<script>${script}</script>`,
    `<style>${style}</style>`,
    '</head><body></body></html>',
  ].join('\n');
}

describe('withInlineHashes', () => {
  it('fills both placeholders with a hash per inline block', () => {
    const out = withInlineHashes(page());
    expect(out).not.toContain('{{');
    expect(out.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2);
  });

  it('gives a different hash when the inline source changes by one byte', () => {
    const a = withInlineHashes(page({ script: 'console.log(1);' }));
    const b = withInlineHashes(page({ script: 'console.log(2);' }));
    expect(a).not.toEqual(b);
  });

  it('ignores blocks that only appear inside an HTML comment', () => {
    // This is the defect that made the first working build fail: the policy's
    // own explanatory comment mentions the element types it covers, and an
    // unstripped scan matched there and ran on to the first real closing tag,
    // swallowing the policy into the "stylesheet" it was hashing.
    //
    // The comment stays in the emitted document, so the two documents are not
    // equal — the hashes are what must be, and they are the whole point.
    const hashes = (html: string): string[] => html.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [];
    const commented = page().replace(
      '<head>',
      '<head>\n<!-- covers the inline <style> block and the <script> above -->'
    );
    expect(hashes(withInlineHashes(commented))).toEqual(hashes(withInlineHashes(page())));
    expect(hashes(withInlineHashes(commented))).toHaveLength(2);
  });
});

describe('assertPolicy', () => {
  const ok = (html: string): void => expect(() => assertPolicy(html)).not.toThrow();
  const fails = (html: string, match: RegExp): void =>
    expect(() => assertPolicy(html)).toThrow(match);

  it('accepts a fully substituted policy that covers every inline block', () => {
    ok(withInlineHashes(page()));
  });

  it('rejects an unfilled placeholder', () => {
    // A browser drops a policy it cannot parse, so this would ship as no policy
    // at all while `dist/index.html` still visibly contained one.
    fails(page(), /unfilled placeholder/);
  });

  it('rejects every unsafe escape hatch', () => {
    for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'"]) {
      fails(
        withInlineHashes(page({ policy: POLICY.replace("script-src 'self'", `script-src 'self' ${unsafe}`) })),
        /not permitted in this policy/
      );
    }
  });

  it('rejects a missing hardening directive', () => {
    for (const directive of [
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ]) {
      const stripped = POLICY.replace(`${directive}; `, '').replace(`; ${directive}`, '');
      fails(withInlineHashes(page({ policy: stripped })), /missing directive/);
    }
  });

  it('rejects an inline block no hash covers', () => {
    // Substitute against one document, then assert against a document whose
    // inline script has changed — exactly what happens if the hashes are taken
    // before a later build step rewrites the markup.
    const filled = withInlineHashes(page({ script: 'console.log(1);' }));
    const drifted = filled.replace('console.log(1);', 'console.log(999);');
    fails(drifted, /not covered by any hash/);
  });

  it('rejects a hash left behind for a block that no longer exists', () => {
    // The stale-allowance case: deleting an inline script must also delete its
    // hash, or the policy keeps permitting that exact source forever.
    const filled = withInlineHashes(page());
    const scriptGone = filled.replace(/<script>[\s\S]*?<\/script>/, '');
    fails(scriptGone, /stale hash/);
  });

  it('rejects a remote origin anywhere in the policy', () => {
    fails(
      withInlineHashes(
        page({ policy: POLICY.replace("script-src 'self'", "script-src 'self' https://cdn.example.com") })
      ),
      /remote origin in policy/
    );
  });

  it('rejects a document with no policy at all', () => {
    fails('<!DOCTYPE html><html><head></head><body></body></html>', /no Content-Security-Policy meta/);
  });
});
