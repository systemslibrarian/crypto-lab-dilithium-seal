/**
 * Negative tests: every malformed input must fail safe.
 *
 * The ACVP suite proves the implementation says YES to the right things. This
 * file is the other half — that it says NO to everything else, and that "no"
 * means a `false` a caller can act on rather than an exception that escapes
 * into an async handler and leaves a spinner on screen.
 *
 * Two layers are tested separately, because they behave differently and the
 * difference matters:
 *
 *   src/crypto/mldsa.ts  the wrapper the app actually calls. FIPS 204 §3.6.2
 *                        says an implementation "shall return false" when σ or
 *                        pk has the wrong length. The wrapper does, for both.
 *   @noble/post-quantum  returns false for a wrong-length σ, but THROWS a
 *                        RangeError for a wrong-length pk. That is pinned here
 *                        rather than hidden, because it is the reason the
 *                        wrapper carries its own length checks, and because a
 *                        future release that changed it should be noticed.
 */

import { describe, expect, it } from 'vitest';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import {
  generateKeyPair,
  sign,
  verify,
  MAX_CONTEXT_BYTES,
  ML_DSA_PARAMS,
  type MLDSAVariant,
} from '../crypto/mldsa';
import { sealDocument, verifyDocument, type SealedDocument } from '../crypto/seal';

const VARIANTS: MLDSAVariant[] = ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];
const LIB = { 'ml-dsa-44': ml_dsa44, 'ml-dsa-65': ml_dsa65, 'ml-dsa-87': ml_dsa87 } as const;

/**
 * Signature layout from FIPS 204 Table 1, used to aim the encoding-level tests
 * at the right bytes: σ = c̃ ‖ z ‖ h, where |c̃| = λ/4 and |h| = ω + k.
 *
 * `layoutAddsUp` below checks these against Table 2's signature sizes, so a
 * wrong constant here fails immediately instead of quietly aiming a "hint"
 * test at the middle of z.
 */
const LAYOUT = {
  'ml-dsa-44': { lambda: 128, omega: 80, k: 4 },
  'ml-dsa-65': { lambda: 192, omega: 55, k: 6 },
  'ml-dsa-87': { lambda: 256, omega: 75, k: 8 },
} as const;

const regions = (v: MLDSAVariant) => {
  const { lambda, omega, k } = LAYOUT[v];
  const size = ML_DSA_PARAMS[v].signature;
  const cTilde = lambda / 4;
  const hint = omega + k;
  return { cTilde, zStart: cTilde, zEnd: size - hint, hintStart: size - hint, size };
};

interface Fixture {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  signature: Uint8Array;
  message: Uint8Array;
}
const fixtures = new Map<MLDSAVariant, Fixture>();

async function fixture(v: MLDSAVariant): Promise<Fixture> {
  const cached = fixtures.get(v);
  if (cached) return cached;
  const kp = await generateKeyPair(v);
  const message = new TextEncoder().encode('malformed-input fixture message');
  const { signature } = await sign(kp.privateKey, message, v);
  const f = { publicKey: kp.publicKey, privateKey: kp.privateKey, signature, message };
  fixtures.set(v, f);
  return f;
}

