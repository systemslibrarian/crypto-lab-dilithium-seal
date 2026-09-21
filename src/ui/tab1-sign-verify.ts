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
import { InsecureRandomnessError } from '../crypto/random';
import { truncateHex, formatBytes, h, escapeHTML } from './helpers';
import { cite } from './provenance';
import { renderImplementationBadge } from './implementation';
import { fidelityBadge } from './fidelity';
import { renderSelectorGuidance } from './selector-guidance';
import { getSelectedVariant, setSelectedVariant } from './selected-variant';

let keyPair: MLDSAKeyPair | null = null;
let lastSignature: Uint8Array | null = null;
let lastMessage: Uint8Array | null = null;
let lastSealedDoc: SealedDocument | null = null;

/**
 * The selected parameter set now lives in `selected-variant.ts` rather than in
 * a module-local variable here, and this render no longer resets it. A reader
 * who chose ML-DSA-44, went to Compare and came back used to find themselves on
 * ML-DSA-65 again with no explanation — and nothing outside this file could
 * know what was selected, so the benchmark could not mark it and the exported
 * evidence could not record it.
 *
 * Key material is still cleared, because a keypair belongs to exactly one
 * parameter set and the DOM holding it has just been destroyed.
 */
export function renderSignVerify(container: HTMLElement): void {
  keyPair = null;
  lastSignature = null;
  lastMessage = null;
  lastSealedDoc = null;

  container.innerHTML = `
    <div class="card">
      <h2>ML-DSA Digital Signatures</h2>
      ${fidelityBadge('operation', 'sign-verify')}
      <p class="text-sm text-muted mb-1">Generate a keypair, sign a message, verify the signature, and test tamper detection. Every operation below is real ML-DSA as specified in FIPS 204 — the sizes shown are the standard's own ${cite('sizes')}.</p>

      <div class="section">
        <div class="section-title" id="variant-label">Parameter Set</div>
        <div class="pills" id="variant-pills" role="radiogroup" aria-labelledby="variant-label"></div>
        <!-- role="group": aria-label is PROHIBITED on a role-less div and is
             silently discarded, so this grid had no accessible name at all. axe
             files that under its "incomplete" bucket (aria-prohibited-attr) and
             never under violations, which is why a violations-only gate could
             not see it. -->
        <div class="info-grid" id="param-info" role="group" aria-label="Parameter sizes"></div>
        <p class="text-sm text-muted mt-1" id="variant-guidance" aria-live="polite"></p>
      </div>

      <div class="section">
        <div class="section-title">Key Generation</div>
        ${renderImplementationBadge()}
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

    ${renderSelectorGuidance()}

    <div class="card">
      <h2>Seal a Document</h2>
      ${fidelityBadge('operation', 'seal')}
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
          <button class="btn btn-danger" id="btn-forge-seal" disabled>Forge a Verifying Seal</button>
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
      className: `pill${v === getSelectedVariant() ? ' active' : ''}`,
      role: 'radio',
      'aria-checked': String(v === getSelectedVariant()),
      tabindex: v === getSelectedVariant() ? '0' : '-1',
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
  const changed = setSelectedVariant(v);
  container.querySelectorAll('.pill').forEach((p) => {
    const isActive = p.textContent === v.toUpperCase();
    p.classList.toggle('active', isActive);
    p.setAttribute('aria-checked', String(isActive));
    p.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  updateParamInfo();
  if (changed) resetKeyMaterial();
}

/**
 * A keypair belongs to exactly one parameter set — an ML-DSA-65 secret key is
 * 4032 B and `ml_dsa44.sign()` rejects it outright. Switching the parameter set
 * therefore invalidates every artifact on the page. Before this reset, the stale
 * keypair stayed live and the next Sign threw
 * ("Uint8Array expected of length 2560, got length=4032") from inside an async
 * handler, leaving the page stuck on its spinner with no error shown; Verify and
 * Seal failed the same silent way.
 */
function resetKeyMaterial(): void {
  keyPair = null;
  lastSealedDoc = null;

  clearSignatureState();
  for (const id of ['btn-sign', 'btn-seal', 'btn-export-seal', 'btn-tamper-seal', 'btn-forge-seal']) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
  }
  const seal = document.getElementById('seal-output');
  if (seal) seal.innerHTML = '';

  const keygen = document.getElementById('keygen-output');
  if (keygen) {
    keygen.innerHTML = `<p class="text-sm text-muted mt-1" id="variant-reset-note">Parameter set is now ${getSelectedVariant().toUpperCase()} — generate a new keypair to use it. Keys and signatures are bound to one parameter set.</p>`;
  }
}

/**
 * Drop the current signature and every control and pane that depends on it.
 *
 * `handleKeyGen` nulls `lastSignature`/`lastMessage` but used to leave the DOM
 * alone, so a fresh keypair inherited the previous run's "✓ VERIFIED — the
 * ML-DSA-65 signature is valid" badge and the previous signature hex. Verify
 * then early-returned on the null signature, so the stale pass sat there
 * unchallenged: a passing verdict on screen for a keypair that had signed
 * nothing. Clearing here keeps the rendered verdict tied to a signature that
 * actually exists.
 */
function clearSignatureState(): void {
  lastSignature = null;
  lastMessage = null;

  for (const id of ['btn-verify', 'btn-tamper-msg', 'btn-tamper-sig']) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
  }
  for (const id of ['sign-output', 'verify-output']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
}

/**
 * Guidance that changes with the selection.
 *
 * Deliberately phrased as "use this when X requires it", never as a ranking.
 * See src/ui/selector-guidance.ts for why.
 */
const VARIANT_GUIDANCE: Record<MLDSAVariant, string> = {
  'ml-dsa-44':
    'Use when your protocol or policy requires NIST security category 2, or when signature and ' +
    'key size dominate the cost. Smallest of the three.',
  'ml-dsa-65':
    'Use when your protocol or policy requires NIST security category 3. Several early ' +
    'post-quantum protocol profiles name this set, which makes it a common interoperability ' +
    'default.',
  'ml-dsa-87':
    'Use when your protocol or policy requires NIST security category 5, or when the data must ' +
    'stay authentic for decades. Not a general upgrade — a higher category than your ' +
    'counterparty expects produces signatures they reject.',
};

function updateParamInfo(): void {
  const info = document.getElementById('param-info')!;
  const p = ML_DSA_PARAMS[getSelectedVariant()];
  info.innerHTML = `
    <div class="info-item"><div class="label">Public Key</div><div class="value">${formatBytes(p.publicKey)}</div></div>
    <div class="info-item"><div class="label">Private Key</div><div class="value">${formatBytes(p.privateKey)}</div></div>
    <div class="info-item"><div class="label">Signature</div><div class="value">${formatBytes(p.signature)}</div></div>
    <div class="info-item"><div class="label">Security Cat.</div><div class="value">${p.securityCategory}</div></div>
  `;

  const guidance = document.getElementById('variant-guidance');
  if (guidance) guidance.textContent = VARIANT_GUIDANCE[getSelectedVariant()];
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
  document.getElementById('btn-forge-seal')!.addEventListener('click', handleForgeSeal);
  document.getElementById('btn-verify-seal')!.addEventListener('click', handleVerifySealJSON);
}

/**
 * Render a fail-closed randomness error where the reader is looking.
 *
 * Before this, `generateKeyPair` threw out of an async click handler with
 * nothing catching it: the spinner stayed on screen forever and the console got
 * an unhandled rejection the reader never sees. An operation that refuses to
 * proceed has to SAY it refused, or it is indistinguishable from one that hung.
 */
function renderRandomnessFailure(output: HTMLElement, err: unknown): boolean {
  if (!(err instanceof InsecureRandomnessError)) return false;
  output.innerHTML = `
    <div class="mt-1"><span class="badge badge-fail">✗ STOPPED — NO SECURE RANDOMNESS</span></div>
    <p class="text-sm text-red mt-1">${escapeHTML(err.message)}</p>
    <p class="text-sm text-muted">Nothing was generated or signed. There is deliberately no
    fallback: a key drawn from a non-cryptographic source would look identical and be
    worthless.</p>
  `;
  return true;
}

async function handleKeyGen(): Promise<void> {
  const output = document.getElementById('keygen-output')!;
  const btn = document.getElementById('btn-keygen') as HTMLButtonElement;

  btn.disabled = true;
  output.innerHTML = `<span class="spinner"></span> Generating ${getSelectedVariant().toUpperCase()} keypair…`;

  const start = performance.now();
  try {
    keyPair = await generateKeyPair(getSelectedVariant());
  } catch (err) {
    if (!renderRandomnessFailure(output, err)) throw err;
    btn.disabled = false;
    return;
  }
  const elapsed = (performance.now() - start).toFixed(1);

  // The new keypair has signed nothing yet — retire the previous run's
  // signature, its verdict, and the controls that act on it.
  clearSignatureState();

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
  output.innerHTML = `<span class="spinner"></span> Signing with ${getSelectedVariant().toUpperCase()}…`;

  let result;
  try {
    result = await sign(keyPair.privateKey, lastMessage, getSelectedVariant());
  } catch (err) {
    // Hedged signing draws a fresh 32-byte rnd per signature, so it depends on
    // the RBG just as keygen does. Stop and say so.
    if (!renderRandomnessFailure(output, err)) throw err;
    return;
  }
  lastSignature = result.signature;

  // No note ranking the parameter sets against each other. The page used to
  // print "(ML-DSA-87 prioritizes security over speed)" here, which reads as a
  // ranking with ML-DSA-87 on top; the parameter sets are alternatives chosen
  // by required security category and by what you must interoperate with. The
  // guidance panel below the selector says how to choose.
  const note = '';

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
  const valid = await verify(keyPair.publicKey, lastMessage, lastSignature, getSelectedVariant());
  const elapsed = (performance.now() - start).toFixed(2);

  if (valid) {
    output.innerHTML = `
      <div class="mt-1"><span class="badge badge-pass">✓ VERIFIED</span></div>
      <p class="text-sm text-muted mt-1">The ${getSelectedVariant().toUpperCase()} signature is valid. The message has not been altered and was signed by the holder of the corresponding private key. Verified in ${elapsed} ms.</p>
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
  (document.getElementById('btn-tamper-sig') as HTMLButtonElement).disabled = true;
  document.getElementById('verify-output')!.innerHTML =
    '<p class="text-sm text-red mt-1">⚠ Signature tampered (1 byte flipped once) — click Verify to see it fail. Sign again to create a fresh signature.</p>';
}

