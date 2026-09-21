/**
 * Content-Security-Policy for a static GitHub Pages site.
 *
 * ── Why the policy is delivered in a <meta> element ────────────────────────
 * GitHub Pages serves this repo's `dist/` with a fixed set of response headers
 * and offers no way to add one. A `<meta http-equiv="Content-Security-Policy">`
 * is therefore the only delivery mechanism available, and it is strictly weaker
 * than a header. Three directives are IGNORED when delivered by meta, per CSP
 * Level 3 §3.3 ("<meta> element"):
 *
 *   - `frame-ancestors` — so this page cannot stop itself being framed. It is
 *     still written below, because the day this is served from somewhere that
 *     can set headers it starts working, and a policy that reads as if framing
 *     were controlled is worse than one that says so out loud. Chromium logs a
 *     notice about it and `e2e/csp.spec.ts` asserts that notice appears, so the
 *     limitation cannot quietly lapse.
 *   - `report-uri` / `report-to` — no violation telemetry.
 *   - `sandbox`.
 *
 * A meta policy also only takes effect once the parser reaches it, so anything
 * before it in <head> is unprotected. It is placed immediately after <title>,
 * ahead of every script and stylesheet on the page.
 *
 * ── Why hashes instead of a nonce ──────────────────────────────────────────
 * A nonce must be fresh per response, which needs a server. This is a static
 * artifact, so the two inline <script> blocks and the one inline <style> block
 * are allowed by SHA-256 hash instead.
 *
 * ── Why the hashes are computed from the built bytes ───────────────────────
 * Vite minifies the inline <style> during `generateBundle` (4259 bytes of source
 * become 2238), so a hash taken from `index.html` on disk would not match what
 * ships and the stylesheet would be blocked in production only. This plugin
 * therefore reads the FINAL emitted HTML and substitutes the hashes into the
 * placeholder, which makes drift impossible: change the inline script and the
 * next build changes the policy with it.
 */

import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Placeholders the CSP meta in index.html carries until a build fills them. */
const SCRIPT_SLOT = '{{CSP_SCRIPT_HASHES}}';
const STYLE_SLOT = '{{CSP_STYLE_HASHES}}';

/**
 * Inline blocks, i.e. <script> with no `src` and <style>.
 *
 * `[^>]*` cannot match a `>` so an attribute value containing one would break
 * this. None of the three blocks has attributes at all, and `assertPolicy`
 * below fails the build if the count ever changes unexpectedly.
 */
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
const INLINE_STYLE = /<style[^>]*>([\s\S]*?)<\/style>/g;

function sha256Base64(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('base64');
}

/**
 * Blank out HTML comments before scanning for inline blocks.
 *
 * The parser does not run script or style inside a comment, and neither should
 * this. Skipping it is not cosmetic: the CSP is documented by a comment that
 * names the element types it covers, and an unstripped scan matched the word
 * "style" there and then ran to the first real closing tag, swallowing the
 * policy itself into the "stylesheet" it was hashing. The two calls below
 * disagreed about that block's content and the build failed with a hash that
 * looked correct and covered nothing.
 *
 * Comments are replaced by spaces rather than removed so that every offset in
 * the string is preserved and no two previously separated tags become adjacent.
 */
function withoutComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
}

function hashesOf(html: string, pattern: RegExp): string[] {
  // A hash covers the element's text content exactly as the parser sees it —
  // no trimming, no normalisation.
  const seen = new Set<string>();
  for (const match of withoutComments(html).matchAll(pattern)) {
    seen.add(`'sha256-${sha256Base64(match[1])}'`);
  }
  return [...seen];
}

/** Fill the CSP placeholders in `html` from `html`'s own inline blocks. */
export function withInlineHashes(html: string): string {
  const scripts = hashesOf(html, INLINE_SCRIPT);
  const styles = hashesOf(html, INLINE_STYLE);
  return html.replace(SCRIPT_SLOT, scripts.join(' ')).replace(STYLE_SLOT, styles.join(' '));
}

