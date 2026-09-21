#!/usr/bin/env node
/**
 * Run the COMPLETE NIST ACVP ML-DSA vector set — all 615 cases.
 *
 * ── Why this is not the merge gate ────────────────────────────────────────
 * The merge gate runs a vendored subset that is committed, digest-checked and
 * needs no network. That is the right shape for a gate: hermetic, fast, and
 * unable to fail because GitHub was slow. But a subset can only ever say "the
 * cases we kept pass", and the honest question is whether the cases we dropped
 * would too.
 *
 * So this fetches the full upstream files at the SAME pinned commit, verifies
 * their digests against the same manifest the subset was cut from, and runs
 * every case. It is scheduled weekly rather than run per-merge: it needs the
 * network, and a network failure must not look like a cryptographic one.
 *
 * If this ever disagrees with the subset run, that is a real finding — either
 * the subset is hiding something or the upstream moved under a pin that is
 * supposed to be immutable.
 *
 * Usage:  node scripts/full-acvp.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { sha224, sha256, sha384, sha512, sha512_224, sha512_256 } from '@noble/hashes/sha2.js';
import {
  sha3_224,
  sha3_256,
  sha3_384,
  sha3_512,
  shake128_32,
  shake256_64,
} from '@noble/hashes/sha3.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(ROOT, 'vectors/acvp/manifest.json'), 'utf8'));

const IMPL = { 'ML-DSA-44': ml_dsa44, 'ML-DSA-65': ml_dsa65, 'ML-DSA-87': ml_dsa87 };
const LAMBDA = { 'ML-DSA-44': 128, 'ML-DSA-65': 192, 'ML-DSA-87': 256 };
const HASHES = {
  'SHA2-224': sha224,
  'SHA2-256': sha256,
  'SHA2-384': sha384,
  'SHA2-512': sha512,
  'SHA2-512/224': sha512_224,
  'SHA2-512/256': sha512_256,
  'SHA3-224': sha3_224,
  'SHA3-256': sha3_256,
  'SHA3-384': sha3_384,
  'SHA3-512': sha3_512,
  // FIPS 204 §5.4.1 / RFC 8702 fix these output lengths through the OID.
  'SHAKE-128': shake128_32,
  'SHAKE-256': shake256_64,
};

const hex = (h) => Uint8Array.from(Buffer.from(h ?? '', 'hex'));
const toHex = (b) => Buffer.from(b).toString('hex').toUpperCase();

/** FIPS 204 §5.4 fn. 6: a pre-hash digest needs at least 2λ bits. */
const meetsStrength = (set, alg) => (HASHES[alg].outputLen * 8) / 2 >= LAMBDA[set];