async function handleSeal(): Promise<void> {
  if (!keyPair) return;
  const signerName = (document.getElementById('signer-name') as HTMLInputElement).value || 'Anonymous';
  const docText = (document.getElementById('doc-input') as HTMLTextAreaElement).value;

  const output = document.getElementById('seal-output')!;
  output.innerHTML = `<span class="spinner"></span> Sealing document…`;

  lastSealedDoc = await sealDocument(docText, keyPair.privateKey, keyPair.publicKey, signerName, getSelectedVariant());

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
  (document.getElementById('btn-forge-seal') as HTMLButtonElement).disabled = false;
}

function handleExportSeal(): void {
  if (!lastSealedDoc) return;
  const json = JSON.stringify(lastSealedDoc, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sealed-document-${getSelectedVariant()}.json`;
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

/**
 * Lesson 3 — the one the page could only assert until now.
 *
 * Lessons 1 and 2 show the signature catching an edit. They leave a reader with
 * the reasonable-sounding and completely wrong conclusion that a document which
 * verifies is a document that means something.
 *
 * It does not. Verification proves that whoever holds the private key matching
 * THIS public key signed THESE bytes. The sealed package carries the public key
 * in the same JSON as the signature, so an attacker who replaces the content,
 * signs it with their OWN key, and replaces the public key too produces a
 * document where every check passes — hash, signature, everything — and which
 * proves nothing at all.
 *
 * FIPS 204 §3.5: "binding a public key to an identity requires proof of
 * possession". This button is that sentence, executed. It uses real ML-DSA
 * throughout: the forged signature is a genuine signature, under a genuine key
 * that simply is not Alice's.
 */
async function handleForgeSeal(): Promise<void> {
  if (!lastSealedDoc) return;
  const output = document.getElementById('seal-output')!;
  const button = document.getElementById('btn-forge-seal') as HTMLButtonElement;
  button.disabled = true;

  const variant = getSelectedVariant();
  const forgedContent = lastSealedDoc.content.replace(
    /\b\w+\b/,
    'FORGED'
  );

  let attacker;
  try {
    attacker = await generateKeyPair(variant);
  } catch (err) {
    if (!renderRandomnessFailure(output, err)) throw err;
    button.disabled = false;
    return;
  }

  // A real seal, made with a real key. Nothing here is faked — that is the
  // whole point, and it is why the verdict below is a genuine ✓.
  const forged = await sealDocument(
    forgedContent,
    attacker.privateKey,
    attacker.publicKey,
    lastSealedDoc.signerLabel,
    variant
  );
  const result = await verifyDocument(forged);

  const originalKey = lastSealedDoc.publicKey;
  const forgedKey = forged.publicKey;

  output.innerHTML += `
    <div class="mt-2 tamper-lesson forge-lesson" id="forge-lesson">
      <div class="text-sm"><strong>Lesson 3 — a document that verifies can still be worthless.</strong>
      We replaced the text, signed it with a <em>different</em> ML-DSA key we generated just now,
      and swapped the public key in the package to match. Every check the verifier can run
      passes:</div>
      <p class="text-sm mt-1">
        Content integrity (SHA-256): ${signal(result.contentIntact, 'passes')}
        <br>
        Signature (ML-DSA): ${signal(result.signatureValid, 'passes — it is a real signature, under a real key')}
      </p>
      <div class="mt-1"><span class="badge ${result.valid ? 'badge-pass' : 'badge-fail'}" id="forge-verdict">${
        result.valid ? '✓ VERIFIED — AND MEANINGLESS' : '✗ FAILED'
      }</span></div>
      <p class="text-sm mt-1">Signer label still reads
      <strong>${escapeHTML(forged.signerLabel)}</strong> — it is free text with no cryptographic
      force at all.</p>
      <div class="text-sm mt-1"><strong>The only thing that changed, and the only thing that matters:</strong></div>
      <p class="text-sm mt-1">
        Original public key: <span class="mono" id="forge-original-key">${escapeHTML(originalKey.slice(0, 32))}…</span><br>
        Forged public key: <span class="mono text-red" id="forge-attacker-key">${escapeHTML(forgedKey.slice(0, 32))}…</span>
      </p>
      <p class="text-sm text-muted mt-1">
        A signature authenticates a message <em>relative to a public key you already trust</em>.
        This package hands you the key along with the signature, so it authenticates nothing —
        it is a self-signed assertion by whoever made it. In a real system the verifier obtains
        the public key beforehand, through a channel that binds it to an identity: a certificate
        from a CA, a key pinned in your application, a fingerprint checked out of band.
        FIPS 204 §3.5 puts it directly — <em>"binding a public key to an identity requires proof
        of possession"</em>. ${cite('identityBinding')}
      </p>
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
