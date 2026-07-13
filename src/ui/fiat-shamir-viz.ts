/**
 * Fiat-Shamir-with-aborts visualization for the "Signing" step.
 *
 * IMPORTANT — honesty note: the animated numbers below are computed live in the
 * browser by REAL modular arithmetic over a small illustrative ring. They are a
 * faithful *scale model* of the exact same y / w = Ay / c / z = y + c·s₁ loop
 * and the exact same rejection bound (‖z‖∞ ≥ γ₁ − β) that FIPS 204 ML-DSA uses.
 * The parameters are shrunk (small modulus, tiny vectors) so a learner can SEE
 * every coefficient, but nothing is faked, hardcoded, or pre-baked: press "Sign"
 * and the reject-and-retry loop runs for real, rejecting oversized z on the fly.
 *
 * The spec-accurate, KAT-backed signer stays in src/crypto/mldsa.ts (@noble).
 * This module never touches that path — it only illustrates the mechanism.
 */

// ── Small illustrative parameters (real math, tiny numbers) ─────────────────
// A single-polynomial "module of rank 1" so the picture stays a row of bars.
const N = 8; // coefficients per polynomial (real ML-DSA uses 256)
const Q = 257; // small prime modulus (real ML-DSA uses 8380417)
const ETA = 2; // secret coefficient bound: s₁ ∈ [-η, η]
const GAMMA1 = 24; // mask bound: y ∈ (-γ₁, γ₁]
const BETA = 6; // = τ·η worst-case shift from c·s₁ (τ=3 here)
const TAU = 3; // number of ±1 entries in the challenge c

type Poly = number[];

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Balanced representative of x mod q, in (-q/2, q/2]. */
function centered(x: number): number {
  let r = ((x % Q) + Q) % Q;
  if (r > Q / 2) r -= Q;
  return r;
}

function infNorm(p: Poly): number {
  return p.reduce((m, c) => Math.max(m, Math.abs(c)), 0);
}

/** Schoolbook negacyclic polynomial multiply in Z_q[x]/(x^N + 1). */
function polyMul(a: Poly, b: Poly): Poly {
  const out = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = i + j;
      const sign = k >= N ? -1 : 1; // x^N = -1
      out[k % N] += sign * a[i] * b[j];
    }
  }
  return out.map(centered);
}

/** A challenge c with exactly τ nonzero coefficients, each ±1 (real ML-DSA form). */
function sampleChallenge(): Poly {
  const c = new Array(N).fill(0);
  let placed = 0;
  while (placed < TAU) {
    const idx = randInt(0, N - 1);
    if (c[idx] === 0) {
      c[idx] = Math.random() < 0.5 ? -1 : 1;
      placed++;
    }
  }
  return c;
}

export interface SignAttempt {
  y: Poly;
  w: Poly; // commitment A·y (here A is a fixed public poly a)
  c: Poly;
  cs1: Poly;
  z: Poly;
  zNorm: number;
  accepted: boolean;
}

export interface SignRun {
  attempts: SignAttempt[];
  s1: Poly;
  a: Poly;
}

// A fixed "public" ring element a (stands in for the matrix A) and secret s₁.
// s₁ is small (‖s₁‖∞ ≤ η) — that is exactly what makes it hard to recover from t.
const A_PUBLIC: Poly = [12, 200, 47, 133, 5, 178, 96, 61];
let SECRET_S1: Poly = [2, -1, 1, -2, 1, 0, -1, 2];

/** Re-roll the secret s₁ (kept within ±η). Lets the learner see a fresh loop. */
export function rerollSecret(): void {
  SECRET_S1 = Array.from({ length: N }, () => randInt(-ETA, ETA));
}

export function getSecret(): Poly {
  return SECRET_S1.slice();
}

/**
 * Run the honest Fiat-Shamir-with-aborts loop until one attempt is accepted.
 * Returns EVERY attempt, including rejects, so the UI can show the retry count.
 */
export function runSign(maxAttempts = 40): SignRun {
  const attempts: SignAttempt[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    // 1. Mask: sample y with coefficients in (-γ₁, γ₁].
    const y: Poly = Array.from({ length: N }, () => randInt(-GAMMA1 + 1, GAMMA1));
    // 2. Commit: w = a·y  (the module's A·y).
    const w = polyMul(A_PUBLIC, y);
    // 3. Challenge: c derived (here we sample it; real ML-DSA hashes μ‖w₁).
    const c = sampleChallenge();
    // 4. Respond: z = y + c·s₁.
    const cs1 = polyMul(c, SECRET_S1);
    const z = y.map((yi, k) => yi + cs1[k]); // no reduction: z must stay SHORT
    const zNorm = infNorm(z);
    // Reject if z is too big — this is the leak-prevention gate.
    const accepted = zNorm < GAMMA1 - BETA;
    attempts.push({ y, w, c, cs1, z, zNorm, accepted });
    if (accepted) break;
  }
  return { attempts, s1: SECRET_S1.slice(), a: A_PUBLIC.slice() };
}

export const FS_PARAMS = { N, Q, ETA, GAMMA1, BETA, TAU, REJECT_BOUND: GAMMA1 - BETA };