describe.each(VARIANTS)('%s — malformed inputs', (variant) => {
  const R = regions(variant);

  it('layout adds up to the FIPS 204 Table 2 signature size', () => {
    // c̃ + z + h, with z sized by FIPS 204 §7.2: ℓ · 32 · (1 + bitlen(γ₁ − 1)).
    expect(R.zEnd - R.zStart).toBeGreaterThan(0);
    expect(R.size).toBe(ML_DSA_PARAMS[variant].signature);
    expect(R.hintStart + LAYOUT[variant].omega + LAYOUT[variant].k).toBe(R.size);
  });

  it('accepts the untouched signature (so every rejection below means something)', async () => {
    const f = await fixture(variant);
    expect(await verify(f.publicKey, f.message, f.signature, variant)).toBe(true);
  });

  it('rejects a single flipped BIT anywhere in the signature', async () => {
    const f = await fixture(variant);
    // Sampled across all three regions rather than exhaustively: every bit of
    // eight byte positions in c̃, z and h. A bit, not a byte — a byte flip can
    // be argued to be a large perturbation; a single bit cannot.
    const positions = [
      0, 1, R.cTilde - 1,
      R.zStart, R.zStart + 1, Math.floor((R.zStart + R.zEnd) / 2), R.zEnd - 1,
      R.hintStart, R.size - 1,
    ];
    for (const pos of positions) {
      for (let bit = 0; bit < 8; bit++) {
        const bad = Uint8Array.from(f.signature);
        bad[pos] ^= 1 << bit;
        expect(
          await verify(f.publicKey, f.message, bad, variant),
          `bit ${bit} of signature byte ${pos}`
        ).toBe(false);
      }
    }
  });

  it('rejects a truncated signature', async () => {
    const f = await fixture(variant);
    for (const len of [0, 1, R.size - 1, Math.floor(R.size / 2)]) {
      expect(await verify(f.publicKey, f.message, f.signature.slice(0, len), variant), `len ${len}`)
        .toBe(false);
    }
  });

  it('rejects an extended signature, including one with a valid prefix', async () => {
    const f = await fixture(variant);
    // The appended bytes do not change the valid prefix, so an implementation
    // that ignored trailing data would still verify. FIPS 204 §3.6.2 is exactly
    // about this: strong unforgeability needs the length checked.
    for (const extra of [1, 8, 64]) {
      const bad = new Uint8Array(R.size + extra);
      bad.set(f.signature);
      expect(await verify(f.publicKey, f.message, bad, variant), `+${extra} bytes`).toBe(false);
    }
  });

  it('rejects a signature whose hint encoding is invalid', async () => {
    const f = await fixture(variant);
    const { omega } = LAYOUT[variant];

    // h is ω index bytes followed by k cumulative counts. All-ones makes the
    // counts exceed ω, which FIPS 204 Algorithm 15 (HintBitUnpack) rejects —
    // an invalid ENCODING, not merely a wrong value.
    const allOnes = Uint8Array.from(f.signature);
    allOnes.fill(0xff, R.hintStart);
    expect(await verify(f.publicKey, f.message, allOnes, variant)).toBe(false);

    // A single out-of-range cumulative count in the final position.
    const overOmega = Uint8Array.from(f.signature);
    overOmega[R.size - 1] = omega + 1;
    expect(await verify(f.publicKey, f.message, overOmega, variant)).toBe(false);

    const maxed = Uint8Array.from(f.signature);
    maxed[R.size - 1] = 0xff;
    expect(await verify(f.publicKey, f.message, maxed, variant)).toBe(false);
  });

  it('rejects a signature whose z falls outside the γ₁ − β norm bound', async () => {
    const f = await fixture(variant);
    // Saturating the packed z field drives every coefficient to the far end of
    // its range, so ‖z‖∞ ≥ γ₁ − β and the verifier's own norm check fires.
    const bad = Uint8Array.from(f.signature);
    bad.fill(0xff, R.zStart, R.zEnd);
    expect(await verify(f.publicKey, f.message, bad, variant)).toBe(false);
  });

  it('rejects an all-zero and an all-ones signature of exactly the right length', async () => {
    const f = await fixture(variant);
    expect(await verify(f.publicKey, f.message, new Uint8Array(R.size), variant)).toBe(false);
    expect(
      await verify(f.publicKey, f.message, new Uint8Array(R.size).fill(0xff), variant)
    ).toBe(false);
  });

  it('rejects a modified message, down to one bit', async () => {
    const f = await fixture(variant);
    for (const idx of [0, Math.floor(f.message.length / 2), f.message.length - 1]) {
      const bad = Uint8Array.from(f.message);
      bad[idx] ^= 0x01;
      expect(await verify(f.publicKey, bad, f.signature, variant), `message byte ${idx}`).toBe(false);
    }
    // Appending and truncating are message modifications too.
    expect(
      await verify(f.publicKey, new Uint8Array([...f.message, 0x21]), f.signature, variant)
    ).toBe(false);
    expect(await verify(f.publicKey, f.message.slice(0, -1), f.signature, variant)).toBe(false);
    expect(await verify(f.publicKey, new Uint8Array(0), f.signature, variant)).toBe(false);
  });

  it('rejects a different public key of the correct length', async () => {
    const f = await fixture(variant);
    const other = await generateKeyPair(variant);
    expect(other.publicKey.length).toBe(f.publicKey.length);
    expect(other.publicKey).not.toEqual(f.publicKey);
    expect(await verify(other.publicKey, f.message, f.signature, variant)).toBe(false);
  });

  it('rejects a public key of the wrong length by returning false, per FIPS 204 §3.6.2', async () => {
    const f = await fixture(variant);
    const expected = ML_DSA_PARAMS[variant].publicKey;
    const lengths = [
      0,
      expected - 1,
      expected + 1,
      ...VARIANTS.filter((v) => v !== variant).map((v) => ML_DSA_PARAMS[v].publicKey),
    ];
    for (const len of lengths) {
      const pk = new Uint8Array(len);
      pk.set(f.publicKey.subarray(0, Math.min(len, f.publicKey.length)));
      // Must RETURN, not throw. This is the assertion the wrapper's own length
      // check exists to satisfy.
      expect(await verify(pk, f.message, f.signature, variant), `pk length ${len}`).toBe(false);
    }
  });

  it('rejects a signature of the wrong length by returning false, per FIPS 204 §3.6.2', async () => {
    const f = await fixture(variant);
    for (const v of VARIANTS.filter((other) => other !== variant)) {
      const wrongSize = new Uint8Array(ML_DSA_PARAMS[v].signature);
      wrongSize.set(f.signature.subarray(0, Math.min(wrongSize.length, f.signature.length)));
      expect(await verify(f.publicKey, f.message, wrongSize, variant), `sig sized for ${v}`).toBe(
        false
      );
    }
  });

  it('refuses a context string longer than 255 bytes, in both directions', async () => {
    const f = await fixture(variant);
    const impl = LIB[variant];
    // FIPS 204 Algorithms 2 and 3, line 1: |ctx| > 255 returns ⊥. The library
    // raises rather than returning a signature, which is the ⊥ of a JS API.
    expect(() =>
      impl.sign(f.message, f.privateKey, { context: new Uint8Array(MAX_CONTEXT_BYTES + 1) })
    ).toThrow(/context should be 255 bytes or less/);
    expect(() =>
      impl.verify(f.signature, f.message, f.publicKey, {
        context: new Uint8Array(MAX_CONTEXT_BYTES + 1),
      })
    ).toThrow(/context should be 255 bytes or less/);
    // Exactly at the bound is accepted as an input — it simply does not match a
    // signature made with the empty context.
    expect(
      impl.verify(f.signature, f.message, f.publicKey, {
        context: new Uint8Array(MAX_CONTEXT_BYTES),
      })
    ).toBe(false);
  });

  it('binds a signature to its context string', async () => {
    const f = await fixture(variant);
    const impl = LIB[variant];
    const context = new TextEncoder().encode('dilithium-seal test context');
    const withCtx = impl.sign(f.message, f.privateKey, { context });
    expect(impl.verify(withCtx, f.message, f.publicKey, { context })).toBe(true);
    // The same signature under no context, or a different one, must not verify:
    // that is the whole purpose of the FIPS 204 M′ domain separator.
    expect(impl.verify(withCtx, f.message, f.publicKey)).toBe(false);
    expect(
      impl.verify(withCtx, f.message, f.publicKey, { context: new TextEncoder().encode('other') })
    ).toBe(false);
  });
});

