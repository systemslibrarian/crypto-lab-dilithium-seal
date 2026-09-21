/**
 * Fidelity labels: what is real ML-DSA, and what is a picture of it.
 *
 * This demo mixes four very different kinds of thing on the same page, in the
 * same visual style, and two of them are not ML-DSA at all:
 *
 *   - `operation`  the real FIPS 204 algorithms, executed
 *   - `values`     real numbers — measured from those operations, or taken from
 *                  FIPS 204 — drawn as tables and charts
 *   - `model`      a deliberately reduced model with toy parameters
 *   - `concept`    a diagram or walkthrough that executes nothing
 *
 * Before these labels, the Fiat-Shamir animator carried one grey line of
 * caveat BELOW its controls, and the Module-LWE panel — a 3×3 system modulo 97
 * with a hand-picked secret — carried no caveat at all. It opened "ML-DSA's
 * public key is t = A·s + e" and then showed nine small numbers. A learner had
 * no way to tell that from the panel three tabs away where a real 1952-byte key
 * is generated.
 *
 * A label is only worth having if it is impossible to miss and impossible to
 * misread, so each one states what it means in words rather than relying on a
 * colour, and the reduced models carry the toy parameters right next to the
 * real ones.
 */

import { escapeHTML } from './helpers';

export type Fidelity = 'operation' | 'values' | 'model' | 'concept';

interface FidelityMeta {
  label: string;
  /** Expanded in the badge itself, not a tooltip — tooltips are not read. */
  meaning: string;
  icon: string;
}

export const FIDELITY: Record<Fidelity, FidelityMeta> = {
  operation: {
    label: 'Real FIPS 204 operation',
    meaning:
      'This runs the actual ML-DSA algorithm from the standard, on real key material, in your ' +
      'browser. Nothing here is simulated.',
    icon: '●',
  },
  values: {
    label: 'Real values, visualized',
    meaning:
      'Every number shown is either measured from a real ML-DSA operation or transcribed from ' +
      'FIPS 204. The drawing is a presentation choice; the numbers are not.',
    icon: '▦',
  },
  model: {
    label: 'Reduced educational model — not the real signer',
    meaning:
      'Deliberately shrunk so the arithmetic fits on screen. The parameters are toy-sized and ' +
      'the structure is simplified. This is NOT the code that signs anything on this page.',
    icon: '▲',
  },
  concept: {
    label: 'Conceptual — executes no ML-DSA internals',
    meaning:
      'A diagram or walkthrough. It describes what the algorithm does; it does not run any part ' +
      'of it.',
    icon: '◇',
  },
};

/**
 * The badge. `id` lets tests assert a specific panel carries a specific label.
 *
 * `role="note"` rather than a bare div: this is an aside about the content that
 * follows, and a screen-reader user meets it in the same order a sighted reader
 * does.
 */
export function fidelityBadge(level: Fidelity, id?: string): string {
  const meta = FIDELITY[level];
  return `
    <div class="fidelity fidelity-${level}" role="note"${id ? ` id="fidelity-${escapeHTML(id)}"` : ''}
         data-fidelity="${level}">
      <span class="fidelity-label">
        <span aria-hidden="true">${meta.icon}</span> ${escapeHTML(meta.label)}
      </span>
      <span class="fidelity-meaning">${escapeHTML(meta.meaning)}</span>
    </div>`;
}

/** The legend, rendered once so the four labels are explained in one place. */
export function fidelityLegend(): string {
  const rows = (Object.keys(FIDELITY) as Fidelity[])
    .map(
      (level) => `
      <tr>
        <th scope="row"><span class="fidelity-chip fidelity-${level}">
          <span aria-hidden="true">${FIDELITY[level].icon}</span> ${escapeHTML(FIDELITY[level].label)}
        </span></th>
        <td>${escapeHTML(FIDELITY[level].meaning)}</td>
      </tr>`
    )
    .join('');
  return `
    <div class="card" id="fidelity-legend">
      <h2>What on this page is real ML-DSA, and what is a picture of it</h2>
      <p class="text-sm text-muted mb-1">
        Every panel in this demo carries one of these four labels. Two of them are not ML-DSA.
      </p>
      <table class="comparison-table table-prose" tabindex="0">
        <caption class="sr-only">The four fidelity labels used throughout this demo and what each one means.</caption>
        <thead><tr><th scope="col">Label</th><th scope="col">What it means</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
