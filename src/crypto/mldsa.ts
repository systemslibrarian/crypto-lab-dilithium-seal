/**
 * ML-DSA (CRYSTALS-Dilithium) wrapper
 * Implements NIST FIPS 204 (August 2024) digital signature operations.
 * Reference: https://csrc.nist.gov/pubs/fips/204/final
 *
 * Parameter sizes sourced from FIPS 204 Table 1.
 */

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa';

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

export async function generateKeyPair(variant: MLDSAVariant): Promise<MLDSAKeyPair> {
  const impl = VARIANT_MAP[variant];
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const keys = impl.keygen(seed);
  return {
    publicKey: keys.publicKey,
    privateKey: keys.secretKey,
    variant,
  };
}

export async function sign(
  privateKey: Uint8Array,
  message: Uint8Array,
  variant: MLDSAVariant
): Promise<MLDSASignResult> {
  const impl = VARIANT_MAP[variant];
  const start = performance.now();
  const signature = impl.sign(privateKey, message);
  const signingTimeMs = performance.now() - start;
  return { signature, message, variant, signingTimeMs };
}

export async function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
  variant: MLDSAVariant
): Promise<boolean> {
  const impl = VARIANT_MAP[variant];
  return impl.verify(publicKey, message, signature);
}
