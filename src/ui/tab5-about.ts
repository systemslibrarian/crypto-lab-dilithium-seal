/**
 * Tab 5 — About, standards status and references.
 *
 * The standards-status panel lives here in full; a one-line summary of it is
 * rendered beneath the tab bar on every tab by `renderStandardsStrip`, because
 * a reader who never opens this tab still needs to know which edition of
 * FIPS 204 the page describes and when it was last checked.
 */

import { cite, renderStandardsStatus } from './provenance';
import { renderImplementationIdentity } from './implementation';
import { fidelityBadge } from './fidelity';
import { renderParameterTable } from './parameter-table';

export function renderAbout(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card">
      <h2>About dilithium-seal</h2>
      ${fidelityBadge('concept', 'about')}
      <p class="text-sm text-muted">A browser-based demonstration of <strong>ML-DSA</strong> — the lattice-based digital signature scheme NIST published as <strong>FIPS 204</strong> in August 2024, standardized from the CRYSTALS-Dilithium submission ${cite('lineage')}. The operations on this page are real ML-DSA; nothing is simulated.</p>
      <p class="text-sm text-muted mt-1">Part of the <a href="https://github.com/systemslibrarian/crypto-compare" target="_blank" rel="noopener">crypto-compare</a> portfolio, completing the NIST PQC trio alongside <strong>kyber-vault</strong> (ML-KEM, FIPS 203) and <strong>sphincs-ledger</strong> (SLH-DSA, FIPS 205).</p>
    </div>

    <div class="card">
      <h2>ML-DSA Parameter Reference ${cite('parameters')}</h2>
      ${fidelityBadge('values', 'parameter-table')}
      <p class="text-sm text-muted mb-1">
        The complete parameter set for all three profiles, transcribed from FIPS 204. Every size in
        the last three rows is <em>recomputed</em> from the rows above it using the standard's own
        formulas, and checked against the byte counts this page actually produces — so a mistyped
        parameter here cannot pass unnoticed.
      </p>
      ${renderParameterTable()}
      <p class="text-sm text-muted mt-1">
        Sizes ${cite('sizes')}; parameters ${cite('parameters')}; security categories ${cite('categories')};
        the ring ℤq[X]/(X²⁵⁶+1) from §2.3. q = 2²³ − 2¹³ + 1 = 8,380,417.
      </p>
      <p class="text-sm text-muted mt-1">
        <strong>Repetitions</strong> is the one row with a pending correction: NIST's errata
        spreadsheet records the published figures as "not quite accurate" and gives 4.36, 5.14 and
        3.91. Both are shown because neither alone is the whole truth — the first is what the
        standard says today, the second is what it will say. ${cite('repetitions')}
      </p>
    </div>

    ${renderStandardsStatus()}

    <div class="card">
      <h2>References</h2>
      <ul class="text-sm text-muted ref-list">
        <li><a href="https://csrc.nist.gov/pubs/fips/204/final" target="_blank" rel="noopener">NIST FIPS 204 — ML-DSA (Module-Lattice-Based Digital Signature Standard)</a></li>
        <li><a href="https://csrc.nist.gov/pubs/fips/203/final" target="_blank" rel="noopener">NIST FIPS 203 — ML-KEM (Module-Lattice-Based Key-Encapsulation Mechanism Standard)</a></li>
        <li><a href="https://csrc.nist.gov/pubs/fips/205/final" target="_blank" rel="noopener">NIST FIPS 205 — SLH-DSA (Stateless Hash-Based Digital Signature Standard)</a></li>
        <li><a href="https://pq-crystals.org/dilithium/" target="_blank" rel="noopener">CRYSTALS-Dilithium — original submission to NIST PQC</a></li>
        <li><a href="https://www.npmjs.com/package/@noble/post-quantum" target="_blank" rel="noopener">@noble/post-quantum — npm package by Paul Miller</a></li>
      </ul>
    </div>

    ${renderImplementationIdentity()}

    <div class="card">
      <h2>Supporting operations</h2>
      <p class="text-sm text-muted">SHA-256 hashing for document sealing uses the Web Crypto API (<code>crypto.subtle.digest</code>). It is a convenience integrity check, not the security: only the ML-DSA signature proves authenticity.</p>
      <p class="text-sm text-muted mt-1">This demo runs fully offline after load — no CDN, no analytics, no runtime network request of any kind. A browser test drives the whole demo with off-origin requests blocked and asserts none was attempted.</p>
    </div>

    <div class="card card-centered">
      <p class="text-sm text-muted"><em>"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31</em></p>
    </div>
  `;
}
