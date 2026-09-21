/**
 * Runtime and implementation assurances.
 *
 * Three claims are checked here that nothing else in the suite can check:
 *
 *  1. THE VERSION ON THE PAGE CANNOT DRIFT FROM THE LOCKFILE. The page names the
 *     library and its version. Written by hand, that sentence is wrong the first
 *     time Dependabot lands a bump, and a version claim that can be wrong is
 *     worse than none — a reader uses it to decide which advisories and which
 *     audit apply. So the value is derived from package-lock.json at build time
 *     and re-derived here from the same file.
 *
 *  2. SECURE RANDOMNESS FAILURE STOPS CRYPTOGRAPHIC OPERATIONS. Not "degrades",
 *     not "warns" — stops. The tests below remove `crypto.getRandomValues` and
 *     require key generation and signing to throw, and require verification
 *     (which needs no randomness) to keep working.
 *
 *  3. THERE IS NO Math.random IN THE CRYPTOGRAPHIC PATH. `Math.random` does
 *     appear once in this repo, in the reduced teaching model in
 *     src/ui/fiat-shamir-viz.ts. A test that simply banned the string would
 *     have to be disabled for that file and would then protect nothing; this
 *     one enumerates where it is allowed and fails on any other occurrence.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { RUNTIME_FACTS, LIMITATIONS } from '../data/runtime';
import { isAfter } from '../../build/runtime-facts';
import { findWasmEvidence } from '../../build/purity';
import {
  InsecureRandomnessError,
  requireSecureRandomness,
  secureRandomBytes,
  secureRandomnessAvailable,
} from '../crypto/random';
import { generateKeyPair, sign, verify } from '../crypto/mldsa';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('the implementation the page names', () => {
  const lock = JSON.parse(read('package-lock.json')) as {
    packages: Record<string, { version?: string; resolved?: string; integrity?: string }>;
  };

  it('is the version package-lock.json pins, not the range package.json allows', () => {
    const pinned = lock.packages['node_modules/@noble/post-quantum'];
    expect(RUNTIME_FACTS.library.name).toBe('@noble/post-quantum');
    expect(RUNTIME_FACTS.library.version).toBe(pinned.version);
    expect(RUNTIME_FACTS.library.resolved).toBe(pinned.resolved);
    expect(RUNTIME_FACTS.library.integrity).toBe(pinned.integrity);

    // And it is an exact version, never a range.
    expect(RUNTIME_FACTS.library.version).toMatch(/^\d+\.\d+\.\d+/);
    const declared = (JSON.parse(read('package.json')) as { dependencies: Record<string, string> })
      .dependencies['@noble/post-quantum'];
    expect(declared).toMatch(/^[\^~]/);
    expect(RUNTIME_FACTS.library.version).not.toBe(declared);
  });

  it('names the hashing dependency the crypto path actually runs through', () => {
    // SHAKE128/SHAKE256 do ML-DSA's matrix expansion, challenge sampling and
    // message representative, so its version belongs on the page too.
    const hashes = RUNTIME_FACTS.dependencies.find((d) => d.name === '@noble/hashes');
    expect(hashes).toBeDefined();
    expect(hashes!.version).toBe(lock.packages['node_modules/@noble/hashes'].version);
  });

  it('matches what is actually installed in node_modules', () => {
    const installed = JSON.parse(read('node_modules/@noble/post-quantum/package.json')) as {
      version: string;
    };
    expect(RUNTIME_FACTS.library.version).toBe(installed.version);
  });

  it('carries an integrity hash for every package it names', () => {
    for (const p of [RUNTIME_FACTS.library, ...RUNTIME_FACTS.dependencies]) {
      expect(p.integrity, p.name).toMatch(/^sha\d{3}-/);
      expect(p.resolved, p.name).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
  });
});

describe('audit and validation status', () => {
  it('reports no independent audit, and quotes the library saying so', () => {
    expect(RUNTIME_FACTS.audit.independent).toBe(false);
    // Pinned against the library's own README: if it is ever independently
    // audited, this fails and a human updates the claim instead of the page
    // silently understating — or overstating — the assurance.
    const readme = read('node_modules/@noble/post-quantum/README.md');
    expect(readme).toContain(RUNTIME_FACTS.audit.statement);
    expect(readme).toContain('self-audited');
  });

  it('records that the shipped version is later than the self-audited one', () => {
    // 0.7.1 ships; 0.6.1 was self-audited. Stating "self-audited" without this
    // would imply an assurance that does not cover what is running.
    expect(RUNTIME_FACTS.audit.selfAuditedVersion).toBe('0.6.1');
    expect(RUNTIME_FACTS.audit.shippedVersionIsAfterSelfAudit).toBe(
      isAfter(RUNTIME_FACTS.library.version, RUNTIME_FACTS.audit.selfAuditedVersion)
    );
    expect(RUNTIME_FACTS.audit.shippedVersionIsAfterSelfAudit).toBe(true);
  });

  it('claims no CMVP certificate and no FIPS 140 validation', () => {
    expect(RUNTIME_FACTS.validation.cmvp).toBe(false);
    expect(RUNTIME_FACTS.validation.fips140).toBe(false);
    expect(RUNTIME_FACTS.validation.statement).toMatch(/no CMVP certificate/);
    expect(RUNTIME_FACTS.validation.statement).toMatch(/is not a validation/);
  });

  it('is honest about the implementation type', () => {
    expect(RUNTIME_FACTS.implementationType).toBe('javascript');
  });

  it('enforces the purity claim against the real bundle, at build time', () => {
    // This assertion used to read `dist/assets` from here. It passed locally
    // off a stale build and failed in CI, where `npm test` runs BEFORE
    // `npm run build` and `dist/` does not exist — a test depending on an
    // artifact it does not produce is a coin toss about whether someone built
    // recently. The check now lives in a Vite plugin that inspects the bundle
    // it is emitting, so it cannot be skipped or run against the wrong build.
    // What is unit-tested here is the rule itself, which is pure.
    expect(findWasmEvidence([{ name: 'index.js', source: 'const a = 1;' }])).toEqual([]);
    // The word alone is not evidence — this project's own UI says
    // "no WebAssembly or native code", and that must not trip the rule.
    expect(
      findWasmEvidence([{ name: 'index.js', source: '"pure JS, no WebAssembly or native code"' }])
    ).toEqual([]);
    // Actual instantiation is.
    expect(findWasmEvidence([{ name: 'a.js', source: 'WebAssembly.instantiate(b)' }])).toHaveLength(1);
    expect(findWasmEvidence([{ name: 'a.js', source: 'new WebAssembly.Module(b)' }])).toHaveLength(1);
    expect(findWasmEvidence([{ name: 'x.wasm', source: '' }])).toHaveLength(1);
    expect(findWasmEvidence([{ name: 'a.js', source: 'process.dlopen(m, p)' }])).toHaveLength(1);
  });
});

describe('secure randomness, or nothing', () => {
  const realCrypto = globalThis.crypto;
  const restore = (): void => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  };
  afterEach(restore);

  const withoutGetRandomValues = (): void => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: realCrypto.subtle },
      configurable: true,
    });
  };

  it('reports availability truthfully in both directions', () => {
    expect(secureRandomnessAvailable()).toBe(true);
    withoutGetRandomValues();
    expect(secureRandomnessAvailable()).toBe(false);
  });

  it('returns distinct, non-zero bytes when the RBG is present', () => {
    const a = secureRandomBytes(32);
    const b = secureRandomBytes(32);
    expect(a.length).toBe(32);
    expect(a.every((x) => x === 0)).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('throws — never returns a buffer — when getRandomValues is missing', () => {
    withoutGetRandomValues();
    expect(() => secureRandomBytes(32)).toThrow(InsecureRandomnessError);
    expect(() => requireSecureRandomness('test')).toThrow(InsecureRandomnessError);
  });

  it('throws when getRandomValues exists but throws', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: realCrypto.subtle,
        getRandomValues: () => {
          throw new Error('blocked by policy');
        },
      },
      configurable: true,
    });
    expect(() => secureRandomBytes(32)).toThrow(/blocked by policy/);
    expect(secureRandomnessAvailable()).toBe(false);
  });

  it('refuses a stub that silently returns zeros instead of filling the array', () => {
    // A no-op getRandomValues would otherwise hand keygen a 32-byte seed of
    // zeros, which it would accept without complaint.
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: realCrypto.subtle, getRandomValues: (a: Uint8Array) => a },
      configurable: true,
    });
    expect(() => secureRandomBytes(32)).toThrow(/zero bytes/);
  });

  it('stops key generation rather than producing a guessable key', async () => {
    withoutGetRandomValues();
    await expect(generateKeyPair('ml-dsa-65')).rejects.toThrow(InsecureRandomnessError);
  });

  it('stops hedged signing rather than silently signing deterministically', async () => {
    // Real key first, while randomness is still available.
    const kp = await generateKeyPair('ml-dsa-65');
    const msg = new TextEncoder().encode('no randomness, no signature');
    withoutGetRandomValues();
    await expect(sign(kp.privateKey, msg, 'ml-dsa-65')).rejects.toThrow(InsecureRandomnessError);
  });

  it('still verifies without randomness, because verification needs none', async () => {
    const kp = await generateKeyPair('ml-dsa-65');
    const msg = new TextEncoder().encode('verification needs no RBG');
    const { signature } = await sign(kp.privateKey, msg, 'ml-dsa-65');
    withoutGetRandomValues();
    // A reader whose browser cannot generate keys should still be able to check
    // a signature someone else made.
    expect(await verify(kp.publicKey, msg, signature, 'ml-dsa-65')).toBe(true);
  });
});

describe('no non-cryptographic randomness in the crypto path', () => {
  /** Every .ts file under `dir`, recursively. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, entry);
      if (statSync(join(ROOT, rel)).isDirectory()) sources(rel, out);
      else if (entry.endsWith('.ts')) out.push(rel);
    }
    return out;
  }

  /**
   * Blank out comments and string literals before scanning.
   *
   * Without this the rule matches its own documentation: `src/crypto/random.ts`
   * exists to explain why Math.random must never be used, and naming it there
   * made the file its own violation. A rule that fires on prose describing the
   * rule is a rule nobody can keep, so scan CODE.
   */
  function code(file: string): string {
    return read(file)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
      .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
      .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  }

  it('calls Math.random only in the file that declares itself a teaching model', () => {
    // Enumerated rather than banned outright: the Fiat-Shamir visualization is
    // a reduced model over a 257-element ring and says so on screen, and a rule
    // that had to be switched off for it would protect nothing.
    const ALLOWED = ['src/ui/fiat-shamir-viz.ts'];
    const offenders = sources('src')
      .filter((f) => !f.includes('__tests__'))
      .filter((f) => /\bMath\.random\b/.test(code(f)))
      .filter((f) => !ALLOWED.includes(f.replace(/\\/g, '/')));
    expect(offenders).toEqual([]);
  });

  it('is not vacuous: the allowed file really does call Math.random', () => {
    // If the teaching model stopped using it, the allowance above would be dead
    // and the rule would be silently narrower than it reads.
    expect(code('src/ui/fiat-shamir-viz.ts')).toMatch(/\bMath\.random\b/);
  });

  it('has no Math.random call anywhere under src/crypto', () => {
    for (const file of sources('src/crypto')) {
      expect(code(file), file).not.toMatch(/\bMath\.random\b/);
    }
  });

  it('draws the key-generation seed from the secure helper, not crypto directly', () => {
    // A direct `crypto.getRandomValues(...)` call would bypass the zero-fill
    // check and throw a bare TypeError the UI does not recognise.
    const mldsa = code('src/crypto/mldsa.ts');
    expect(mldsa).toContain('secureRandomBytes(32)');
    expect(mldsa).not.toMatch(/crypto\.getRandomValues/);
  });
});