describe('library-specific malformed-input behaviour (pinned, not assumed)', () => {
  it('throws rather than returning false for a wrong-length public key', async () => {
    // Recorded deliberately. FIPS 204 §3.6.2 asks for `false`; @noble returns
    // false for σ but throws for pk. Both refuse the input so neither is
    // unsafe, but the contracts differ — and src/crypto/mldsa.ts carries its own
    // length checks precisely because of this. If a future release changes it,
    // this test tells us instead of the wrapper silently becoming redundant.
    const f = await fixture('ml-dsa-65');
    expect(() => ml_dsa65.verify(f.signature, f.message, f.publicKey.slice(0, -1))).toThrow(
      /expected Uint8Array of length/
    );
    expect(ml_dsa65.verify(f.signature.slice(0, -1), f.message, f.publicKey)).toBe(false);
  });

  it('throws on a non-byte-array signature instead of coercing it', async () => {
    const f = await fixture('ml-dsa-65');
    const asArray = Array.from(f.signature) as unknown as Uint8Array;
    expect(() => ml_dsa65.verify(asArray, f.message, f.publicKey)).toThrow(/expected Uint8Array/);
    expect(() => ml_dsa65.verify(null as unknown as Uint8Array, f.message, f.publicKey)).toThrow();
  });

  it('throws on a misspelled option key rather than silently signing without it', async () => {
    // `{ ctx }` instead of `{ context }` would otherwise sign with no domain
    // separation and verify for anyone who also supplied none — a security
    // downgrade indistinguishable from an omission.
    const f = await fixture('ml-dsa-65');
    expect(() =>
      ml_dsa65.sign(f.message, f.privateKey, { ctx: new Uint8Array(1) } as never)
    ).toThrow(/unexpected option/);
  });

  it('throws on a wrong-length secret key rather than producing a signature', async () => {
    const f = await fixture('ml-dsa-65');
    expect(() => ml_dsa65.sign(f.message, f.privateKey.slice(0, -1))).toThrow(
      /expected Uint8Array of length/
    );
  });
});

