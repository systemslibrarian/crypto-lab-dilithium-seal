/**
 * Property-based negative testing.
 *
 * `malformed-inputs.test.ts` is a list of cases someone thought of. That is
 * valuable and it is also bounded by imagination: it flips a bit at nine chosen
 * positions, truncates to four chosen lengths, and checks three chosen message
 * edits. A defect at a position nobody chose survives it.
 *
 * These tests state the RULE instead and let a generator look for a
 * counterexample: for *any* message, for *any* single bit anywhere in the
 * signature, for *any* wrong length, the answer must be the same. When one
 * fails, fast-check shrinks the input to the smallest case that still fails,
 * which is the difference between "something in this 3309-byte array is wrong"
 * and "byte 2071, bit 3".
 *
 * ── Why the run counts are what they are ──────────────────────────────────
 * Each ML-DSA verification is milliseconds, so a property at 1000 runs would
 * add minutes to a suite that currently takes four seconds. The counts below
 * are chosen so the whole file stays a few seconds while still sampling far
 * more of the input space than the hand-written cases do. The seed is FIXED, so
 * a failure is reproducible and CI does not go red on a case that passes when
 * re-run — a flaky gate teaches people to re-run rather than to look.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ML_DSA_PARAMS,
  generateKeyPair,
  sign,
  verify,
  type MLDSAVariant,
} from '../crypto/mldsa';
import { verifyDocument, type SealedDocument } from '../crypto/seal';

/** Fixed seed: a property failure must be reproducible, not a coin toss. */
const SEED = 0x5eed_1234;
const config = (numRuns: number): fc.Parameters<unknown> => ({ seed: SEED, numRuns });

const VARIANT: MLDSAVariant = 'ml-dsa-65';
const SIZES = ML_DSA_PARAMS[VARIANT];

/** One keypair for the whole file: keygen is the slow part and is not under test here. */
const fixture = await (async () => {
  const kp = await generateKeyPair(VARIANT);
  const message = new TextEncoder().encode('property fixture message');
  const { signature } = await sign(kp.privateKey, message, VARIANT);
  return { ...kp, message, signature };
})();

describe('round trip', () => {
  it('holds for any message, including empty and binary', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), async (message) => {
        const { signature } = await sign(fixture.privateKey, message, VARIANT);
        expect(signature.length).toBe(SIZES.signature);
        return await verify(fixture.publicKey, message, signature, VARIANT);
      }),
      config(25)
    );
  });

  it('binds a signature to its exact message, for any pair of different messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 256 }),
        fc.uint8Array({ maxLength: 256 }),
        async (a, b) => {
          fc.pre(Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0);
          const { signature } = await sign(fixture.privateKey, a, VARIANT);
          return (await verify(fixture.publicKey, b, signature, VARIANT)) === false;
        }
      ),
      config(25)
    );
  });
});

describe('any single bit flip is rejected', () => {
  it('anywhere in the signature', async () => {
    // The hand-written suite flips bits at nine chosen byte positions. This
    // draws the position from the whole 3309-byte array.
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: SIZES.signature - 1 }),
        fc.nat({ max: 7 }),
        async (byteIndex, bit) => {
          const bad = Uint8Array.from(fixture.signature);
          bad[byteIndex] ^= 1 << bit;
          return (await verify(fixture.publicKey, fixture.message, bad, VARIANT)) === false;
        }
      ),
      config(120)
    );
  });

  it('anywhere in the message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: fixture.message.length - 1 }),
        fc.nat({ max: 7 }),
        async (byteIndex, bit) => {
          const bad = Uint8Array.from(fixture.message);
          bad[byteIndex] ^= 1 << bit;
          return (await verify(fixture.publicKey, bad, fixture.signature, VARIANT)) === false;
        }
      ),
      config(60)
    );
  });

  it('anywhere in the public key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: SIZES.publicKey - 1 }),
        fc.nat({ max: 7 }),
        async (byteIndex, bit) => {
          const bad = Uint8Array.from(fixture.publicKey);
          bad[byteIndex] ^= 1 << bit;
          return (await verify(bad, fixture.message, fixture.signature, VARIANT)) === false;
        }
      ),
      config(60)
    );
  });
});

describe('arbitrary bytes never verify', () => {
  it('for a random signature of exactly the right length', async () => {
    // A forgery by luck has probability far below 2^-128; a pass here means a
    // verification bug, not bad luck.
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: SIZES.signature, maxLength: SIZES.signature }),
        async (bytes) => (await verify(fixture.publicKey, fixture.message, bytes, VARIANT)) === false
      ),
      config(40)
    );
  });

  it('for a random public key of exactly the right length', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: SIZES.publicKey, maxLength: SIZES.publicKey }),
        async (bytes) => (await verify(bytes, fixture.message, fixture.signature, VARIANT)) === false
      ),
      config(40)
    );
  });
});

describe('any wrong length returns false and never throws', () => {
  it('for the signature', async () => {
    // FIPS 204 §3.6.2: an implementation that can accept another length "shall
    // return false". Returning is the property — a throw would satisfy "does
    // not accept" while breaking every caller.
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: SIZES.signature * 2 }), async (length) => {
        fc.pre(length !== SIZES.signature);
        const result = await verify(
          fixture.publicKey,
          fixture.message,
          new Uint8Array(length),
          VARIANT
        );
        return result === false;
      }),
      config(60)
    );
  });

  it('for the public key', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: SIZES.publicKey * 2 }), async (length) => {
        fc.pre(length !== SIZES.publicKey);
        const result = await verify(
          new Uint8Array(length),
          fixture.message,
          fixture.signature,
          VARIANT
        );
        return result === false;
      }),
      config(60)
    );
  });
});

describe('the sealed-document verifier never throws', () => {
  const base: SealedDocument = {
    content: 'content',
    contentHash: 'aa',
    signature: 'AAAA',
    publicKey: 'AAAA',
    signerLabel: 'label',
    variant: VARIANT,
    timestamp: '2026-01-01T00:00:00.000Z',
    version: 'dilithium-seal-v1',
  };

  it('for arbitrary field values of arbitrary types', async () => {
    // Anything a pasted JSON document could contain. The verifier must always
    // produce a verdict: an exception escaping into an async click handler
    // leaves a spinner turning with nothing on screen.
    const anyValue = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.string(), { maxLength: 3 }),
      fc.object({ maxDepth: 1 })
    );
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.constantFrom(
            'content',
            'contentHash',
            'signature',
            'publicKey',
            'signerLabel',
            'variant',
            'timestamp',
            'version'
          ),
          anyValue
        ),
        async (overrides) => {
          const doc = { ...base, ...overrides } as unknown as SealedDocument;
          const result = await verifyDocument(doc);
          // Always a verdict, always with an explanation a reader can act on.
          return (
            typeof result.valid === 'boolean' &&
            typeof result.explanation === 'string' &&
            result.explanation.length > 0
          );
        }
      ),
      config(150)
    );
  });

  it('never reports a forged or malformed package as valid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 64 }), fc.string({ maxLength: 64 }), async (sig, key) => {
        const doc = { ...base, signature: sig, publicKey: key } as SealedDocument;
        return (await verifyDocument(doc)).valid === false;
      }),
      config(80)
    );
  });
});