describe('limitations are stated, not implied', () => {
  it('covers every limitation Priority 5 requires', () => {
    const ids = LIMITATIONS.map((l) => l.id);
    expect(ids).toContain('not-constant-time');
    expect(ids).toContain('no-erasure');
    expect(ids).toContain('trust-boundary');
    expect(ids).toContain('kat-not-audit');
    expect(ids).toContain('identity-binding');
  });

  it('states each one substantively rather than as a heading', () => {
    for (const l of LIMITATIONS) {
      expect(l.title.length, l.id).toBeGreaterThan(20);
      expect(l.body.length, l.id).toBeGreaterThan(120);
    }
  });

  it("states the constant-time limitation in the library's own words", () => {
    // Asserted on the limitation text rather than by grepping sources for the
    // phrase: every occurrence in this repo is inside prose that DENIES the
    // property, so a source grep flags its own documentation. `e2e/runtime.spec.ts`
    // checks the rendered page.
    const ct = LIMITATIONS.find((l) => l.id === 'not-constant-time')!;
    expect(ct.body).toContain('does not claim constant-time execution');
    expect(ct.body).toMatch(/rejection loop/);
    expect(ct.title).toMatch(/not guaranteed/i);
  });

  it('ties the memory limitation to what FIPS 204 actually requires', () => {
    const erase = LIMITATIONS.find((l) => l.id === 'no-erasure')!;
    expect(erase.claimId).toBe('intermediateValues');
    expect(erase.body).toContain('§3.6.3');
  });

  it('ties the identity limitation to what FIPS 204 actually requires', () => {
    const id = LIMITATIONS.find((l) => l.id === 'identity-binding')!;
    expect(id.claimId).toBe('identityBinding');
    expect(id.body).toContain('proof of possession');
  });
});