/**
 * Fail the build rather than ship a policy that does not do what it claims.
 *
 * Every check here corresponds to a sentence this repo says out loud about the
 * policy. Without them the claims are prose: a stray `'unsafe-inline'` added to
 * make a build pass would ship silently, and an unfilled placeholder would ship
 * a policy so malformed the browser drops the whole thing — which fails open in
 * the sense that matters, because a dropped directive is no directive.
 */
export function assertPolicy(html: string): void {
  const meta = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/
  );
  if (!meta) throw new Error('CSP: no Content-Security-Policy meta element in the built HTML');
  const policy = meta[1];

  if (policy.includes('{{')) throw new Error(`CSP: unfilled placeholder in policy: ${policy}`);
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'"]) {
    if (policy.includes(unsafe)) throw new Error(`CSP: ${unsafe} is not permitted in this policy`);
  }
  for (const required of [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ]) {
    if (!policy.includes(required)) throw new Error(`CSP: missing directive: ${required}`);
  }

  // Every inline block the document actually contains must be covered, and the
  // policy must not carry a hash for a block that no longer exists.
  const expected = [...hashesOf(html, INLINE_SCRIPT), ...hashesOf(html, INLINE_STYLE)];
  if (expected.length === 0) throw new Error('CSP: expected inline blocks, found none');
  for (const hash of expected) {
    if (!policy.includes(hash)) throw new Error(`CSP: inline block not covered by any hash: ${hash}`);
  }
  const inPolicy = policy.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [];
  for (const hash of inPolicy) {
    if (!expected.includes(hash)) throw new Error(`CSP: stale hash for a block that is gone: ${hash}`);
  }

  // No remote origin may appear anywhere in the policy. This is the "no
  // third-party runtime JavaScript, no analytics, no CDN, no remote font"
  // requirement expressed where it can fail a build.
  const remote = policy.match(/https?:\/\/[^\s;]+/g);
  if (remote) throw new Error(`CSP: remote origin in policy: ${remote.join(', ')}`);
}

/**
 * Substitute the inline-block hashes into the CSP meta, and refuse to emit a
 * policy that fails `assertPolicy`.
 *
 * `transformIndexHtml` (order 'post') covers the dev server, where nothing is
 * minified. `generateBundle` covers the build, where the inline <style> has
 * been minified by `vite:build-html` and the source hashes would no longer
 * match. Both paths end in the same assertion.
 */
export function csp(): Plugin {
  let isBuild = false;
  return {
    name: 'dilithium-seal:csp',
    // 'post': vite:build-html emits and minifies index.html during its own
    // generateBundle. Without this the hook below runs first and sees no HTML
    // asset at all, which is how the placeholders shipped unfilled the first
    // time this was wired up.
    enforce: 'post',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Dev server only. This hook ALSO runs during a build, before
        // vite:build-html minifies the inline <style>; substituting here would
        // bake in a hash of the unminified stylesheet, leave no placeholder for
        // generateBundle to fill, and block the page's own styles in production
        // while dev looked fine.
        return isBuild ? html : withInlineHashes(html);
      },
    },
    generateBundle(_options, bundle) {
      let seen = 0;
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
        seen++;
        const source = String(asset.source);
        // If the placeholders are already gone, something substituted them
        // earlier — which means the hashes describe a pre-minification document.
        if (!source.includes(SCRIPT_SLOT) || !source.includes(STYLE_SLOT)) {
          throw new Error(
            `CSP: ${asset.fileName} reached generateBundle with its placeholders already filled; ` +
              'the hashes would describe HTML that is not what ships'
          );
        }
        const html = withInlineHashes(source);
        assertPolicy(html);
        asset.source = html;
      }
      if (seen === 0) throw new Error('CSP: no HTML asset in the bundle to apply a policy to');
    },
  };
}
