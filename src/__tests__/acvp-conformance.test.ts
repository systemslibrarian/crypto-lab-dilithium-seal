/**
 * Known-answer conformance against NIST's own ACVP ML-DSA vectors.
 *
 * ── What this proves, and what it does not ────────────────────────────────
 * Reproducing NIST's published answers byte-for-byte is evidence of
 * INTEROPERABILITY: this build of @noble/post-quantum computes the same
 * ML-DSA that NIST's reference generator computes, for every parameter set and
 * every mode exercised below. That is a real and checkable property.
 *
 * It is NOT a validation. It is not a CMVP certificate, not a FIPS 140
 * validation, not an independent security audit, and not evidence of
 * constant-time behaviour or side-channel resistance. A validated module is a
 * module tested by an accredited laboratory under a defined operational
 * environment; a passing vector file says only that the arithmetic agrees. The
 * site must never describe itself as validated, certified or FIPS-compliant on
 * the strength of this file, and `claim-evidence` / the provenance panel say so
 * where a reader can see it.
 *
 * ── Where the vectors come from ───────────────────────────────────────────
 * usnistgov/ACVP-Server, release v1.1.0.43, commit 975de31…, subset by
 * `scripts/fetch-acvp-vectors.mjs` under a deterministic rule that keeps every
 * test group. Nothing is downloaded here: the vendored files are digest-checked
 * against `manifest.json` before a single vector is used, so an accidental edit
 * to the test data fails as loudly as a broken implementation would.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CHash } from '@noble/hashes/utils.js';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { sha224, sha256, sha384, sha512, sha512_224, sha512_256 } from '@noble/hashes/sha2.js';
import { sha3_224, sha3_256, sha3_384, sha3_512, shake128_32, shake256_64 } from '@noble/hashes/sha3.js';

type Impl = typeof ml_dsa44;

interface AcvpTest {
  tcId: number;
  seed?: string;
  pk?: string;
  sk?: string;
  message?: string;
  mu?: string;
  rnd?: string;
  context?: string;
  hashAlg?: string;
  signature?: string;
  testPassed?: boolean;
  reason?: string;
}
interface AcvpGroup {
  tgId: number;
  parameterSet: 'ML-DSA-44' | 'ML-DSA-65' | 'ML-DSA-87';
  deterministic?: boolean;
  signatureInterface?: 'internal' | 'external';
  preHash?: 'pure' | 'preHash' | 'none';
  externalMu?: boolean;
  tests: AcvpTest[];
}
interface AcvpFile {
  algorithm: string;
  mode: string;
  revision: string;
  testGroups: AcvpGroup[];
}

const IMPL: Record<AcvpGroup['parameterSet'], Impl> = {
  'ML-DSA-44': ml_dsa44,
  'ML-DSA-65': ml_dsa65,
  'ML-DSA-87': ml_dsa87,
};

/**
 * λ, the collision strength of c̃, from FIPS 204 Table 1. Written out here
 * rather than imported from application code on purpose: a conformance oracle
 * that reads its expectations out of the thing under test proves nothing.
 */
const LAMBDA: Record<AcvpGroup['parameterSet'], number> = {
  'ML-DSA-44': 128,
  'ML-DSA-65': 192,
  'ML-DSA-87': 256,
};

/**
 * ACVP hash names to the library's hash objects.
 *
 * The two XOFs map to the length-fixed exports, not the bare ones. FIPS 204
 * §5.4.1 (and RFC 8702) pair id-shake128 with SHAKE128(M, 256) and id-shake256
 * with SHAKE256(M, 512), because the OID travels inside M′ and therefore
 * asserts an output length. @noble/hashes' bare `shake128`/`shake256` default
 * to 16 and 32 bytes, so using them here would build an M′ claiming a length it
 * does not have — signatures a conformant verifier rejects. The library refuses
 * that outright, which is how this mapping got written correctly.
 */