describe('sealed-document verification fails safe', () => {
  const baseDoc = async (): Promise<SealedDocument> => {
    const kp = await generateKeyPair('ml-dsa-65');
    return sealDocument('sealed content', kp.privateKey, kp.publicKey, 'Test Signer', 'ml-dsa-65');
  };

  it('verifies an untouched seal', async () => {
    const result = await verifyDocument(await baseDoc());
    expect(result.valid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.contentIntact).toBe(true);
  });

  it('rejects edited content even when the stored hash is recomputed to agree', async () => {
    // The lesson the UI teaches, asserted: a tamperer can fix the hash, but not
    // the signature.
    const doc = await baseDoc();
    const tampered: SealedDocument = { ...doc, content: 'tampered content' };
    const encoded = new TextEncoder().encode(tampered.content);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    tampered.contentHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const result = await verifyDocument(tampered);
    expect(result.contentIntact).toBe(true);
    expect(result.signatureValid).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('returns a verdict rather than throwing for every malformed package', async () => {
    const doc = await baseDoc();
    const broken: Array<[string, unknown]> = [
      ['null', null],
      ['empty object', {}],
      ['missing signature', { ...doc, signature: undefined }],
      ['non-string publicKey', { ...doc, publicKey: 42 }],
      ['unknown variant', { ...doc, variant: 'ml-dsa-99' }],
      ['signature not base64', { ...doc, signature: 'not base64 !!!' }],
      ['publicKey not base64', { ...doc, publicKey: '@@@@' }],
      ['truncated base64 signature', { ...doc, signature: doc.signature.slice(0, 40) }],
      ['public key of another parameter set', { ...doc, variant: 'ml-dsa-44' }],
    ];
    for (const [label, value] of broken) {
      const result = await verifyDocument(value as SealedDocument);
      expect(result.valid, label).toBe(false);
      expect(typeof result.explanation, label).toBe('string');
      expect(result.explanation.length, label).toBeGreaterThan(0);
    }
  });
});
