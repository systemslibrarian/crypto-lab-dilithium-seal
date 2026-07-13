/**
 * Tab 1 — Sign & Verify + Document Sealing
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import {
  generateKeyPair,
  sign,
  verify,
  ML_DSA_PARAMS,
  type MLDSAVariant,
  type MLDSAKeyPair,
} from '../crypto/mldsa';
import { sealDocument, verifyDocument, type SealedDocument } from '../crypto/seal';
import { truncateHex, formatBytes, h, escapeHTML } from './helpers';

let currentVariant: MLDSAVariant = 'ml-dsa-65';
let keyPair: MLDSAKeyPair | null = null;
let lastSignature: Uint8Array | null = null;
let lastMessage: Uint8Array | null = null;
let lastSealedDoc: SealedDocument | null = null;

export function renderSignVerify(container: HTMLElement): void {
  currentVariant = 'ml-dsa-65';
  keyPair = null;
  lastSignature = null;
  lastMessage = null;
  lastSealedDoc = null;

  container.innerHTML = `
    <div class="card">
      <h2>ML-DSA Digital Signatures</h2>
      <p class="text-sm text-muted mb-1">Generate a keypair, sign a message, verify the signature, and test tamper detection.</p>

      <div class="section">
        <div class="section-title" id="variant-label">Parameter Set</div>
        <div class="pills" id="variant-pills" role="radiogroup" aria-labelledby="variant-label"></div>
        <div class="info-grid" id="param-info" aria-label="Parameter sizes"></div>
      </div>

      <div class="section">
        <div class="section-title">Key Generation</div>
        <button class="btn" id="btn-keygen">Generate Keypair</button>
        <div id="keygen-output" aria-live="polite"></div>
      </div>

      <div class="section">
        <div class="section-title"><label for="message-input">Sign Message</label></div>
        <textarea id="message-input" rows="3" aria-label="Message to sign" placeholder="Enter a message to sign…">Post-quantum digital signatures protect against both classical and quantum adversaries. ML-DSA (FIPS 204) is the NIST standard for lattice-based digital signatures.</textarea>
        <div class="flex-row">
          <button class="btn" id="btn-sign" disabled>Sign</button>
          <button class="btn" id="btn-verify" disabled>Verify</button>
          <button class="btn btn-danger" id="btn-tamper-msg" disabled>Tamper with Message</button>
          <button class="btn btn-danger" id="btn-tamper-sig" disabled>Tamper with Signature</button>
        </div>
        <div id="sign-output" aria-live="polite"></div>
        <div id="verify-output" aria-live="assertive"></div>
      </div>
    </div>

    <div class="card">
      <h2>Seal a Document</h2>
      <p class="text-sm text-muted mb-1">Sign a complete document and produce a verifiable sealed JSON package.</p>

      <div class="section">
        <label for="signer-name" class="sr-only">Signer name</label>
        <input type="text" id="signer-name" aria-label="Signer name" placeholder="Signer name" value="Alice (FIPS 204 Demo)" />
        <label for="doc-input" class="sr-only">Document text</label>
        <textarea id="doc-input" rows="4" aria-label="Document text to seal" placeholder="Enter document text…">This document certifies that the bearer has completed post-quantum cryptography training. All digital signatures in this system use ML-DSA as specified in NIST FIPS 204.</textarea>
        <div class="flex-row">
          <button class="btn" id="btn-seal" disabled>Seal Document</button>
          <button class="btn btn-secondary" id="btn-export-seal" disabled>Export Seal</button>
          <button class="btn btn-danger" id="btn-tamper-seal" disabled>Tamper &amp; Verify</button>
        </div>
        <div id="seal-output" aria-live="polite"></div>
      </div>

      <div class="section">
        <div class="section-title"><label for="seal-json-input">Verify a Sealed Document</label></div>
        <textarea id="seal-json-input" rows="4" aria-label="Sealed document JSON to verify" placeholder="Paste a sealed document JSON here…"></textarea>
        <button class="btn btn-secondary" id="btn-verify-seal">Verify Seal</button>
        <div id="seal-verify-output" aria-live="polite"></div>
      </div>
    </div>
  `;

  renderVariantPills();
  updateParamInfo();
  bindEvents();
}

function renderVariantPills(): void {
  const container = document.getElementById('variant-pills')!;
  const variants: MLDSAVariant[] = ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];
  variants.forEach((v, i) => {
    const btn = h('button', {
      className: `pill${v === currentVariant ? ' active' : ''}`,
      role: 'radio',
      'aria-checked': String(v === currentVariant),
      tabindex: v === currentVariant ? '0' : '-1',
    }, v.toUpperCase());
    btn.addEventListener('click', () => selectVariant(v, container));
    container.appendChild(btn);
  });

  // Arrow key navigation for radio group
  container.addEventListener('keydown', (e: KeyboardEvent) => {
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const current = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    if (next >= 0) {
      e.preventDefault();
      buttons[next].focus();
      selectVariant(variants[next], container);
    }
  });
}

function selectVariant(v: MLDSAVariant, container: HTMLElement): void {
  currentVariant = v;
  container.querySelectorAll('.pill').forEach((p) => {
    const isActive = p.textContent === v.toUpperCase();
    p.classList.toggle('active', isActive);
    p.setAttribute('aria-checked', String(isActive));
    p.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  updateParamInfo();
}

function updateParamInfo(): void {
  const info = document.getElementById('param-info')!;
  const p = ML_DSA_PARAMS[currentVariant];
  info.innerHTML = `
    <div class="info-item"><div class="label">Public Key</div><div class="value">${formatBytes(p.publicKey)}</div></div>
    <div class="info-item"><div class="label">Private Key</div><div class="value">${formatBytes(p.privateKey)}</div></div>
    <div class="info-item"><div class="label">Signature</div><div class="value">${formatBytes(p.signature)}</div></div>
    <div class="info-item"><div class="label">Security Cat.</div><div class="value">${p.securityCategory}</div></div>
  `;
}

function bindEvents(): void {
  document.getElementById('btn-keygen')!.addEventListener('click', handleKeyGen);
  document.getElementById('btn-sign')!.addEventListener('click', handleSign);
  document.getElementById('btn-verify')!.addEventListener('click', handleVerify);
  document.getElementById('btn-tamper-msg')!.addEventListener('click', handleTamperMessage);
  document.getElementById('btn-tamper-sig')!.addEventListener('click', handleTamperSignature);
  document.getElementById('btn-seal')!.addEventListener('click', handleSeal);
  document.getElementById('btn-export-seal')!.addEventListener('click', handleExportSeal);
  document.getElementById('btn-tamper-seal')!.addEventListener('click', handleTamperSeal);
  document.getElementById('btn-verify-seal')!.addEventListener('click', handleVerifySealJSON);
}

async function handleKeyGen(): Promise<void> {
  const output = document.getElementById('keygen-output')!;
  const btn = document.getElementById('btn-keygen') as HTMLButtonElement;

  btn.disabled = true;
  output.innerHTML = `<span class="spinner"></span> Generating ${currentVariant.toUpperCase()} keypair…`;

  const start = performance.now();
  keyPair = await generateKeyPair(currentVariant);
  const elapsed = (performance.now() - start).toFixed(1);

  lastSignature = null;
  lastMessage = null;

  const pub = keyPair.publicKey.length;
  const priv = keyPair.privateKey.length;
  output.innerHTML = `
    <div class="text-sm mt-1"><strong>Public key</strong> (${pub} bytes):</div>
    <div class="output">${truncateHex(keyPair.publicKey, 32)}</div>
    <p class="annot"><span class="annot-label">This is the public key you'd publish.</span> Anyone can hold it to <em>verify</em> your signatures, but it cannot create them. It encodes (ρ, t₁) — a seed plus the high bits of <span class="mono">t = As₁ + s₂</span>.</p>
    <div class="text-sm"><strong>Private key</strong> (${priv} bytes):</div>
    <div class="output">${truncateHex(keyPair.privateKey, 32)}</div>
    <p class="annot secret"><span class="annot-label">This is the secret you must never share.</span> It is <span class="tip" tabindex="0" title="The private key stores the secret vectors s₁ and s₂ plus the low-order bits t₀ of the public value — extra data the verifier never needs. That is why the ML-DSA private key (${priv} B) is larger than the public key (${pub} B).">larger than the public key</span> because it stores the secret vectors <span class="mono">s₁</span>, <span class="mono">s₂</span> and <span class="mono">t₀</span> that only the signer needs.</p>
    <div class="text-sm text-muted">Generated in ${elapsed} ms</div>
  `;

  btn.disabled = false;
  (document.getElementById('btn-sign') as HTMLButtonElement).disabled = false;
  (document.getElementById('btn-seal') as HTMLButtonElement).disabled = false;
}

async function handleSign(): Promise<void> {
  if (!keyPair) return;

  const msgText = (document.getElementById('message-input') as HTMLTextAreaElement).value;
  lastMessage = new TextEncoder().encode(msgText);

  const output = document.getElementById('sign-output')!;
  output.innerHTML = `<span class="spinner"></span> Signing with ${currentVariant.toUpperCase()}…`;

  const result = await sign(keyPair.privateKey, lastMessage, currentVariant);
  lastSignature = result.signature;

  const note = currentVariant === 'ml-dsa-87'
    ? ' <span class="text-muted">(ML-DSA-87 prioritizes security over speed)</span>'
    : '';

  output.innerHTML = `
    <div class="text-sm mt-1"><strong>Signature</strong> (${result.signature.length} bytes):</div>
    <div class="output">${truncateHex(result.signature, 48)}</div>
    <p class="annot"><span class="annot-label">This signature travels with the message.</span> It encodes (c̃, z, h) — the challenge, the short response <span class="mono">z = y + cs₁</span>, and a hint. It binds to these <em>exact</em> bytes: change one byte of the message or the signature and Verify flips to FAILED.</p>
    <div class="text-sm text-muted">Signed in ${result.signingTimeMs.toFixed(2)} ms${note}</div>
  `;

  (document.getElementById('btn-verify') as HTMLButtonElement).disabled = false;
  (document.getElementById('btn-tamper-msg') as HTMLButtonElement).disabled = false;
  (document.getElementById('btn-tamper-sig') as HTMLButtonElement).disabled = false;
  document.getElementById('verify-output')!.innerHTML = '';
}

async function handleVerify(): Promise<void> {
  if (!keyPair || !lastSignature || !lastMessage) return;
  const output = document.getElementById('verify-output')!;

  const start = performance.now();
  const valid = await verify(keyPair.publicKey, lastMessage, lastSignature, currentVariant);
  const elapsed = (performance.now() - start).toFixed(2);

  if (valid) {
    output.innerHTML = `
      <div class="mt-1"><span class="badge badge-pass">✓ VERIFIED</span></div>
      <p class="text-sm text-muted mt-1">The ${currentVariant.toUpperCase()} signature is valid. The message has not been altered and was signed by the holder of the corresponding private key. Verified in ${elapsed} ms.</p>
    `;
  } else {
    output.innerHTML = `
      <div class="mt-1"><span class="badge badge-fail">✗ FAILED</span></div>
      <p class="text-sm text-muted mt-1">Signature verification failed. The message or signature has been tampered with. Checked in ${elapsed} ms.</p>
    `;
  }
}

function handleTamperMessage(): void {
  if (!lastMessage) return;
  const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
  textarea.value += '!';
  lastMessage = new TextEncoder().encode(textarea.value);
  document.getElementById('verify-output')!.innerHTML =
    '<p class="text-sm text-red mt-1">⚠ Message tampered — click Verify to see the signature fail.</p>';
}

function handleTamperSignature(): void {
  if (!lastSignature) return;
  lastSignature[10] ^= 0xff;
  document.getElementById('verify-output')!.innerHTML =
    '<p class="text-sm text-red mt-1">⚠ Signature tampered (1 byte flipped) — click Verify to see it fail.</p>';
}

async function handleSeal(): Promise<void> {
  if (!keyPair) return;
  const signerName = (document.getElementById('signer-name') as HTMLInputElement).value || 'Anonymous';
  const docText = (document.getElementById('doc-input') as HTMLTextAreaElement).value;

  const output = document.getElementById('seal-output')!;
  output.innerHTML = `<span class="spinner"></span> Sealing document…`;

  lastSealedDoc = await sealDocument(docText, keyPair.privateKey, keyPair.publicKey, signerName, currentVariant);

  const result = await verifyDocument(lastSealedDoc);

  output.innerHTML = `
    <div class="text-sm mt-1"><strong>Content hash (SHA-256):</strong> <span class="text-muted">— a fast local integrity check, not the security</span></div>
    <div class="output">${escapeHTML(lastSealedDoc.contentHash)}</div>
    <div class="text-sm"><strong>Signature</strong> (${atob(lastSealedDoc.signature).length} bytes, truncated): <span class="text-muted">— this is what proves authenticity</span></div>
    <div class="output">${escapeHTML(lastSealedDoc.signature.slice(0, 80))}…</div>
    <div class="mt-1"><span class="badge badge-pass">✓ SEALED & VERIFIED</span></div>
    <p class="text-sm text-muted mt-1">${escapeHTML(result.explanation)}</p>
    <p class="text-sm text-muted">Now press <strong>Tamper &amp; Verify</strong> to see which of these two actually catches an edit.</p>
  `;

  (document.getElementById('btn-export-seal') as HTMLButtonElement).disabled = false;
  (document.getElementById('btn-tamper-seal') as HTMLButtonElement).disabled = false;
}

function handleExportSeal(): void {
  if (!lastSealedDoc) return;
  const json = JSON.stringify(lastSealedDoc, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sealed-document-${currentVariant}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleTamperSeal(): Promise<void> {
  if (!lastSealedDoc) return;

  const tamperedContent = lastSealedDoc.content.replace(/\b\w+\b/, 'TAMPERED');

  // Lesson 1: tamper WITHOUT touching the stored hash — the ML-DSA signature
  // ALONE must catch it. We rebuild the hash from the (now tampered) content so
  // the SHA-256 "content integrity" check passes, isolating the signature as the
  // thing that fails. This proves authenticity comes from the signature, not the hash.
  const hashHidesTamper = await recomputeHashFor(tamperedContent);
  const sigOnlyDoc: SealedDocument = {
    ...lastSealedDoc,
    content: tamperedContent,
    contentHash: hashHidesTamper, // make the hash agree with the tampered text
  };
  const sigOnly = await verifyDocument(sigOnlyDoc);

  // Lesson 2: the realistic case — hash is left stale, so BOTH signals fire.
  const bothDoc: SealedDocument = { ...lastSealedDoc, content: tamperedContent };
  const both = await verifyDocument(bothDoc);

  const output = document.getElementById('seal-output')!;
  output.innerHTML += `
    <div class="mt-2 tamper-lesson">
      <div class="text-sm"><strong>Lesson 1 — the signature alone catches it.</strong>
      We tampered the text <em>and</em> recomputed the SHA-256 hash so the hash check <em>passes</em>.
      The signature still fails, because it is bound to the original bytes:</div>
      <p class="text-sm mt-1">
        Content integrity (SHA-256):
        ${signal(sigOnly.contentIntact, 'passes — but it was just recomputed, so it proves nothing here')}
        <br>
        <span class="tip" tabindex="0" title="The SHA-256 hash is a stored convenience for a fast local integrity check. It is NOT what provides security: an attacker who edits the document can recompute the hash. Only the ML-DSA signature — which requires the secret key — proves authenticity.">Signature (ML-DSA)</span>:
        ${signal(sigOnly.signatureValid, 'FAILS — this is what actually detects the tamper')}
      </p>
      <div class="mt-1"><span class="badge ${sigOnly.valid ? 'badge-pass' : 'badge-fail'}">✗ TAMPER DETECTED BY SIGNATURE</span></div>

      <div class="text-sm mt-2"><strong>Lesson 2 — in practice both fire.</strong>
      Normally the stored hash is left alone, so the quick hash check <em>and</em> the signature both flag the change:</div>
      <p class="text-sm mt-1">
        Content integrity (SHA-256): ${signal(both.contentIntact, 'FAILED (quick local check)')}
        <br>
        Signature (ML-DSA): ${signal(both.signatureValid, 'FAILED (proves authenticity)')}
      </p>
      <p class="text-sm text-muted mt-1">Takeaway: the SHA-256 hash is a convenience for a fast local check. <strong>The signature — not the hash — is what proves authenticity</strong>, because forging it requires the secret key.</p>
    </div>
  `;
}

/** Text + icon + color status chip (never color alone — WCAG 1.4.1). */
function signal(pass: boolean, label: string): string {
  const icon = pass ? '✓' : '✗';
  const cls = pass ? 'text-green' : 'text-red';
  return `<span class="${cls}">${icon} ${escapeHTML(label)}</span>`;
}