const HASHES: Record<string, CHash> = {
  'SHA2-224': sha224,
  'SHA2-256': sha256,
  'SHA2-384': sha384,
  'SHA2-512': sha512,
  'SHA2-512/224': sha512_224,
  'SHA2-512/256': sha512_256,
  'SHA3-224': sha3_224,
  'SHA3-256': sha3_256,
  'SHA3-384': sha3_384,
  'SHA3-512': sha3_512,
  'SHAKE-128': shake128_32,
  'SHAKE-256': shake256_64,
};

const hex = (h: string | undefined): Uint8Array =>
  Uint8Array.from(Buffer.from(h ?? '', 'hex'));
const toHex = (b: Uint8Array): string => Buffer.from(b).toString('hex').toUpperCase();

const readVector = (name: string): Buffer =>
  readFileSync(new URL(`../../vectors/acvp/${name}`, import.meta.url));

interface Manifest {
  upstream: { repository: string; release: string; commit: string };
  files: Record<
    string,
    {
      upstreamPath: string;
      upstreamSha256: string;
      vendoredFile: string;
      vendoredSha256: string;
      testGroups: number;
      testCases: number;
      upstreamTestCases: number;
    }
  >;
}
const manifest: Manifest = JSON.parse(readVector('manifest.json').toString('utf8'));

function load(key: keyof Manifest['files']): AcvpFile {
  const entry = manifest.files[key];
  const raw = readVector(entry.vendoredFile);
  const digest = createHash('sha256').update(raw).digest('hex');
  if (digest !== entry.vendoredSha256) {
    throw new Error(
      `${entry.vendoredFile}: digest ${digest} does not match the manifest's ` +
        `${entry.vendoredSha256}. The vendored vectors have been modified; ` +
        're-derive them with scripts/fetch-acvp-vectors.mjs --write.'
    );
  }
  return JSON.parse(raw.toString('utf8')) as AcvpFile;
}

/**
 * FIPS 204 §5.4, with footnote 6: to keep the scheme's security strength, a
 * pre-hash digest must give at least λ bits of classical collision strength,
 * which "requires that the digest to be signed be at least 2λ bits in length."
 *
 * @noble/post-quantum enforces exactly this and refuses a weaker pairing. NIST's
 * ACVP vector set does generate such pairings (ML-DSA-87 with SHA2-224, for
 * instance) because Algorithm 4 "may be used with other hash functions or XOFs"
 * — §5.4 is a security-strength requirement, not a constraint on the algorithm.
 * Both readings are defensible and this suite tests BOTH halves: a pairing that
 * meets the bound must reproduce NIST's answer exactly, and one that does not
 * must be refused rather than silently signed.
 */
const meetsPrehashStrength = (set: AcvpGroup['parameterSet'], alg: string): boolean =>
  (HASHES[alg].outputLen * 8) / 2 >= LAMBDA[set];

const PARAM_SETS = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'] as const;

