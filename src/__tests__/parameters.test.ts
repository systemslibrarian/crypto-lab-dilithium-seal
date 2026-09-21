/**
 * The FIPS 204 parameter table, checked three independent ways.
 *
 * A table of nineteen numbers transcribed from a PDF is exactly the kind of
 * artifact that looks right. Reading it again does not help — the second read
 * makes the same mistake as the first. So the values are checked against
 * things that were not transcribed with them:
 *
 *   1. INTERNAL CONSISTENCY. β must equal τ·η, γ₂ must be the stated fraction
 *      of q−1, q must be 2²³ − 2¹³ + 1.
 *   2. THE STANDARD'S OWN FORMULAS. FIPS 204 gives the byte lengths
 *      algebraically in the Input/Output lines of Algorithms 1, 2 and 3 —
 *      pk ∈ 𝔹^(32+32k(bitlen(q−1)−d)), and so on. The sizes in Table 2 can
 *      therefore be RECOMPUTED from the parameters in Table 1. A single
 *      mistyped parameter breaks at least one size.
 *   3. THE RUNNING IMPLEMENTATION, which must emit exactly these byte counts.
 *
 * A transcription that survives all three is very unlikely to be wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  DROPPED_BITS,
  PARAMETER_SETS,
  Q,
  RING_DIMENSION,
  ZETA,
  bitlen,
  bySet,
  sizeFormulas,
} from '../data/parameters';
import { ML_DSA_PARAMS, generateKeyPair, sign } from '../crypto/mldsa';
import { renderParameterTable } from '../ui/parameter-table';
import { FIDELITY, fidelityBadge, fidelityLegend } from '../ui/fidelity';

describe('shared parameters', () => {
  it('has the modulus FIPS 204 defines, in the form it defines it', () => {
    expect(Q).toBe(2 ** 23 - 2 ** 13 + 1);
    expect(Q).toBe(8380417);
    expect(bitlen(Q - 1)).toBe(23);
  });

  it('works over the ring ℤq[X]/(X²⁵⁶+1)', () => {
    // FIPS 204 §2.3. This is the parameter every reduced model on the page
    // shrinks, so it is the one a learner most needs stated exactly.
    expect(RING_DIMENSION).toBe(256);
  });

  it('drops 13 bits of t and uses ζ = 1753', () => {
    expect(DROPPED_BITS).toBe(13);
    expect(ZETA).toBe(1753);
    // ζ is a 512th root of unity mod q: ζ^512 ≡ 1 and ζ^256 ≢ 1.
    const powMod = (base: bigint, exp: bigint, mod: bigint): bigint => {
      let result = 1n;
      let b = base % mod;
      let e = exp;
      while (e > 0n) {
        if (e & 1n) result = (result * b) % mod;
        b = (b * b) % mod;
        e >>= 1n;
      }
      return result;
    };
    expect(powMod(BigInt(ZETA), 512n, BigInt(Q))).toBe(1n);
    expect(powMod(BigInt(ZETA), 256n, BigInt(Q))).not.toBe(1n);
  });
});

describe.each(PARAMETER_SETS)('$name', (p) => {
  it('is internally consistent: β = τ·η', () => {
    expect(p.beta).toBe(p.tau * p.eta);
  });

  it('has a γ₂ that is the stated fraction of q−1', () => {
    const divisor = p.name === 'ML-DSA-44' ? 88 : 32;
    expect(p.gamma2).toBe((Q - 1) / divisor);
    expect(Number.isInteger(p.gamma2)).toBe(true);
  });

  it('has a γ₁ that is a power of two, as Table 1 writes it', () => {
    expect(Math.log2(p.gamma1) % 1).toBe(0);
    expect([2 ** 17, 2 ** 19]).toContain(p.gamma1);
  });

  it('leaves a positive rejection bound γ₁ − β', () => {
    expect(p.gamma1 - p.beta).toBeGreaterThan(0);
    // The bound has to be large relative to β, or nearly every attempt aborts.
    expect(p.beta / p.gamma1).toBeLessThan(0.01);
  });

  it('reproduces the FIPS 204 public-key size from its own parameters', () => {
    expect(sizeFormulas.publicKey(p)).toBe(p.publicKeyBytes);
  });

  it('reproduces the FIPS 204 private-key size from its own parameters', () => {
    expect(sizeFormulas.privateKey(p)).toBe(p.privateKeyBytes);
  });

  it('reproduces the FIPS 204 signature size from its own parameters', () => {
    expect(sizeFormulas.signature(p)).toBe(p.signatureBytes);
  });

  it('agrees with the size table the crypto wrapper uses', () => {
    const impl = ML_DSA_PARAMS[p.variant];
    expect(p.publicKeyBytes).toBe(impl.publicKey);
    expect(p.privateKeyBytes).toBe(impl.privateKey);
    expect(p.signatureBytes).toBe(impl.signature);
    expect(p.securityCategory).toBe(impl.securityCategory);
  });

  it('agrees with the bytes the implementation actually produces', async () => {
    const kp = await generateKeyPair(p.variant);
    expect(kp.publicKey.length).toBe(p.publicKeyBytes);
    expect(kp.privateKey.length).toBe(p.privateKeyBytes);
    const { signature } = await sign(kp.privateKey, new TextEncoder().encode('table check'), p.variant);
    expect(signature.length).toBe(p.signatureBytes);
  });

  it('records both the published repetitions and the pending erratum', () => {
    expect(p.repetitionsPublished).toBeGreaterThan(0);
    expect(p.repetitionsPendingErratum).toBeGreaterThan(0);
    // They differ, or there would be nothing to record.
    expect(p.repetitionsPendingErratum).not.toBe(p.repetitionsPublished);
  });
});

describe('the three parameter sets as a family', () => {
  it('names them after their own (k, ℓ), as FIPS 204 says it does', () => {
    // "The names of the parameter sets are of the form ML-DSA-kℓ."
    for (const p of PARAMETER_SETS) {
      expect(p.name).toBe(`ML-DSA-${p.k}${p.l}`);
    }
  });

  it('assigns the security categories FIPS 204 claims', () => {
    expect(bySet('ml-dsa-44').securityCategory).toBe(2);
    expect(bySet('ml-dsa-65').securityCategory).toBe(3);
    expect(bySet('ml-dsa-87').securityCategory).toBe(5);
  });

  it('has challenge entropy of at least λ bits in every set', () => {
    // Table 1 lists both; the challenge must carry at least the collision
    // strength claimed for c̃, or λ would be unachievable.
    for (const p of PARAMETER_SETS) {
      expect(p.challengeEntropy, p.name).toBeGreaterThanOrEqual(p.lambda);
    }
  });

  it('grows monotonically in the things a reader compares', () => {
    const order = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'];
    expect(PARAMETER_SETS.map((p) => p.name)).toEqual(order);
    for (const field of [
      'k',
      'l',
      'lambda',
      'tau',
      'securityCategory',
      'publicKeyBytes',
      'privateKeyBytes',
      'signatureBytes',
    ] as const) {
      const values = PARAMETER_SETS.map((p) => p[field]);
      expect([...values].sort((a, b) => a - b), field).toEqual(values);
    }
    // η and ω deliberately do NOT increase — 4 then 2, and 80 then 55 then 75.
    // Asserted so nobody "fixes" the table into a tidier shape that is wrong.
    expect(PARAMETER_SETS.map((p) => p.eta)).toEqual([2, 4, 2]);
    expect(PARAMETER_SETS.map((p) => p.omega)).toEqual([80, 55, 75]);
  });
});

describe('the rendered parameter table', () => {
  const html = renderParameterTable();

  it('carries every parameter Priority 6 requires', () => {
    for (const needle of [
      'Ring dimension',
      'Modulus',
      'Module dimensions',
      'Private-key coefficient range',
      'Challenge weight',
      'Mask coefficient range',
      'Low-order rounding range',
      'Rejection shift bound',
      'Rejection bound on z',
      'Maximum 1s in the hint',
      'NIST security category',
      'Public key (bytes)',
      'Private key (bytes)',
      'Signature (bytes)',
    ]) {
      expect(html, needle).toContain(needle);
    }
  });

  it('prints one column per parameter set, with a caption naming the contents', () => {
    for (const p of PARAMETER_SETS) expect(html).toContain(`<th scope="col">${p.name}</th>`);
    expect(html).toContain('<caption class="sr-only">');
    expect(html).toContain('id="fips204-parameter-table"');
  });

  it('shows the pending erratum beside the published repetitions', () => {
    for (const p of PARAMETER_SETS) {
      expect(html).toContain(`${p.repetitionsPublished} <span class="text-yellow">(errata: ${p.repetitionsPendingErratum})`);
    }
  });
});

describe('fidelity labels', () => {
  it('defines exactly the four categories, each with a meaning in words', () => {
    expect(Object.keys(FIDELITY).sort()).toEqual(['concept', 'model', 'operation', 'values']);
    for (const [level, meta] of Object.entries(FIDELITY)) {
      expect(meta.label.length, level).toBeGreaterThan(10);
      // The meaning is spelled out in the badge itself. A tooltip would not be
      // read, and a colour alone would fail WCAG 1.4.1.
      expect(meta.meaning.length, level).toBeGreaterThan(80);
    }
  });

  it('says plainly that the reduced model is not the real signer', () => {
    expect(FIDELITY.model.label).toMatch(/not the real signer/i);
    expect(FIDELITY.model.meaning).toMatch(/NOT the code that signs/);
  });

  it('says the conceptual label executes nothing', () => {
    expect(FIDELITY.concept.label).toMatch(/executes no ML-DSA internals/i);
  });

  it('renders a badge carrying its level in the markup and in the text', () => {
    const html = fidelityBadge('model', 'demo');
    expect(html).toContain('data-fidelity="model"');
    expect(html).toContain('id="fidelity-demo"');
    expect(html).toContain('role="note"');
    expect(html).toContain(FIDELITY.model.label);
    expect(html).toContain(FIDELITY.model.meaning);
  });

  it('renders a legend explaining all four', () => {
    const legend = fidelityLegend();
    for (const meta of Object.values(FIDELITY)) {
      expect(legend).toContain(meta.label);
      expect(legend).toContain(meta.meaning);
    }
  });
});
