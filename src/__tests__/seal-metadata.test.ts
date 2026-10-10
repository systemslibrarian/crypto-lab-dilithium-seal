import { describe, expect, it } from 'vitest';
import { generateKeyPair, type MLDSAVariant } from '../crypto/mldsa';
import { sealDocument, verifyDocument } from '../crypto/seal';

const variants: MLDSAVariant[] = ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];

describe.each(variants)('%s sealed-content scope', variant => {
  it('never authenticates an unsigned signer label or timestamp', async () => {
    const key = await generateKeyPair(variant);
    const original = await sealDocument('hello', key.privateKey, key.publicKey, 'Alice', variant);
    for (const doc of [original, { ...original, signerLabel: 'Mallory' },
      { ...original, timestamp: '1900-01-01' },
      { ...original, signerLabel: '<img src=x onerror=alert(1)>', timestamp: 'unverified time' }]) {
      const result = await verifyDocument(doc);
      expect(result.valid).toBe(true);
      expect(result.contentIntact).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.explanation).toContain('valid under the included public key');
      expect(result.explanation).toContain('Signer label and timestamp are unsigned/unverified');
      expect(result.explanation).toContain('not bound to a trusted identity');
      expect(result.explanation).not.toContain('Signed by');
      expect(result.explanation).not.toContain('Mallory');
      expect(result.explanation).not.toContain('1900-01-01');
      expect(result.explanation).not.toContain('<img');
    }
  });

  it('rejects changed content even with a matching recomputed convenience hash', async () => {
    const key = await generateKeyPair(variant);
    const doc = await sealDocument('hello', key.privateKey, key.publicKey, 'Alice', variant);
    const changed = 'different content';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(changed));
    const contentHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const result = await verifyDocument({ ...doc, content: changed, contentHash });
    expect(result.contentIntact).toBe(true);
    expect(result.signatureValid).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.explanation).toContain('Signer label and timestamp are unsigned/unverified');
  });

  it('distinguishes an altered unsigned hash from invalid content signature', async () => {
    const key = await generateKeyPair(variant);
    const doc = await sealDocument('hello', key.privateKey, key.publicKey, 'Alice', variant);
    const result = await verifyDocument({ ...doc, contentHash: '00'.repeat(32) });
    expect(result.contentIntact).toBe(false);
    expect(result.signatureValid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.explanation).toContain('recorded hash or content may have changed');
    expect(result.explanation).not.toContain('text was modified after signing');
  });
});