describe('pinned ACVP vectors', () => {
  it('are the NIST files this repo claims, at the commit it claims', () => {
    expect(manifest.upstream.repository).toBe('https://github.com/usnistgov/ACVP-Server');
    expect(manifest.upstream.release).toBe('v1.1.0.43');
    expect(manifest.upstream.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const entry of Object.values(manifest.files)) {
      expect(entry.upstreamSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.vendoredSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.upstreamPath).toContain('FIPS204');
    }
  });

  it('declare the final FIPS 204 revision, not a draft or a round-3 submission', () => {
    for (const key of ['keyGen', 'sigGen', 'sigVer'] as const) {
      const file = load(key);
      expect(file.algorithm).toBe('ML-DSA');
      expect(file.revision).toBe('FIPS204');
      expect(file.mode).toBe(key);
    }
  });

  it('keep every upstream test group, dropping only repetitions inside one', () => {
    // The subset is only honest if no MODE was dropped. Each group is one
    // (parameter set x interface x prehash x externalMu x determinism) combination.
    for (const key of ['keyGen', 'sigGen', 'sigVer'] as const) {
      const file = load(key);
      expect(file.testGroups.length).toBe(manifest.files[key].testGroups);
      expect(file.testGroups.every((g) => g.tests.length > 0)).toBe(true);
    }
    expect(load('sigGen').testGroups.length).toBe(24);
    expect(load('sigVer').testGroups.length).toBe(12);
  });

  it('cover all three final parameter sets in every mode', () => {
    for (const key of ['keyGen', 'sigGen', 'sigVer'] as const) {
      const sets = new Set(load(key).testGroups.map((g) => g.parameterSet));
      expect([...sets].sort()).toEqual([...PARAM_SETS]);
    }
  });

  it('cover deterministic and hedged signing, both interfaces, pure and pre-hash', () => {
    const groups = load('sigGen').testGroups;
    const shape = (g: AcvpGroup): string =>
      `${g.deterministic ? 'det' : 'hedged'}/${g.signatureInterface}/${g.preHash}/mu=${g.externalMu}`;
    const shapes = new Set(groups.map(shape));
    expect(shapes).toContain('det/external/pure/mu=false');
    expect(shapes).toContain('hedged/external/pure/mu=false');
    expect(shapes).toContain('det/external/preHash/mu=false');
    expect(shapes).toContain('hedged/external/preHash/mu=false');
    expect(shapes).toContain('det/internal/none/mu=true');
    expect(shapes).toContain('hedged/internal/none/mu=true');
    expect(shapes).toContain('det/internal/none/mu=false');
    expect(shapes).toContain('hedged/internal/none/mu=false');
  });

  it('cover every rejection reason NIST generates for verification', () => {
    const reasons = new Set(load('sigVer').testGroups.flatMap((g) => g.tests.map((t) => t.reason)));
    expect(reasons).toContain('valid signature and message - signature should verify successfully');
    expect(reasons).toContain('modified message');
    expect(reasons).toContain('modified signature - z');
    expect(reasons).toContain('modified signature - hint');
    expect(reasons).toContain('modified signature - commitment');
  });
});

describe('ML-DSA.KeyGen against ACVP', () => {
  const file = load('keyGen');
  for (const group of file.testGroups) {
    it(`${group.parameterSet} (tg${group.tgId}): ${group.tests.length} cases reproduce NIST's pk and sk`, () => {
      const impl = IMPL[group.parameterSet];
      for (const t of group.tests) {
        const keys = impl.keygen(hex(t.seed));
        expect(toHex(keys.publicKey), `tc${t.tcId} pk`).toBe(t.pk);
        expect(toHex(keys.secretKey), `tc${t.tcId} sk`).toBe(t.sk);
        // The public key must also be recoverable from the private key alone.
        expect(toHex(impl.getPublicKey(hex(t.sk))), `tc${t.tcId} getPublicKey`).toBe(t.pk);
      }
    });
  }
});

/** Produce a signature for one ACVP sigGen case, in that case's own mode. */
function signForCase(group: AcvpGroup, t: AcvpTest): Uint8Array {
  const impl = IMPL[group.parameterSet];
  // ACVP gives `rnd` for hedged groups; `deterministic` groups sign with no
  // extra entropy at all, which is FIPS 204's deterministic variant.
  const extraEntropy = group.deterministic ? (false as const) : hex(t.rnd);

  if (group.signatureInterface === 'external') {
    const signer = group.preHash === 'preHash' ? impl.prehash(HASHES[t.hashAlg!]) : impl;
    return signer.sign(hex(t.message), hex(t.sk), { context: hex(t.context), extraEntropy });
  }
  // Internal interface: the caller supplies either M′ directly, or the 64-byte
  // message representative µ when externalMu is set. No context — the internal
  // functions never read one; it has already been folded into M′ upstream.
  const input = group.externalMu ? hex(t.mu) : hex(t.message);
  return impl.internal.sign(input, hex(t.sk), { extraEntropy, externalMu: group.externalMu });
}

