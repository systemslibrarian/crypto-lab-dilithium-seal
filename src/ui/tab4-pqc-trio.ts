/**
 * Tab 4 — NIST PQC Trio Completion Panel
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import { cite } from './provenance';
import { fidelityBadge } from './fidelity';

const CRYPTO_COMPARE_BASE = 'https://github.com/systemslibrarian/crypto-compare';

export function renderPQCTrio(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card">
      <h2>The NIST Post-Quantum Cryptography Trio</h2>
      <p class="text-sm text-muted mb-1">Three standards published in August 2024 form a complete post-quantum cryptographic toolkit.</p>

      <div class="trio-grid">
        <div class="trio-card">
          <h3>ML-KEM</h3>
          <div class="fips">FIPS 203 — Key Encapsulation</div>
          <p>Lattice-based key encapsulation mechanism for establishing shared secrets. Based on Module-LWE.</p>
          <p class="mt-1"><a href="${CRYPTO_COMPARE_BASE}" target="_blank" rel="noopener">→ kyber-vault demo</a></p>
        </div>
        <div class="trio-card current">
          <h3>ML-DSA</h3>
          <div class="fips">FIPS 204 — Digital Signatures ← this demo</div>
          <p>Lattice-based digital signatures for authentication and integrity. Based on Module-LWE + Module-SIS.</p>
        </div>
        <div class="trio-card">
          <h3>SLH-DSA</h3>
          <div class="fips">FIPS 205 — Hash-Based Signatures</div>
          <p>Stateless hash-based signatures. Conservative backup — relies only on hash function security.</p>
          <p class="mt-1"><a href="${CRYPTO_COMPARE_BASE}" target="_blank" rel="noopener">→ sphincs-ledger demo</a></p>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>A Complete Post-Quantum System</h2>
      ${fidelityBadge('concept', 'workflow')}
      <p class="text-sm text-muted mb-1">How all three standards work together for authenticated, confidential, post-quantum secure communication.</p>

      <div class="workflow">
        <div class="wf-step"><span class="wf-text">Bob publishes his <strong>ML-DSA public key</strong> (identity) and <strong>ML-KEM public key</strong> (encryption).</span></div>
        <div class="wf-step"><span class="wf-text">Alice verifies Bob's <strong>ML-DSA signature</strong> on his ML-KEM public key — authenticated key exchange.</span></div>
        <div class="wf-step"><span class="wf-text">Alice <strong>encapsulates a shared secret</strong> using Bob's ML-KEM public key (kyber-vault).</span></div>
        <div class="wf-step"><span class="wf-text">Alice encrypts her message with <strong>AES-256-GCM</strong> using the shared secret.</span></div>
        <div class="wf-step"><span class="wf-text">Alice <strong>signs the ciphertext</strong> with her ML-DSA private key.</span></div>
        <div class="wf-step"><span class="wf-text">Bob <strong>verifies</strong> Alice's signature, <strong>decapsulates</strong> the shared secret, <strong>decrypts</strong> the message.</span></div>
        <div class="wf-step"><span class="wf-text"><strong>Result:</strong> authenticated, confidential, post-quantum secure end-to-end communication.</span></div>
      </div>
    </div>

    <div class="card">
      <h2>Where These Standards Are Deployed</h2>
      <div class="info-grid">
        <div class="info-item info-item-left">
          <div class="label">ML-KEM (FIPS 203)</div>
          <p class="text-sm text-muted mt-1">Deployed in browser and CDN TLS key exchange and in messaging key agreement.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">ML-DSA (FIPS 204)</div>
          <p class="text-sm text-muted mt-1">Being profiled for X.509 certificates, code signing and protocol authentication.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">SLH-DSA (FIPS 205)</div>
          <p class="text-sm text-muted mt-1">Positioned for long-lived signatures where a conservative, hash-only assumption is preferred.</p>
        </div>
      </div>
      <p class="text-sm text-muted mt-1">
        Deployment moves faster than any citation this page could pin, so the descriptions above are
        deliberately general: they are not sourced to a primary document and should not be read as
        current product claims. What <em>is</em> sourced is NIST's own transition expectation —
        classical algorithms at 112-bit strength deprecated after 2030 and disallowed after 2035
        ${cite('transition')} — and that document is still an <strong>initial public draft</strong>,
        so those dates are proposed rather than final.
      </p>
      <p class="text-sm text-muted mt-1"><em>On publication NIST described FIPS 204 as "intended as the primary standard for protecting digital signatures" and FIPS 205 as "intended as a backup method in case ML-DSA proves vulnerable."</em> ${cite('primaryStandard')}</p>
    </div>

    <div class="card">
      <h2>NIST PQC Timeline</h2>
      ${fidelityBadge('concept', 'timeline')}
      <div class="timeline">
        <div class="tl-item"><span class="tl-year">2016</span> — NIST announces Post-Quantum Cryptography standardization process</div>
        <div class="tl-item"><span class="tl-year">2017</span> — First round: 69 submissions received, including CRYSTALS-Dilithium</div>
        <div class="tl-item"><span class="tl-year">2019</span> — Second round: 26 candidates advance</div>
        <div class="tl-item"><span class="tl-year">2020</span> — Third round: 7 finalists and 8 alternates selected</div>
        <div class="tl-item"><span class="tl-year">2022</span> — CRYSTALS-Dilithium, CRYSTALS-Kyber, and SPHINCS+ selected for standardization</div>
        <div class="tl-item"><span class="tl-year">Aug 2024</span> — <strong>FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA)</strong> published as final standards. The submissions were <em>renamed and revised</em> in the process: ML-DSA is not a relabelled CRYSTALS-Dilithium ${cite('lineage')}.</div>
      </div>
    </div>
  `;
}
