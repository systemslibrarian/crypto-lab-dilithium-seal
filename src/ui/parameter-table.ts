/**
 * The complete FIPS 204 parameter table.
 *
 * The page previously showed seven columns: category, three sizes, (k, ℓ) and
 * q. That is enough to look authoritative and not enough to check anything —
 * it omitted every parameter that makes ML-DSA the scheme it is (τ, η, γ₁, γ₂,
 * β, ω, λ, d) and the ring dimension the whole construction sits in.
 *
 * It is rendered from `src/data/parameters.ts`, whose values are verified three
 * ways by `src/__tests__/parameters.test.ts`: internally (β = τ·η, γ₂ as a
 * fraction of q−1), against FIPS 204's own size formulas, and against the byte
 * counts the running implementation emits.
 */

import { PARAMETER_SETS, Q, RING_DIMENSION, DROPPED_BITS, ZETA } from '../data/parameters';
import { escapeHTML } from './helpers';

interface Row {
  label: string;
  /** FIPS 204 symbol, where there is one. */
  symbol?: string;
  value: (index: number) => string;
  /** Rendered in a quieter tone: informational rather than algorithmic. */
  informational?: boolean;
}

const fmt = (n: number): string => n.toLocaleString('en-GB');

const ROWS: Row[] = [
  { label: 'Ring dimension (coefficients per polynomial)', symbol: 'n', value: () => String(RING_DIMENSION) },
  { label: 'Modulus', symbol: 'q', value: () => fmt(Q) },
  { label: '512th root of unity (NTT)', symbol: 'ζ', value: () => String(ZETA) },
  { label: 'Dropped bits of t', symbol: 'd', value: () => String(DROPPED_BITS) },
  { label: 'Module dimensions of A', symbol: '(k, ℓ)', value: (i) => `(${PARAMETER_SETS[i].k}, ${PARAMETER_SETS[i].l})` },
  { label: 'Private-key coefficient range', symbol: 'η', value: (i) => String(PARAMETER_SETS[i].eta) },
  { label: 'Challenge weight (±1 coefficients in c)', symbol: 'τ', value: (i) => String(PARAMETER_SETS[i].tau) },
  { label: 'Collision strength of c̃', symbol: 'λ', value: (i) => String(PARAMETER_SETS[i].lambda) },
  { label: 'Mask coefficient range', symbol: 'γ₁', value: (i) => (PARAMETER_SETS[i].gamma1 === 2 ** 17 ? '2¹⁷ = 131,072' : '2¹⁹ = 524,288') },
  { label: 'Low-order rounding range', symbol: 'γ₂', value: (i) => (PARAMETER_SETS[i].gamma2 === (Q - 1) / 88 ? '(q−1)/88 = 95,232' : '(q−1)/32 = 261,888') },
  { label: 'Rejection shift bound', symbol: 'β = τ·η', value: (i) => String(PARAMETER_SETS[i].beta) },
  { label: 'Rejection bound on z', symbol: '‖z‖∞ < γ₁ − β', value: (i) => fmt(PARAMETER_SETS[i].gamma1 - PARAMETER_SETS[i].beta) },
  { label: 'Maximum 1s in the hint', symbol: 'ω', value: (i) => String(PARAMETER_SETS[i].omega) },
  { label: 'Challenge entropy (bits)', value: (i) => String(PARAMETER_SETS[i].challengeEntropy), informational: true },
  {
    label: 'Expected signing repetitions',
    value: (i) =>
      `${PARAMETER_SETS[i].repetitionsPublished} <span class="text-yellow">(errata: ${PARAMETER_SETS[i].repetitionsPendingErratum})</span>`,
    informational: true,
  },
  { label: 'NIST security category', value: (i) => String(PARAMETER_SETS[i].securityCategory) },
  { label: 'Public key (bytes)', value: (i) => fmt(PARAMETER_SETS[i].publicKeyBytes) },
  { label: 'Private key (bytes)', value: (i) => fmt(PARAMETER_SETS[i].privateKeyBytes) },
  { label: 'Signature (bytes)', value: (i) => fmt(PARAMETER_SETS[i].signatureBytes) },
];

export function renderParameterTable(): string {
  const head = PARAMETER_SETS.map((p) => `<th scope="col">${escapeHTML(p.name)}</th>`).join('');
  const body = ROWS.map((row) => {
    const label = row.symbol
      ? `${escapeHTML(row.label)} <span class="mono param-symbol">${row.symbol}</span>`
      : escapeHTML(row.label);
    const cells = PARAMETER_SETS.map((_, i) => `<td>${row.value(i)}</td>`).join('');
    return `<tr${row.informational ? ' class="param-informational"' : ''}><th scope="row">${label}</th>${cells}</tr>`;
  }).join('');

  return `
    <table class="comparison-table table-prose" id="fips204-parameter-table" tabindex="0">
      <caption class="sr-only">
        The complete FIPS 204 parameter set for ML-DSA-44, ML-DSA-65 and ML-DSA-87: ring dimension,
        modulus, module dimensions, sampling parameters, challenge weight, rejection bounds,
        security category and key and signature sizes.
      </caption>
      <thead><tr><th scope="col">Parameter</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}