describe('ML-DSA.Sign against ACVP', () => {
  const file = load('sigGen');
  for (const group of file.testGroups) {
    const label =
      `${group.parameterSet} tg${group.tgId} ` +
      `[${group.deterministic ? 'deterministic' : 'hedged'}, ${group.signatureInterface}` +
      `${group.preHash === 'preHash' ? ', pre-hash' : ''}${group.externalMu ? ', external mu' : ''}]`;

    it(`${label}: signatures match NIST byte-for-byte`, () => {
      let compared = 0;
      let refused = 0;
      for (const t of group.tests) {
        const strengthOk =
          group.preHash !== 'preHash' || meetsPrehashStrength(group.parameterSet, t.hashAlg!);

        if (!strengthOk) {
          // FIPS 204 §5.4: this (parameter set, hash) pairing gives fewer than
          // λ bits of collision strength. The library must refuse it — silently
          // signing would be the failure, not the throw.
          expect(() => signForCase(group, t), `tc${t.tcId} ${t.hashAlg}`).toThrow(
            /security strength too low/
          );
          refused++;
          continue;
        }
        expect(toHex(signForCase(group, t)), `tc${t.tcId}`).toBe(t.signature);
        compared++;
      }
      // Every group must actually have compared a signature against NIST's
      // answer. Without this, a group whose vendored cases were ALL refused
      // would go green having asserted nothing about signing at all — which is
      // what the first version of the subset rule produced.
      expect(compared, 'group must contain cases that are actually signed').toBeGreaterThan(0);
      if (group.preHash === 'preHash') {
        expect(refused, 'pre-hash groups must also exercise the §5.4 refusal').toBeGreaterThan(0);
      }
      expect(compared + refused).toBe(group.tests.length);
    });
  }
});

/** Verify one ACVP sigVer case in that case's own mode. */
function verifyForCase(group: AcvpGroup, t: AcvpTest): boolean {
  const impl = IMPL[group.parameterSet];
  if (group.signatureInterface === 'external') {
    const verifier = group.preHash === 'preHash' ? impl.prehash(HASHES[t.hashAlg!]) : impl;
    return verifier.verify(hex(t.signature), hex(t.message), hex(t.pk), { context: hex(t.context) });
  }
  const input = group.externalMu ? hex(t.mu) : hex(t.message);
  return impl.internal.verify(hex(t.signature), input, hex(t.pk), { externalMu: group.externalMu });
}

describe('ML-DSA.Verify against ACVP', () => {
  const file = load('sigVer');
  for (const group of file.testGroups) {
    const label =
      `${group.parameterSet} tg${group.tgId} ` +
      `[${group.signatureInterface}${group.preHash === 'preHash' ? ', pre-hash' : ''}` +
      `${group.externalMu ? ', external mu' : ''}]`;

    it(`${label}: accepts every valid case and rejects every invalid one`, () => {
      let accepted = 0;
      let rejected = 0;
      for (const t of group.tests) {
        const strengthOk =
          group.preHash !== 'preHash' || meetsPrehashStrength(group.parameterSet, t.hashAlg!);
        if (!strengthOk) {
          expect(() => verifyForCase(group, t), `tc${t.tcId} ${t.hashAlg}`).toThrow(
            /security strength too low/
          );
          continue;
        }
        const got = verifyForCase(group, t);
        expect(got, `tc${t.tcId} (${t.reason})`).toBe(t.testPassed);
        if (t.testPassed) accepted++;
        else rejected++;
      }
      // Both outcomes, in every group. A verifier that returned `false` for
      // everything would satisfy an all-negative group, and a verifier that
      // returned `true` for everything would satisfy an all-positive one; only
      // requiring both catches either.
      expect(rejected, 'every group must reject at least one invalid case').toBeGreaterThan(0);
      expect(accepted, 'every group must accept its valid control').toBeGreaterThan(0);
    });
  }
});

describe('conformance scope', () => {
  it('is interoperability evidence, not a validation — recorded as such', () => {
    // A guard against the single most likely wrong conclusion to draw from a
    // green run of this file. The strings below are what the repo is allowed to
    // say; `e2e/claims.spec.ts` enforces the same rule on the rendered page.
    const claim = manifest.files.sigGen;
    expect(claim.upstreamTestCases).toBeGreaterThan(claim.testCases);
    // The subset is a subset, and the manifest says so rather than implying the
    // whole upstream suite was run.
    expect(claim.testCases).toBe(78);
    expect(claim.upstreamTestCases).toBe(360);
  });
});
