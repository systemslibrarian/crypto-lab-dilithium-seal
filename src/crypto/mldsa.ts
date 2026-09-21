/**
 * ML-DSA (CRYSTALS-Dilithium) wrapper
 * Implements NIST FIPS 204 (August 2024) digital signature operations.
 * Reference: https://csrc.nist.gov/pubs/fips/204/final
 *
 * Parameter sizes sourced from FIPS 204 Table 1.
 *
 * Note on the @noble/post-quantum call shape: since v0.4 the signer surface takes
 * the message first -- `sign(msg, secretKey)` and `verify(sig, msg, publicKey)` --
 * where 0.2.x took the key first. The wrappers below keep this module's own
 * key-first argument order so callers in src/ui are unaffected, and reorder at the
 * boundary. Getting that backwards no longer silently mis-signs: the library
 * length-checks each argument and throws, which is why the round-trip tests in
 * src/__tests__/mldsa.test.ts catch it.
 *
 * The subpath specifier must carry its `.js` extension -- the v0.7 export map
 * publishes `./ml-dsa.js` only, and the extensionless form is no longer resolvable.
 */

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { requireSecureRandomness, secureRandomBytes } from './random';

export type MLDSAVariant = 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87';

export interface MLDSAKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  variant: MLDSAVariant;
}

export interface MLDSASignResult {
  signature: Uint8Array;
  message: Uint8Array;
  variant: MLDSAVariant;
  signingTimeMs: number;
}

/**
 * FIPS 204 Table 1 — ML-DSA parameter sizes (bytes).
 *
 * Private key sizes:
 *   sk = 32(ρ) + 32(K) + 64(tr) + ℓ·BitPack(s₁,η) + k·BitPack(s₂,η) + k·BitPack(t₀,2^(d-1))
 *   ML-DSA-44: 32+32+64 + 4·96 + 4·96 + 4·416 = 2560
 *   ML-DSA-65: 32+32+64 + 5·128 + 6·128 + 6·416 = 4032
 *   ML-DSA-87: 32+32+64 + 7·96 + 8·96 + 8·416 = 4896
 */
export const ML_DSA_PARAMS = {
  'ml-dsa-44': { publicKey: 1312, privateKey: 2560, signature: 2420, securityCategory: 2 },
  'ml-dsa-65': { publicKey: 1952, privateKey: 4032, signature: 3309, securityCategory: 3 },
  'ml-dsa-87': { publicKey: 2592, privateKey: 4896, signature: 4627, securityCategory: 5 },
} as const;

const VARIANT_MAP = {
  'ml-dsa-44': ml_dsa44,
  'ml-dsa-65': ml_dsa65,
  'ml-dsa-87': ml_dsa87,
} as const;

/**
 * FIPS 204 §3.6.1: the 256-bit seed ξ "shall be a fresh (i.e., not previously
 * used) random value generated using an approved RBG". `secureRandomBytes`
 * throws rather than return anything less, so a browser without the Web Crypto
 * API produces an error here instead of a guessable key.
 */
export async function generateKeyPair(variant: MLDSAVariant): Promise<MLDSAKeyPair> {
  const impl = VARIANT_MAP[variant];
  const seed = secureRandomBytes(32);
  const keys = impl.keygen(seed);
  return {
    publicKey: keys.publicKey,
    privateKey: keys.secretKey,
    variant,
  };
}

/**
 * Sign with the default HEDGED variant of FIPS 204 Algorithm 2.
 *
 * Hedged, not deterministic: the library draws a 32-byte `rnd` per signature,
 * which §3.6.1 describes as a countermeasure against side-channel and fault
 * attacks on deterministic signing. That makes signing depend on the RBG, so
 * the guard below is not belt-and-braces — without randomness this operation
 * genuinely cannot proceed, and it must stop rather than silently fall back to
 * the deterministic variant, which has a different security posture the reader
 * was never told about.
 */
export async function sign(
  privateKey: Uint8Array,
  message: Uint8Array,
  variant: MLDSAVariant
): Promise<MLDSASignResult> {
  requireSecureRandomness('ML-DSA signing (hedged variant)');
  const impl = VARIANT_MAP[variant];
  const start = performance.now();
  // noble argument order: (message, secretKey).
  const signature = impl.sign(message, privateKey);
  const signingTimeMs = performance.now() - start;
  return { signature, message, variant, signingTimeMs };
}

/**
 * FIPS 204 Algorithms 2 and 3, line 1: a context string longer than 255 bytes
 * is an error, not a signature. The library enforces this too (it throws
 * `RangeError: context should be 255 bytes or less`); the constant is exported
 * so callers and tests can name the bound instead of repeating 255.
 */
export const MAX_CONTEXT_BYTES = 255;

/**
 * Verify a signature, returning `false` — never throwing — for any input whose
 * length is wrong.
 *
 * FIPS 204 §3.6.2 ("Public-Key and Signature Length Checks"): *"If an
 * implementation of ML-DSA can accept inputs for σ or pk of any other length,
 * it shall return false whenever the lengths of either of these inputs differ
 * from their lengths specified in this standard. Failing to check the length of
 * pk or σ may interfere with the security properties that ML-DSA is designed to
 * have, like strong unforgeability."*
 *
 * @noble/post-quantum satisfies that for the signature — a wrong-length σ
 * returns `false` — but for the public key it throws a `RangeError` instead of
 * returning `false`. Both refuse the input, so neither is unsafe, but "throws"
 * and "returns false" are different contracts and only one of them is what the
 * standard asks for. The checks below are this wrapper's own, so the behaviour
 * every caller in this app sees is the one §3.6.2 specifies, whatever the
 * library does underneath. `src/__tests__/malformed-inputs.test.ts` pins both:
 * that the wrapper returns false, and that the library underneath throws.
 */
export async function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
  variant: MLDSAVariant
): Promise<boolean> {
  const params = ML_DSA_PARAMS[variant];
  if (publicKey.length !== params.publicKey) return false;
  if (signature.length !== params.signature) return false;

  const impl = VARIANT_MAP[variant];
  // noble argument order: (signature, message, publicKey).
  return impl.verify(signature, message, publicKey);
}
