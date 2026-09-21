/**
 * How to choose a parameter set.
 *
 * The page previously said, next to a slower ML-DSA-87 signing time, that
 * "ML-DSA-87 prioritizes security over speed". That reads as a ranking with
 * ML-DSA-87 at the top and the others as compromises, which is not what FIPS 204
 * says and not how the choice is actually made.
 *
 * All three parameter sets are standardized, and each is claimed to meet a
 * different NIST security strength category. A category is a requirement handed
 * down by a protocol, a policy or a procurement rule — not a dial to turn up.
 * Choosing ML-DSA-87 where a protocol profile specifies ML-DSA-65 produces
 * signatures the other side will reject, which is worse than either on any axis.
 *
 * So the guidance below is framed as four questions with answers, and the
 * summary line for each set says what it is *for* rather than where it sits in
 * an imaginary ranking.
 */

import { PARAMETER_SETS } from '../data/parameters';
import { escapeHTML } from './helpers';
import { cite } from './provenance';
import { fidelityBadge } from './fidelity';

interface Profile {
  name: string;
  category: number;
  /** What this set is for — never "better" or "worse". */
  suits: string;
}

const PROFILES: Profile[] = [
  {
    name: 'ML-DSA-44',
    category: 2,
    suits:
      'Protocols that specify category 2, and contexts where signature and key size dominate the ' +
      'cost — high-volume handshakes, constrained links, embedded storage.',
  },
  {
    name: 'ML-DSA-65',
    category: 3,
    suits:
      'Protocols that specify category 3. Several early post-quantum protocol profiles name this ' +
      'set, which makes it a common interoperability default rather than a compromise.',
  },
  {
    name: 'ML-DSA-87',
    category: 5,
    suits:
      'Protocols that specify category 5, and data whose confidentiality or authenticity must ' +
      'survive decades. It is not a general upgrade: it is the answer when category 5 is the ' +
      'requirement.',
  },
];

const QUESTIONS: Array<{ question: string; answer: string }> = [
  {
    question: 'What does the protocol or profile you must interoperate with specify?',
    answer:
      'This decides it more often than anything else. A certificate profile, a protocol ' +
      'specification or a procurement rule that names a parameter set has named it: sending ' +
      'ML-DSA-87 where the other side expects ML-DSA-65 does not produce a stronger signature, it ' +
      'produces one that is rejected.',
  },
  {
    question: 'Which NIST security strength category are you required to meet?',
    answer:
      'FIPS 204 claims category 2 for ML-DSA-44, category 3 for ML-DSA-65 and category 5 for ' +
      'ML-DSA-87. A category is a floor set by a policy, not a preference — and FIPS 204 declines ' +
      'to restate these as bit counts, saying security strength here "is not described by a ' +
      'single number".',
  },
  {
    question: 'How long must the signature remain meaningful?',
    answer:
      'A signature on a firmware image or a legal record that must still verify in thirty years ' +
      'faces a different adversary from a TLS handshake that matters for seconds. Long data ' +
      'lifetimes are the strongest honest argument for a higher category.',
  },
  {
    question: 'What do the sizes and timings cost you *in your system*?',
    answer:
      'An ML-DSA-87 signature is 4,627 bytes against ML-DSA-44’s 2,420. Whether that is ' +
      'irrelevant or fatal depends on whether it rides in a database row or in every packet of a ' +
      'handshake. Run the benchmark on the Compare tab and read the sizes beside the timings.',
  },
];

export function renderSelectorGuidance(): string {
  const rows = PROFILES.map((profile) => {
    const p = PARAMETER_SETS.find((set) => set.name === profile.name)!;
    return `
      <tr>
        <th scope="row">${escapeHTML(profile.name)}</th>
        <td>Category ${profile.category}</td>
        <td class="bench-number">${p.publicKeyBytes.toLocaleString('en-GB')}</td>
        <td class="bench-number">${p.signatureBytes.toLocaleString('en-GB')}</td>
        <td>${escapeHTML(profile.suits)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="card" id="selector-guidance">
      <h2>Choosing a parameter set</h2>
      ${fidelityBadge('concept', 'selector-guidance')}
      <p class="text-sm text-muted mb-1">
        <strong>ML-DSA-87 is not "the best one".</strong> All three are standardized in FIPS 204 and
        each is claimed to meet a different NIST security strength category ${cite('categories')}.
        A category is a requirement a protocol or policy hands you, not a dial to turn up — and
        picking a higher one than your counterparty expects produces signatures they reject.
      </p>

      <div class="selector-questions">
        ${QUESTIONS.map(
          (q, i) => `
          <div class="selector-question">
            <h3 class="selector-question-title">${i + 1}. ${escapeHTML(q.question)}</h3>
            <p class="text-sm text-muted">${escapeHTML(q.answer)}</p>
          </div>`
        ).join('')}
      </div>

      <table class="comparison-table table-prose" id="selector-profiles" tabindex="0">
        <caption class="sr-only">
          Each ML-DSA parameter set with its NIST security category, public key and signature size,
          and the kind of deployment it suits.
        </caption>
        <thead>
          <tr>
            <th scope="col">Parameter set</th>
            <th scope="col">Security category</th>
            <th scope="col">Public key (B)</th>
            <th scope="col">Signature (B)</th>
            <th scope="col">Suits</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
