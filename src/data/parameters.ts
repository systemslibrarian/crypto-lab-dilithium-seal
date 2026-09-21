/**
 * The complete FIPS 204 parameter set for ML-DSA-44, ML-DSA-65 and ML-DSA-87.
 *
 * Every value here is transcribed from FIPS 204 Table 1 (parameters), Table 2
 * (sizes) and §2.3 (the ring), and nothing is rounded, simplified or inferred.
 * `src/__tests__/parameters.test.ts` then checks the transcription three ways,
 * because a table of numbers is exactly the kind of thing that looks right:
 *
 *   1. Internal consistency — β must equal τ·η, γ₂ must equal the stated
 *      fraction of q−1, q must equal 2^23 − 2^13 + 1.
 *   2. Against the standard's own size FORMULAS. FIPS 204 gives the byte
 *      lengths algebraically in the Input/Output lines of Algorithms 1, 2 and
 *      3 — pk ∈ 𝔹^(32+32k(bitlen(q−1)−d)) and so on — so the sizes in Table 2
 *      can be recomputed from the parameters in Table 1. If a single parameter
 *      here were mistyped, at least one size would stop matching.
 *   3. Against the running implementation, which must emit exactly these byte
 *      counts.
 *
 * A transcription that survives all three is very unlikely to be wrong.
 */

import { ML_DSA_PARAMS, type MLDSAVariant } from '../crypto/mldsa';

/** The modulus, shared by all three parameter sets. FIPS 204 §2.3. */
export const Q = 8380417;

/** The ring is ℤq[X]/(X^256 + 1), so every polynomial has 256 coefficients. */
export const RING_DIMENSION = 256;

/** Bits dropped from t when forming t₁. FIPS 204 Table 1. */
export const DROPPED_BITS = 13;

/** A 512th root of unity in ℤq, used by the NTT. FIPS 204 Table 1. */
export const ZETA = 1753;

export interface ParameterSet {
  name: string;
  variant: MLDSAVariant;
  /** (k, ℓ): the dimensions of the matrix A. */
  k: number;
  l: number;
  /** Private-key coefficient range: s₁, s₂ have coefficients in [−η, η]. */
  eta: number;
  /** Number of ±1 coefficients in the challenge polynomial c. */
  tau: number;
  /** Collision strength of c̃, in bits. Also fixes |c̃| = λ/4 bytes. */
  lambda: number;
  /** Coefficient range of the masking vector y. */
  gamma1: number;
  /** Low-order rounding range. */
  gamma2: number;
  /** β = τ·η, the worst-case shift c·s₁ can apply to any coefficient. */
  beta: number;
  /** Maximum number of 1s in the hint h. */
  omega: number;
  /** log₂(C(256, τ)) + τ, from Table 1. */
  challengeEntropy: number;
  /** Expected repetitions of the signing loop, as PUBLISHED in Table 1. */
  repetitionsPublished: number;
  /** The value NIST's errata spreadsheet says Table 1 will be corrected to. */
  repetitionsPendingErratum: number;
  securityCategory: 2 | 3 | 5;
  publicKeyBytes: number;
  privateKeyBytes: number;
  signatureBytes: number;
}

export const PARAMETER_SETS: ParameterSet[] = [
  {
    name: 'ML-DSA-44',
    variant: 'ml-dsa-44',
    k: 4,
    l: 4,
    eta: 2,
    tau: 39,
    lambda: 128,
    gamma1: 2 ** 17,
    gamma2: (Q - 1) / 88,
    beta: 78,
    omega: 80,
    challengeEntropy: 192,
    repetitionsPublished: 4.25,
    repetitionsPendingErratum: 4.36,
    securityCategory: 2,
    publicKeyBytes: 1312,
    privateKeyBytes: 2560,
    signatureBytes: 2420,
  },
  {
    name: 'ML-DSA-65',
    variant: 'ml-dsa-65',
    k: 6,
    l: 5,
    eta: 4,
    tau: 49,
    lambda: 192,
    gamma1: 2 ** 19,
    gamma2: (Q - 1) / 32,
    beta: 196,
    omega: 55,
    challengeEntropy: 225,
    repetitionsPublished: 5.1,
    repetitionsPendingErratum: 5.14,
    securityCategory: 3,
    publicKeyBytes: 1952,
    privateKeyBytes: 4032,
    signatureBytes: 3309,
  },
  {
    name: 'ML-DSA-87',
    variant: 'ml-dsa-87',
    k: 8,
    l: 7,
    eta: 2,
    tau: 60,
    lambda: 256,
    gamma1: 2 ** 19,
    gamma2: (Q - 1) / 32,
    beta: 120,
    omega: 75,
    challengeEntropy: 257,
    repetitionsPublished: 3.85,
    repetitionsPendingErratum: 3.91,
    securityCategory: 5,
    publicKeyBytes: 2592,
    privateKeyBytes: 4896,
    signatureBytes: 4627,
  },
];

export const bySet = (variant: MLDSAVariant): ParameterSet =>
  PARAMETER_SETS.find((p) => p.variant === variant)!;

/** Bit length of a positive integer, as FIPS 204 §2.3 defines `bitlen`. */
export const bitlen = (n: number): number => n.toString(2).length;

/**
 * The byte sizes, recomputed from Table 1 parameters using the standard's own
 * formulas. These appear in the Input/Output lines of Algorithms 1, 2 and 3.
 */
export const sizeFormulas = {
  publicKey: (p: ParameterSet): number => 32 + 32 * p.k * (bitlen(Q - 1) - DROPPED_BITS),
  privateKey: (p: ParameterSet): number =>
    32 + 32 + 64 + 32 * ((p.l + p.k) * bitlen(2 * p.eta) + DROPPED_BITS * p.k),
  signature: (p: ParameterSet): number =>
    p.lambda / 4 + p.l * 32 * (1 + bitlen(p.gamma1 - 1)) + p.omega + p.k,
};

/** Sanity: the table agrees with the implementation it describes. */
export const implementationSizes = ML_DSA_PARAMS;
