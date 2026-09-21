/**
 * Tab 2 — ML-DSA vs Classical Signatures Comparison
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import { cite } from './provenance';
import { renderBenchmarkPanel, bindBenchmarkPanel } from './benchmark-panel';
import { fidelityBadge } from './fidelity';

interface SchemeInfo {
  name: string;
  publicKey: number;
  signature: number;
  quantumSafe: boolean;
  assumption: string;
  cssClass: string;
}

const SCHEMES: SchemeInfo[] = [
  { name: 'RSA-PSS-2048', publicKey: 256, signature: 256, quantumSafe: false, assumption: 'Factoring', cssClass: 'classical' },
  { name: 'ECDSA P-256', publicKey: 64, signature: 64, quantumSafe: false, assumption: 'ECDLP', cssClass: 'classical' },
  { name: 'Ed25519', publicKey: 32, signature: 64, quantumSafe: false, assumption: 'ECDLP', cssClass: 'classical' },
  { name: 'ML-DSA-44', publicKey: 1312, signature: 2420, quantumSafe: true, assumption: 'Module-LWE + Module-SIS', cssClass: 'lattice' },
  { name: 'ML-DSA-65', publicKey: 1952, signature: 3309, quantumSafe: true, assumption: 'Module-LWE + Module-SIS', cssClass: 'lattice' },
  { name: 'ML-DSA-87', publicKey: 2592, signature: 4627, quantumSafe: true, assumption: 'Module-LWE + Module-SIS', cssClass: 'lattice' },
  { name: 'SLH-DSA-128s', publicKey: 32, signature: 7856, quantumSafe: true, assumption: 'Hash only', cssClass: 'hash-based' },
];

export function renderCompare(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card">
      <h2>ML-DSA vs Classical Signatures</h2>
      ${fidelityBadge('values', 'scheme-comparison')}
      <p class="text-sm text-muted mb-1">Size comparison across classical and post-quantum digital signature schemes. ML-DSA sizes are FIPS 204 Table 2 ${cite('sizes')}; the SLH-DSA row is FIPS 205 and the classical rows are their own standards.</p>

      <table class="comparison-table" tabindex="0">
        <caption class="sr-only">Public key size, signature size, quantum safety, and hardness assumption for classical and post-quantum signature schemes.</caption>
        <thead>
          <tr>
            <th scope="col">Scheme</th>
            <th scope="col">Public Key</th>
            <th scope="col">Signature</th>
            <th scope="col">Quantum Safe</th>
            <th scope="col">Assumption</th>
          </tr>
        </thead>
        <tbody>
          ${SCHEMES.map((s) => `
            <tr>
              <th scope="row"><strong>${s.name}</strong></th>
              <td>${s.publicKey.toLocaleString()} B</td>
              <td>${s.signature.toLocaleString()} B</td>
              <td class="${s.quantumSafe ? 'quantum-yes' : 'quantum-no'}">${s.quantumSafe ? 'Yes' : 'No'}</td>
              <td class="text-muted">${s.assumption}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Public Key Size Comparison</h2>
      ${fidelityBadge('values', 'pk-chart')}
      <div class="bar-chart" id="pk-bars"></div>
    </div>

    <div class="card">
      <h2>Signature Size Comparison</h2>
      ${fidelityBadge('values', 'sig-chart')}
      <div class="bar-chart" id="sig-bars"></div>
    </div>

    ${renderBenchmarkPanel()}

    <div class="card">
      <h2>When to Use ML-DSA vs SLH-DSA</h2>
      ${fidelityBadge('concept', 'when-to-use')}
      <div class="info-grid">
        <div class="info-item info-item-left">
          <div class="label">ML-DSA (FIPS 204)</div>
          <p class="text-sm text-muted mt-1">Faster signing and verification, moderate signature size. NIST describes FIPS 204 as "the primary standard for protecting digital signatures" ${cite('primaryStandard')}.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">SLH-DSA (FIPS 205)</div>
          <p class="text-sm text-muted mt-1">Slower, larger signatures, hash-only assumption. NIST describes FIPS 205 as "a backup method in case ML-DSA proves vulnerable" ${cite('primaryStandard')}.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Use Both</div>
          <p class="text-sm text-muted mt-1">Sign with ML-DSA for performance, archive with SLH-DSA for longevity. Defense-in-depth against future cryptanalysis.</p>
        </div>
      </div>
    </div>
  `;

  renderBars('pk-bars', SCHEMES.map((s) => ({ label: s.name, value: s.publicKey, cssClass: s.cssClass })));
  renderBars('sig-bars', SCHEMES.map((s) => ({ label: s.name, value: s.signature, cssClass: s.cssClass })));

  bindBenchmarkPanel();
}

function renderBars(
  containerId: string,
  data: { label: string; value: number; cssClass: string }[]
): void {
  const container = document.getElementById(containerId)!;
  const max = Math.max(...data.map((d) => d.value));

  data.forEach((d) => {
    const pct = Math.max((d.value / max) * 100, 3);
    const row = document.createElement('div');
    row.className = 'bar-row';
    // role="img" + aria-label makes each bar a single labeled unit for screen
    // readers; the value lives outside the fill so its contrast never depends
    // on the bar colour (WCAG 1.4.3).
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', `${d.label}: ${d.value.toLocaleString()} bytes`);
    row.innerHTML = `
      <span class="bar-label" aria-hidden="true">${d.label}</span>
      <div class="bar-track" aria-hidden="true">
        <div class="bar-fill ${d.cssClass}"></div>
      </div>
      <span class="bar-value" aria-hidden="true">${d.value.toLocaleString()} B</span>
    `;
    // The width is data, not style, so it cannot live in the stylesheet — and it
    // must not be a `style="width: …"` attribute either, because the CSP would
    // then need `style-src 'unsafe-inline'`. CSP governs inline style ATTRIBUTES
    // parsed from markup, not CSSOM writes, so setting the property here is both
    // policy-clean and the same pixels.
    row.querySelector<HTMLElement>('.bar-fill')!.style.width = `${pct}%`;
    container.appendChild(row);
  });
}
