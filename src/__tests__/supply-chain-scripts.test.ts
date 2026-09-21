/**
 * The two supply-chain scripts, and the documents they back.
 *
 * Both scripts are the kind of thing that passes for years and then turns out
 * never to have worked, because the only evidence they run is that nothing
 * complained. So each rule is tested against inputs that MUST fail, not only
 * against the repository's own currently-clean state.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkWorkflowText, findWorkflowFiles } from '../../scripts/check-action-pins.mjs';
import { buildSbom, integrityToHash, purlFor } from '../../scripts/generate-sbom.mjs';
import { manifestFor } from '../../scripts/hash-dist.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('GitHub Action pinning', () => {
  it('accepts a full-SHA pin that says which release it is', () => {
    const ok = `
      steps:
        - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        - uses: './local-action'
        - uses: docker://alpine:3.20
    `;
    expect(checkWorkflowText(ok)).toEqual([]);
  });

  it('rejects a tag pin, which its owner can move', () => {
    // The whole point: `actions/checkout@v7` is a pointer, and whoever controls
    // that repository can point it somewhere else between two CI runs.
    const problems = checkWorkflowText('        - uses: actions/checkout@v7\n');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/movable ref "v7"/);
  });

  it('rejects a branch pin and a version with no sha', () => {
    expect(checkWorkflowText('  - uses: some/action@main\n')[0]).toMatch(/movable ref "main"/);
    expect(checkWorkflowText('  - uses: some/action\n')[0]).toMatch(/no version at all/);
  });

  it('rejects a short sha, which is not unique and can be forged', () => {
    expect(checkWorkflowText('  - uses: a/b@3d3c42e # v7\n')[0]).toMatch(/movable ref/);
  });

  it('rejects a correct pin with no version comment', () => {
    // Dependabot reads that comment to know what it is updating from, and a
    // human cannot review a bare 40-character hex string.
    const problems = checkWorkflowText(
      '  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n'
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no "# vX\.Y\.Z" comment/);
  });

  it('handles the quoting GitHub Actions permits', () => {
    expect(
      checkWorkflowText('  - uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" # v7.0.1\n')
    ).toEqual([]);
    expect(checkWorkflowText("  - uses: 'actions/checkout@v7'\n")).toHaveLength(1);
  });

  it('passes over this repository as it actually stands', () => {
    const files = findWorkflowFiles();
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((f: string) => checkWorkflowText(readFileSync(f, 'utf8'), f));
    expect(problems).toEqual([]);
  });

  it('is not vacuous: this repository really does use external actions', () => {
    // If every `uses:` were local, the check above would pass while proving
    // nothing about the rule.
    const workflow = read('.github/workflows/deploy.yml');
    const external = workflow.match(/^\s*(?:-\s*)?uses:\s*[a-z]/gm) ?? [];
    expect(external.length).toBeGreaterThanOrEqual(5);
    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/);
  });
});

describe('CycloneDX SBOM', () => {
  const lock = {
    packages: {
      '': { name: 'root', version: '1.0.0' },
      'node_modules/@noble/post-quantum': {
        version: '0.7.1',
        resolved: 'https://registry.npmjs.org/@noble/post-quantum/-/post-quantum-0.7.1.tgz',
        integrity: 'sha512-AAAA',
      },
      'node_modules/vite': { version: '8.3.0', dev: true, integrity: 'sha512-BBBB' },
      'node_modules/a/node_modules/nested': { version: '2.0.0' },
      'node_modules/linked': { version: '1.0.0', link: true },
    },
  };
  const pkg = { name: 'dilithium-seal', version: '1.0.0', description: 'demo' };
  const sbom = buildSbom(lock, pkg, { serialNumber: 'urn:uuid:test', timestamp: '2026-09-20T00:00:00Z' });

  it('declares a valid CycloneDX document header', () => {
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.specVersion).toBe('1.6');
    expect(sbom.version).toBe(1);
    expect(sbom.serialNumber).toBe('urn:uuid:test');
    expect(sbom.metadata.component.name).toBe('dilithium-seal');
    expect(sbom.metadata.component.type).toBe('application');
  });

  it('lists every package, and the root project only as metadata', () => {
    const names = sbom.components.map((c: { name: string }) => c.name);
    expect(names).toContain('@noble/post-quantum');
    expect(names).toContain('vite');
    // A nested install is a real component, named by its own directory.
    expect(names).toContain('nested');
    // A workspace symlink is not a published artifact.
    expect(names).not.toContain('linked');
    expect(names).not.toContain('root');
  });

  it('distinguishes runtime dependencies from dev ones', () => {
    const byName = new Map(
      sbom.components.map((c: { name: string; scope: string }) => [c.name, c.scope])
    );
    expect(byName.get('@noble/post-quantum')).toBe('required');
    expect(byName.get('vite')).toBe('excluded');
  });

  it('converts npm integrity to a CycloneDX hash', () => {
    expect(integrityToHash('sha512-AAAA')).toEqual({
      alg: 'SHA-512',
      content: Buffer.from('AAAA', 'base64').toString('hex'),
    });
    expect(integrityToHash('sha256-AAAA')?.alg).toBe('SHA-256');
    expect(integrityToHash(undefined)).toBeNull();
    expect(integrityToHash('md5-AAAA')).toBeNull();
  });

  it('builds purls that survive a scoped package name', () => {
    expect(purlFor('@noble/post-quantum', '0.7.1')).toBe('pkg:npm/%40noble/post-quantum@0.7.1');
    expect(purlFor('vite', '8.3.0')).toBe('pkg:npm/vite@8.3.0');
  });

  it('is deterministic: the same lockfile yields the same component order', () => {
    const again = buildSbom(lock, pkg, { serialNumber: 'urn:uuid:test', timestamp: '2026-09-20T00:00:00Z' });
    expect(JSON.stringify(again)).toBe(JSON.stringify(sbom));
  });

  it('describes this repository\'s real lockfile', () => {
    const realLock = JSON.parse(read('package-lock.json'));
    const realPkg = JSON.parse(read('package.json'));
    const real = buildSbom(realLock, realPkg, { serialNumber: 'urn:uuid:x', timestamp: 'now' });
    expect(real.components.length).toBeGreaterThan(50);
    const runtime = real.components
      .filter((c: { scope: string }) => c.scope === 'required')
      .map((c: { name: string }) => c.name)
      .sort();
    // Exactly the runtime surface: the signer and its three dependencies.
    expect(runtime).toEqual([
      '@noble/ciphers',
      '@noble/curves',
      '@noble/hashes',
      '@noble/post-quantum',
    ]);
  });
});

describe('assurance documents', () => {
  const REQUIRED = ['SECURITY.md', 'THREAT-MODEL.md', 'KNOWN-LIMITATIONS.md', '.github/CODEOWNERS'];

  it('all exist and are substantive', () => {
    for (const file of REQUIRED) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
      expect(read(file).length, file).toBeGreaterThan(500);
    }
  });

  it('the threat model covers every threat Priority 8 requires', () => {
    const text = read('THREAT-MODEL.md').toLowerCase();
    for (const topic of [
      'private signing key',
      'browser randomness',
      'untrusted messages and signatures',
      'malformed keys and signatures',
      'dependency and build-pipeline compromise',
      'host-page or extension compromise',
      'timing and memory limitations',
      'public-key trust and identity binding',
    ]) {
      expect(text, topic).toContain(topic);
    }
  });

  it('the threat model names assets and a trust boundary, not just threats', () => {
    const text = read('THREAT-MODEL.md');
    expect(text).toMatch(/## Assets/);
    expect(text).toMatch(/## Trust boundary/);
    expect(text).toMatch(/## Out of scope/);
  });

  it('the security policy says what is out of scope, so a reporter is not wasted', () => {
    const text = read('SECURITY.md');
    expect(text).toMatch(/## Reporting a vulnerability/);
    expect(text).toMatch(/out of scope/i);
    // Markdown emphasis sits between the words: "**not** NIST-validated".
    expect(text).toMatch(/not\*{0,2}\s+NIST-validated/i);
  });

  it('CODEOWNERS covers the cryptographic path and the build gates specifically', () => {
    const text = read('.github/CODEOWNERS');
    for (const path of ['/src/crypto/', '/vectors/', '/build/', '/scripts/', '/.github/']) {
      expect(text, path).toContain(path);
    }
    // A catch-all alone would let a parameter-table change go unreviewed among
    // a large diff; the specific paths are the point.
    expect(text).toMatch(/^\* @/m);
  });

  it('no assurance document links to a file that does not exist', () => {
    for (const file of ['SECURITY.md', 'THREAT-MODEL.md', 'KNOWN-LIMITATIONS.md', 'README.md']) {
      const links = read(file).match(/\]\((?!https?:)([^)#]+)/g) ?? [];
      for (const link of links) {
        const target = link.slice(2).split('#')[0];
        expect(existsSync(join(ROOT, target)), `${file} -> ${target}`).toBe(true);
      }
    }
  });
});

describe('Node version and runner family are exact', () => {
  const workflow = read('.github/workflows/deploy.yml');

  it('pins one Node version, from .nvmrc, everywhere', () => {
    expect(read('.nvmrc').trim()).toBe('22');
    const uses = workflow.match(/node-version-file: \.nvmrc/g) ?? [];
    const literals = workflow.match(/node-version:\s*\d/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(literals).toEqual([]);
  });

  it('pins an exact runner image, never a moving one', () => {
    const runners = [...workflow.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1]);
    expect(runners.length).toBeGreaterThanOrEqual(4);
    for (const runner of runners) {
      expect(runner, 'runner image').toBe('ubuntu-24.04');
      expect(runner).not.toContain('latest');
    }
  });
});

describe('build reproducibility and deployment verification', () => {
  /**
   * A fixture tree, not `dist/`.
   *
   * The first version of these tests read `dist/` — and `npm test` runs BEFORE
   * `npm run build` in CI, so they passed locally off a stale build and failed
   * the moment CI looked. That is the same defect this repository already fixed
   * once, in the no-WebAssembly check, and the same lesson: a test that depends
   * on an artifact it does not produce is a coin toss about whether someone
   * built recently. The rule under test is pure, so it gets a tree of its own.
   */
  const fixture = mkdtempSync(join(tmpdir(), 'hash-dist-'));
  mkdirSync(join(fixture, 'assets'), { recursive: true });
  writeFileSync(join(fixture, 'index.html'), '<!doctype html>');
  writeFileSync(join(fixture, 'assets', 'b.css'), 'body{}');
  writeFileSync(join(fixture, 'assets', 'a.js'), 'export default 1;');

  it('hashes a tree deterministically, sorted, with no timestamps', () => {
    const manifest = manifestFor(fixture);
    const lines = manifest.split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toMatch(/^[0-9a-f]{64} {2}\S+$/);
    }
    // Sorted, so two identical builds produce identical manifests regardless
    // of the order the filesystem happened to hand the files back.
    expect([...lines].sort()).toEqual(lines);
    // Byte-for-byte stable across calls.
    expect(manifestFor(fixture)).toBe(manifest);
  });

  it('changes when a single byte of a single file changes', () => {
    const before = manifestFor(fixture);
    writeFileSync(join(fixture, 'assets', 'a.js'), 'export default 2;');
    const after = manifestFor(fixture);
    expect(after).not.toBe(before);
    // Compared as SETS, not by position: lines sort by "<hash>  <path>", so a
    // changed hash moves its own line and shifts the ones around it.
    const removed = before.split('\n').filter((l) => !after.includes(l));
    const added = after.split('\n').filter((l) => !before.includes(l));
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(removed[0]).toContain('assets/a.js');
    expect(added[0]).toContain('assets/a.js');
    writeFileSync(join(fixture, 'assets', 'a.js'), 'export default 1;');
  });

  it('uses forward slashes, so a Windows manifest matches a Linux one', () => {
    expect(manifestFor(fixture)).not.toMatch(/\\/);
    expect(manifestFor(fixture)).toContain('assets/a.js');
  });

  it('CI builds twice and requires the bytes to match', () => {
    const workflow = read('.github/workflows/deploy.yml');
    expect(workflow).toContain('The build is reproducible');
    expect(workflow).toMatch(/hash-dist\.mjs > \/tmp\/first\.sha256/);
    expect(workflow).toMatch(/hash-dist\.mjs > \/tmp\/second\.sha256/);
    expect(workflow).toMatch(/diff -u \/tmp\/first\.sha256 \/tmp\/second\.sha256/);
  });

  it('attests build provenance, and only for something that will be published', () => {
    const workflow = read('.github/workflows/deploy.yml');
    expect(workflow).toContain('actions/attest-build-provenance@');
    // A pull-request run has no business minting an attestation for bytes that
    // are not going to be published.
    const attestBlock = workflow.slice(
      workflow.indexOf('Attest build provenance') - 200,
      workflow.indexOf('actions/attest-build-provenance@')
    );
    expect(attestBlock).toContain("if: github.event_name != 'pull_request'");
    expect(workflow).toContain('attestations: write');
  });

  it('verifies the deployment after publishing, not before', () => {
    const workflow = read('.github/workflows/deploy.yml');
    const job = workflow.slice(workflow.indexOf('  verify-deployment:'));
    expect(job).toContain('needs: deploy');
    expect(job).toContain('npm run verify:deployment');
    // It must run against the URL deploy actually published.
    expect(job).toContain('needs.deploy.outputs.page_url');
    expect(workflow).toContain('page_url: ${{ steps.deployment.outputs.page_url }}');
  });
});