async function recomputeHashFor(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleVerifySealJSON(): Promise<void> {
  const input = (document.getElementById('seal-json-input') as HTMLTextAreaElement).value.trim();
  const output = document.getElementById('seal-verify-output')!;

  if (!input) {
    output.innerHTML = '<p class="text-sm text-red">Please paste a sealed document JSON.</p>';
    return;
  }

  let doc: SealedDocument;
  try {
    doc = JSON.parse(input);
  } catch {
    output.innerHTML = '<p class="text-sm text-red">Invalid JSON format.</p>';
    return;
  }

  output.innerHTML = '<span class="spinner"></span> Verifying…';
  const result = await verifyDocument(doc);

  const badge = result.valid
    ? '<span class="badge badge-pass">✓ VERIFIED</span>'
    : '<span class="badge badge-fail">✗ FAILED</span>';

  output.innerHTML = `
    <div class="mt-1">${badge}</div>
    <p class="text-sm text-muted mt-1">${escapeHTML(result.explanation)}</p>
    <p class="text-sm">Content intact: ${result.contentIntact ? '<span class="text-green">yes</span>' : '<span class="text-red">no</span>'} | Signature valid: ${result.signatureValid ? '<span class="text-green">yes</span>' : '<span class="text-red">no</span>'}</p>
  `;
}
