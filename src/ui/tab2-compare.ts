/**
 * Tab 2 — ML-DSA vs Classical Signatures Comparison
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import { generateKeyPair, sign, type MLDSAVariant } from '../crypto/mldsa';

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
      <p class="text-sm text-muted mb-1">Size comparison across classical and post-quantum digital signature schemes.</p>

      <table class="comparison-table">
        <thead>
          <tr>
            <th>Scheme</th>
            <th>Public Key</th>
            <th>Signature</th>
            <th>Quantum Safe</th>
            <th>Assumption</th>
          </tr>
        </thead>
        <tbody>
          ${SCHEMES.map((s) => `
            <tr>
              <td><strong>${s.name}</strong></td>
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
      <div class="bar-chart" id="pk-bars"></div>
    </div>

    <div class="card">
      <h2>Signature Size Comparison</h2>
      <div class="bar-chart" id="sig-bars"></div>
    </div>

    <div class="card">
      <h2>Signing Speed Benchmark</h2>
      <p class="text-sm text-muted mb-1">Measure ML-DSA signing throughput in your browser. Each variant runs 50 sign iterations.</p>
      <button class="btn" id="btn-benchmark">Run Benchmark</button>
      <div id="bench-output"></div>
      <p class="text-sm text-muted mt-2"><em>Ed25519 is typically 10–50× faster than ML-DSA in software. The size and speed cost is the price of quantum resistance.</em></p>
    </div>

    <div class="card">
      <h2>When to Use ML-DSA vs SLH-DSA</h2>
      <div class="info-grid">
        <div class="info-item" style="text-align:left">
          <div class="label">ML-DSA (FIPS 204)</div>
          <p class="text-sm text-muted mt-1">Faster signing and verification, moderate signature size. Best for TLS certificates, code signing, real-time protocols.</p>
        </div>
        <div class="info-item" style="text-align:left">
          <div class="label">SLH-DSA (FIPS 205)</div>
          <p class="text-sm text-muted mt-1">Slower, larger signatures, hash-only assumption. Best for long-lived archives, maximum conservatism.</p>
        </div>
        <div class="info-item" style="text-align:left">
          <div class="label">Use Both</div>
          <p class="text-sm text-muted mt-1">Sign with ML-DSA for performance, archive with SLH-DSA for longevity. Defense-in-depth against future cryptanalysis.</p>
        </div>
      </div>
    </div>
  `;

  renderBars('pk-bars', SCHEMES.map((s) => ({ label: s.name, value: s.publicKey, cssClass: s.cssClass })));
  renderBars('sig-bars', SCHEMES.map((s) => ({ label: s.name, value: s.signature, cssClass: s.cssClass })));

  document.getElementById('btn-benchmark')!.addEventListener('click', runBenchmark);
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
    row.innerHTML = `
      <span class="bar-label">${d.label}</span>
      <div class="bar-track">
        <div class="bar-fill ${d.cssClass}" style="width: ${pct}%">${d.value.toLocaleString()} B</div>
      </div>
    `;
    container.appendChild(row);
  });
}

async function runBenchmark(): Promise<void> {
  const btn = document.getElementById('btn-benchmark') as HTMLButtonElement;
  const output = document.getElementById('bench-output')!;
  btn.disabled = true;

  const iterations = 50;
  const variants: MLDSAVariant[] = ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];
  const msg = new TextEncoder().encode('Benchmark message for ML-DSA signing speed test');
  const results: { name: string; opsPerSec: number }[] = [];

  for (const variant of variants) {
    output.innerHTML = `<span class="spinner"></span> Benchmarking ${variant.toUpperCase()} (${iterations} iterations)…`;

    // Let the UI update
    await new Promise((r) => setTimeout(r, 50));

    const kp = await generateKeyPair(variant);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await sign(kp.privateKey, msg, variant);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / elapsed) * 1000;
    results.push({ name: variant.toUpperCase(), opsPerSec });
  }

  // Ed25519 via Web Crypto API
  try {
    output.innerHTML = `<span class="spinner"></span> Benchmarking Ed25519 (Web Crypto)…`;
    await new Promise((r) => setTimeout(r, 50));

    const edKey = await crypto.subtle.generateKey({ name: 'Ed25519' } as Algorithm, false, ['sign', 'verify']) as CryptoKeyPair;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await crypto.subtle.sign({ name: 'Ed25519' } as Algorithm, edKey.privateKey, msg);
    }
    const elapsed = performance.now() - start;
    results.push({ name: 'Ed25519', opsPerSec: (iterations / elapsed) * 1000 });
  } catch {
    results.push({ name: 'Ed25519', opsPerSec: -1 });
  }

  let html = '<table class="comparison-table mt-1"><thead><tr><th>Scheme</th><th>ops/sec</th><th>Relative</th></tr></thead><tbody>';
  const maxOps = Math.max(...results.filter((r) => r.opsPerSec > 0).map((r) => r.opsPerSec));

  for (const r of results) {
    const ops = r.opsPerSec > 0 ? r.opsPerSec.toFixed(1) : 'N/A (not supported)';
    const rel = r.opsPerSec > 0 ? `${(r.opsPerSec / maxOps * 100).toFixed(0)}%` : '—';
    html += `<tr><td><strong>${r.name}</strong></td><td>${ops}</td><td>${rel}</td></tr>`;
  }
  html += '</tbody></table>';
  output.innerHTML = html;
  btn.disabled = false;
}
