/**
 * Tab 4 — NIST PQC Trio Completion Panel
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

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
      <p class="text-sm text-muted mb-1">How all three standards work together for authenticated, confidential, post-quantum secure communication.</p>

      <div class="workflow">
        <div class="wf-step">Bob publishes his <strong>ML-DSA public key</strong> (identity) and <strong>ML-KEM public key</strong> (encryption).</div>
        <div class="wf-step">Alice verifies Bob's <strong>ML-DSA signature</strong> on his ML-KEM public key — authenticated key exchange.</div>
        <div class="wf-step">Alice <strong>encapsulates a shared secret</strong> using Bob's ML-KEM public key (kyber-vault).</div>
        <div class="wf-step">Alice encrypts her message with <strong>AES-256-GCM</strong> using the shared secret.</div>
        <div class="wf-step">Alice <strong>signs the ciphertext</strong> with her ML-DSA private key.</div>
        <div class="wf-step">Bob <strong>verifies</strong> Alice's signature, <strong>decapsulates</strong> the shared secret, <strong>decrypts</strong> the message.</div>
        <div class="wf-step"><strong>Result:</strong> authenticated, confidential, post-quantum secure end-to-end communication.</div>
      </div>
    </div>

    <div class="card">
      <h2>Where These Standards Are Deployed</h2>
      <div class="info-grid">
        <div class="info-item" style="text-align:left">
          <div class="label">ML-KEM (FIPS 203)</div>
          <p class="text-sm text-muted mt-1">Chrome TLS 1.3, Cloudflare, AWS KMS, Signal Protocol (PQXDH).</p>
        </div>
        <div class="info-item" style="text-align:left">
          <div class="label">ML-DSA (FIPS 204)</div>
          <p class="text-sm text-muted mt-1">NIST recommended for code signing. Certificate authorities beginning PQ transition.</p>
        </div>
        <div class="info-item" style="text-align:left">
          <div class="label">SLH-DSA (FIPS 205)</div>
          <p class="text-sm text-muted mt-1">Recommended for long-lived signatures and document archives. Conservative alternative to ML-DSA.</p>
        </div>
      </div>
      <p class="text-sm text-muted mt-1"><em>NIST explicitly recommends ML-DSA as the primary post-quantum signature scheme and SLH-DSA as a conservative backup.</em></p>
    </div>

    <div class="card">
      <h2>NIST PQC Timeline</h2>
      <div class="timeline">
        <div class="tl-item"><span class="tl-year">2016</span> — NIST announces Post-Quantum Cryptography standardization process</div>
        <div class="tl-item"><span class="tl-year">2017</span> — First round: 69 submissions received, including CRYSTALS-Dilithium</div>
        <div class="tl-item"><span class="tl-year">2019</span> — Second round: 26 candidates advance</div>
        <div class="tl-item"><span class="tl-year">2020</span> — Third round: 7 finalists and 8 alternates selected</div>
        <div class="tl-item"><span class="tl-year">2022</span> — CRYSTALS-Dilithium, CRYSTALS-Kyber, and SPHINCS+ selected for standardization</div>
        <div class="tl-item"><span class="tl-year">Aug 2024</span> — <strong>FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA)</strong> published as final standards</div>
      </div>
    </div>
  `;
}
