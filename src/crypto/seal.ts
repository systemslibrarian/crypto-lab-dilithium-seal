/**
 * Document sealing with ML-DSA signatures
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import { sign, verify, type MLDSAVariant } from './mldsa';

export interface SealedDocument {
  content: string;
  contentHash: string;
  signature: string;
  publicKey: string;
  signerLabel: string;
  variant: MLDSAVariant;
  timestamp: string;
  version: string;
}

export interface VerifyResult {
  valid: boolean;
  contentIntact: boolean;
  signatureValid: boolean;
  explanation: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sealDocument(
  content: string,
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  signerLabel: string,
  variant: MLDSAVariant
): Promise<SealedDocument> {
  const contentHash = await sha256Hex(content);
  const message = new TextEncoder().encode(content);
  const result = await sign(privateKey, message, variant);

  return {
    content,
    contentHash,
    signature: uint8ToBase64(result.signature),
    publicKey: uint8ToBase64(publicKey),
    signerLabel,
    variant,
    timestamp: new Date().toISOString(),
    version: 'dilithium-seal-v1',
  };
}

export async function verifyDocument(doc: SealedDocument): Promise<VerifyResult> {
  if (!doc || typeof doc.content !== 'string' || typeof doc.publicKey !== 'string' || typeof doc.signature !== 'string' || typeof doc.variant !== 'string') {
    return { valid: false, contentIntact: false, signatureValid: false, explanation: 'Document is missing required fields or has invalid format.' };
  }

  try {
    const currentHash = await sha256Hex(doc.content);
    const contentIntact = currentHash === doc.contentHash;

    const publicKey = base64ToUint8(doc.publicKey);
    const signature = base64ToUint8(doc.signature);
    const message = new TextEncoder().encode(doc.content);

    let signatureValid = false;
    try {
      signatureValid = await verify(publicKey, message, signature, doc.variant);
    } catch {
      signatureValid = false;
    }

    const valid = contentIntact && signatureValid;

    let explanation: string;
    if (valid) {
      explanation = `Document integrity verified. Content hash matches and ML-DSA-${doc.variant.split('-')[2]} signature is valid. Signed by "${doc.signerLabel}" at ${doc.timestamp}.`;
    } else if (!contentIntact && !signatureValid) {
      explanation = 'Document has been tampered with: content hash mismatch AND signature verification failed.';
    } else if (!contentIntact) {
      explanation = 'Content integrity check failed: the SHA-256 hash of the current content does not match the recorded hash. The document text was modified after signing.';
    } else {
      explanation = 'Signature verification failed: the ML-DSA signature does not validate against the public key and message. The signature or public key may have been altered.';
    }

    return { valid, contentIntact, signatureValid, explanation };
  } catch (err) {
    return { valid: false, contentIntact: false, signatureValid: false, explanation: 'Verification aborted due to decoding or processing error.' };
  }
}