async function fetchPinned(key) {
  const entry = manifest.files[key];
  const url = `https://raw.githubusercontent.com/usnistgov/ACVP-Server/${manifest.upstream.commit}/${entry.upstreamPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const digest = createHash('sha256').update(body).digest('hex');
  if (digest !== entry.upstreamSha256) {
    throw new Error(
      `${entry.upstreamPath}: digest ${digest} != pinned ${entry.upstreamSha256}. ` +
        'The pinned commit is supposed to be immutable — investigate before touching the pin.'
    );
  }
  return JSON.parse(body.toString('utf8'));
}

let pass = 0;
let refused = 0;
const failures = [];

function record(where, detail) {
  failures.push(`${where}: ${detail}`);
}

async function main() {
  process.stderr.write(
    `full-acvp: ${manifest.upstream.repository} @ ${manifest.upstream.release} (${manifest.upstream.commit})\n`
  );

  // ── keyGen ───────────────────────────────────────────────────────────────
  for (const group of (await fetchPinned('keyGen')).testGroups) {
    const impl = IMPL[group.parameterSet];
    for (const t of group.tests) {
      const keys = impl.keygen(hex(t.seed));
      if (toHex(keys.publicKey) !== t.pk) record(`keyGen tc${t.tcId}`, 'public key mismatch');
      else if (toHex(keys.secretKey) !== t.sk) record(`keyGen tc${t.tcId}`, 'secret key mismatch');
      else if (toHex(impl.getPublicKey(hex(t.sk))) !== t.pk)
        record(`keyGen tc${t.tcId}`, 'getPublicKey mismatch');
      else pass++;
    }
  }

  // ── sigGen ───────────────────────────────────────────────────────────────
  for (const group of (await fetchPinned('sigGen')).testGroups) {
    const impl = IMPL[group.parameterSet];
    for (const t of group.tests) {
      const entropy = group.deterministic ? false : hex(t.rnd);
      const strong = group.preHash !== 'preHash' || meetsStrength(group.parameterSet, t.hashAlg);
      try {
        let sig;
        if (group.signatureInterface === 'external') {
          const signer = group.preHash === 'preHash' ? impl.prehash(HASHES[t.hashAlg]) : impl;
          sig = signer.sign(hex(t.message), hex(t.sk), {
            context: hex(t.context),
            extraEntropy: entropy,
          });
        } else {
          const input = group.externalMu ? hex(t.mu) : hex(t.message);
          sig = impl.internal.sign(input, hex(t.sk), {
            extraEntropy: entropy,
            externalMu: group.externalMu,
          });
        }
        if (!strong) record(`sigGen tc${t.tcId}`, `${t.hashAlg} accepted but is below lambda`);
        else if (toHex(sig) !== t.signature) record(`sigGen tc${t.tcId}`, 'signature mismatch');
        else pass++;
      } catch (err) {
        if (!strong) refused++;
        else record(`sigGen tc${t.tcId}`, `unexpected throw: ${err.message}`);
      }
    }
  }

  // ── sigVer ───────────────────────────────────────────────────────────────
  for (const group of (await fetchPinned('sigVer')).testGroups) {
    const impl = IMPL[group.parameterSet];
    for (const t of group.tests) {
      const strong = group.preHash !== 'preHash' || meetsStrength(group.parameterSet, t.hashAlg);
      try {
        let got;
        if (group.signatureInterface === 'external') {
          const v = group.preHash === 'preHash' ? impl.prehash(HASHES[t.hashAlg]) : impl;
          got = v.verify(hex(t.signature), hex(t.message), hex(t.pk), { context: hex(t.context) });
        } else {
          const input = group.externalMu ? hex(t.mu) : hex(t.message);
          got = impl.internal.verify(hex(t.signature), input, hex(t.pk), {
            externalMu: group.externalMu,
          });
        }
        if (!strong) record(`sigVer tc${t.tcId}`, `${t.hashAlg} accepted but is below lambda`);
        else if (got !== t.testPassed)
          record(`sigVer tc${t.tcId}`, `expected ${t.testPassed}, got ${got} (${t.reason})`);
        else pass++;
      } catch (err) {
        if (!strong) refused++;
        else record(`sigVer tc${t.tcId}`, `unexpected throw: ${err.message}`);
      }
    }
  }

  const total = pass + refused + failures.length;
  process.stderr.write(
    `\nfull-acvp: ${total} cases — ${pass} matched, ${refused} refused under FIPS 204 §5.4, ` +
      `${failures.length} unexplained\n`
  );

  if (failures.length > 0) {
    for (const f of failures.slice(0, 40)) process.stderr.write(`  ${f}\n`);
    if (failures.length > 40) process.stderr.write(`  …and ${failures.length - 40} more\n`);
    process.exit(1);
  }

  // The subset is only trustworthy if the full set agrees with it AND the full
  // set is genuinely bigger. A silently-empty run must not read as success.
  const vendored = Object.values(manifest.files).reduce((n, f) => n + f.testCases, 0);
  if (total <= vendored) {
    process.stderr.write(
      `full-acvp: only ${total} cases ran, which is not more than the ${vendored} vendored — ` +
        'the upstream files did not load as expected.\n'
    );
    process.exit(1);
  }
  process.stderr.write('full-acvp: the complete upstream vector set agrees with the vendored subset.\n');
}

await main();
