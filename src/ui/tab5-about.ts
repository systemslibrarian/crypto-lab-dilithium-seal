/**
 * Tab 5 — About & References
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

export function renderAbout(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card">
      <h2>About dilithium-seal</h2>
      <p class="text-sm text-muted">A browser-based demonstration of <strong>ML-DSA (CRYSTALS-Dilithium)</strong> — the lattice-based digital signature scheme standardized as <strong>NIST FIPS 204</strong> in August 2024.</p>
      <p class="text-sm text-muted mt-1">Part of the <a href="https://github.com/systemslibrarian/crypto-compare" target="_blank" rel="noopener">crypto-compare</a> portfolio, completing the NIST PQC trio alongside <strong>kyber-vault</strong> (ML-KEM, FIPS 203) and <strong>sphincs-ledger</strong> (SLH-DSA, FIPS 205).</p>
    </div>

    <div class="card">
      <h2>ML-DSA Parameter Reference (FIPS 204 Table 1)</h2>
      <table class="comparison-table">
        <caption class="sr-only">ML-DSA parameter sets from FIPS 204 Table 1: security category, key sizes, signature size, dimensions, and modulus.</caption>
        <thead>
          <tr>
            <th scope="col">Parameter Set</th>
            <th scope="col">Security Cat.</th>
            <th scope="col">Public Key</th>
            <th scope="col">Private Key</th>
            <th scope="col">Signature</th>
            <th scope="col">(k, ℓ)</th>
            <th scope="col">q</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row"><strong>ML-DSA-44</strong></th>
            <td>2</td>
            <td>1,312 B</td>
            <td>2,560 B</td>
            <td>2,420 B</td>
            <td>(4, 4)</td>
            <td>8,380,417</td>
          </tr>
          <tr>
            <th scope="row"><strong>ML-DSA-65</strong></th>
            <td>3</td>
            <td>1,952 B</td>
            <td>4,032 B</td>
            <td>3,309 B</td>
            <td>(6, 5)</td>
            <td>8,380,417</td>
          </tr>
          <tr>
            <th scope="row"><strong>ML-DSA-87</strong></th>
            <td>5</td>
            <td>2,592 B</td>
            <td>4,896 B</td>
            <td>4,627 B</td>
            <td>(8, 7)</td>
            <td>8,380,417</td>
          </tr>
        </tbody>
      </table>
      <p class="text-sm text-muted mt-1">Source: <a href="https://csrc.nist.gov/pubs/fips/204/final" target="_blank" rel="noopener">NIST FIPS 204</a>, Table 1. All sizes in bytes. q = 2²³ − 2¹³ + 1.</p>
    </div>

    <div class="card">
      <h2>References</h2>
      <ul class="text-sm text-muted" style="list-style: disc; padding-left: 1.5rem; line-height: 2;">
        <li><a href="https://csrc.nist.gov/pubs/fips/204/final" target="_blank" rel="noopener">NIST FIPS 204 — ML-DSA (Module-Lattice-Based Digital Signature Standard)</a></li>
        <li><a href="https://csrc.nist.gov/pubs/fips/203/final" target="_blank" rel="noopener">NIST FIPS 203 — ML-KEM (Module-Lattice-Based Key-Encapsulation Mechanism Standard)</a></li>
        <li><a href="https://csrc.nist.gov/pubs/fips/205/final" target="_blank" rel="noopener">NIST FIPS 205 — SLH-DSA (Stateless Hash-Based Digital Signature Standard)</a></li>
        <li><a href="https://pq-crystals.org/dilithium/" target="_blank" rel="noopener">CRYSTALS-Dilithium — original submission to NIST PQC</a></li>
        <li><a href="https://www.npmjs.com/package/@noble/post-quantum" target="_blank" rel="noopener">@noble/post-quantum — npm package by Paul Miller</a></li>
      </ul>
    </div>

    <div class="card">
      <h2>Implementation</h2>
      <p class="text-sm text-muted">ML-DSA operations are provided by <a href="https://www.npmjs.com/package/@noble/post-quantum" target="_blank" rel="noopener"><code>@noble/post-quantum</code></a> by Paul Miller. This is a pure JavaScript implementation — no WebAssembly or native modules — ensuring full browser compatibility.</p>
      <p class="text-sm text-muted mt-1">SHA-256 hashing for document sealing uses the Web Crypto API (<code>crypto.subtle.digest</code>).</p>
      <p class="text-sm text-muted mt-1">This demo runs fully offline — no external CDN dependencies at runtime.</p>
    </div>

    <div class="card" style="text-align: center;">
      <p class="text-sm text-muted"><em>"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31</em></p>
    </div>
  `;
}
