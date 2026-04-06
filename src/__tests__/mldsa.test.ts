/**
 * ML-DSA round-trip tests
 * Reference: NIST FIPS 204 — https://csrc.nist.gov/pubs/fips/204/final
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPair, sign, verify, ML_DSA_PARAMS, type MLDSAVariant } from '../crypto/mldsa';

const VARIANTS: MLDSAVariant[] = ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];

describe.each(VARIANTS)('%s', (variant) => {
  it('keygen → sign → verify: true', async () => {
    const kp = await generateKeyPair(variant);
    const msg = new TextEncoder().encode('FIPS 204 ML-DSA round-trip test');
    const result = await sign(kp.privateKey, msg, variant);
    const valid = await verify(kp.publicKey, msg, result.signature, variant);
    expect(valid).toBe(true);
  });

  it('flipped message byte → verify: false', async () => {
    const kp = await generateKeyPair(variant);
    const msg = new TextEncoder().encode('original message for tamper test');
    const result = await sign(kp.privateKey, msg, variant);

    const tampered = new Uint8Array(msg);
    tampered[0] ^= 0xff;

    const valid = await verify(kp.publicKey, tampered, result.signature, variant);
    expect(valid).toBe(false);
  });

  it('flipped signature byte → verify: false', async () => {
    const kp = await generateKeyPair(variant);
    const msg = new TextEncoder().encode('signature tamper test message');
    const result = await sign(kp.privateKey, msg, variant);

    const badSig = new Uint8Array(result.signature);
    badSig[10] ^= 0xff;

    const valid = await verify(kp.publicKey, msg, badSig, variant);
    expect(valid).toBe(false);
  });

  it('key sizes match FIPS 204 Table 1', async () => {
    const kp = await generateKeyPair(variant);
    const params = ML_DSA_PARAMS[variant];
    expect(kp.publicKey.length).toBe(params.publicKey);
    expect(kp.privateKey.length).toBe(params.privateKey);
  });

  it('signature size matches FIPS 204 Table 1', async () => {
    const kp = await generateKeyPair(variant);
    const msg = new TextEncoder().encode('size check');
    const result = await sign(kp.privateKey, msg, variant);
    expect(result.signature.length).toBe(ML_DSA_PARAMS[variant].signature);
  });

  it('measures signing time', async () => {
    const kp = await generateKeyPair(variant);
    const msg = new TextEncoder().encode('timing test');
    const result = await sign(kp.privateKey, msg, variant);
    expect(result.signingTimeMs).toBeGreaterThan(0);
    console.log(`${variant} signing time: ${result.signingTimeMs.toFixed(2)} ms`);
  });
});
