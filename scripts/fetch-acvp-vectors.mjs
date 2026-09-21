#!/usr/bin/env node
/**
 * Re-derive the vendored NIST ACVP ML-DSA vectors from their pinned upstream.
 *
 * Run by a human, never by CI. CI verifies the *vendored* files against the
 * digests this script recorded (see `src/__tests__/acvp-conformance.test.ts`);
 * it does not fetch anything. That is the point: a conformance suite that
 * downloads its own test data at run time is testing whatever the network
 * happened to serve that morning, and an upstream edit would silently change
 * what "passes" means.
 *
 * Usage:
 *   node scripts/fetch-acvp-vectors.mjs           # verify the pins still match
 *   node scripts/fetch-acvp-vectors.mjs --write   # regenerate vectors/acvp/
 *
 * ── What is pinned ────────────────────────────────────────────────────────
 * The upstream is NIST's own ACVP-Server repository, at an immutable release
 * tag AND the full commit SHA that tag pointed to, AND the SHA-256 of each file
 * as fetched. All three, because each covers a different failure: a tag can be
 * moved, a commit cannot; a commit fixes the tree but not what a proxy or
 * mirror hands back, and the digest does.
 *
 * ── Why a subset, and how it is chosen ────────────────────────────────────
 * The three upstream files total ~14 MB, dominated by per-test key material.
 * Vendoring them whole would put 14 MB into every clone and CI checkout of a
 * teaching repo. The subset rule is deterministic, stated here, and re-derivable
 * by anyone with the pinned commit:
 *
 *   keyGen  first 5 tests of every test group
 *   sigGen  first 3 tests that satisfy FIPS 204 §5.4, plus the first that does not
 *   sigVer  per distinct `reason`, the first test satisfying §5.4 (else the first
 *           of that reason), plus the first non-satisfying test in the group
 *
 * EVERY test group is kept in all three. That is what makes the subset honest
 * rather than convenient: the groups are the modes — parameter set x
 * deterministic/hedged x external/internal interface x pure/prehash x
 * externalMu — so no mode is dropped, only repetitions within a mode. The
 * sigVer rule keeps one of every rejection reason NIST generates (modified
 * message, modified z, modified hint, modified commitment, and the valid
 * control) in each of its 12 groups.
 *
 * ── Why the rules mention FIPS 204 §5.4 ───────────────────────────────────
 * §5.4 (with footnote 6) requires a pre-hash digest to give at least λ bits of
 * collision strength, i.e. to be at least 2λ bits long. ACVP also generates
 * pairings below that bound — ML-DSA-87 with SHA2-224, say — because Algorithm 4
 * "may be used with other hash functions or XOFs". A conformant implementation
 * may refuse those, and @noble/post-quantum does.
 *
 * A naive "first N tests" rule therefore produced groups whose only vendored
 * cases were ones the library refuses, including two sigVer groups whose valid
 * control was unrunnable — the suite would have asserted nothing about signing
 * or verifying there and still gone green. Selecting satisfying cases FIRST, and
 * deliberately keeping one non-satisfying case, gives every group both branches:
 * answers that must match NIST exactly, and a pairing that must be refused.
 *
 * Fields not needed to run a test are dropped: `deferred` everywhere, and `pk`
 * from sigGen, where the expected signature is compared byte-for-byte and the
 * public key is re-derived from the secret key by the test instead.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'vectors', 'acvp');

const UPSTREAM = {
  repository: 'https://github.com/usnistgov/ACVP-Server',
  release: 'v1.1.0.43',
  commit: '975de31eb83d87039ec88934fdc47d8c312b892d',
};

/**
 * Digest length in bits for each hash ACVP names, used only by the selection
 * rule below. FIPS 180-4 and FIPS 202.
 */
const DIGEST_BITS = {
  'SHA2-224': 224,
  'SHA2-256': 256,
  'SHA2-384': 384,
  'SHA2-512': 512,
  'SHA2-512/224': 224,
  'SHA2-512/256': 256,
  'SHA3-224': 224,
  'SHA3-256': 256,
  'SHA3-384': 384,
  'SHA3-512': 512,
  // FIPS 204 §5.4.1 / RFC 8702 fix the XOF output length via the OID.
  'SHAKE-128': 256,
  'SHAKE-256': 512,
};

/** λ from FIPS 204 Table 1 — the collision strength of c̃. */
const LAMBDA = { 'ML-DSA-44': 128, 'ML-DSA-65': 192, 'ML-DSA-87': 256 };

/**
 * FIPS 204 §5.4 footnote 6: at least λ bits of collision strength requires a
 * digest of at least 2λ bits. Non-prehash groups satisfy this vacuously.
 */
const meetsPrehashStrength = (group, test) =>
  group.preHash !== 'preHash' || DIGEST_BITS[test.hashAlg] / 2 >= LAMBDA[group.parameterSet];

/** Keep upstream order regardless of which bucket a test was chosen from. */
const inUpstreamOrder = (tests, chosen) => tests.filter((t) => chosen.has(t));

/** `sha256` is the digest of the COMPLETE upstream file, before any subsetting. */
const FILES = [
  {
    key: 'keyGen',
    path: 'gen-val/json-files/ML-DSA-keyGen-FIPS204/internalProjection.json',
    sha256: 'e67ee6540d40e11506c3c4e3b1f79fc1cefcd49820db99fc61f87cc8ba463baf',
    out: 'ml-dsa-keygen.json',
    keep: ['tcId', 'seed', 'pk', 'sk'],
    select: (tests) => tests.slice(0, 5),
  },
  {
    key: 'sigGen',
    path: 'gen-val/json-files/ML-DSA-sigGen-FIPS204/internalProjection.json',
    sha256: '72dcaf5f69853ca267ccd16af9cb40949786aca0fcfbf05d1ebeba132b93af22',
    out: 'ml-dsa-siggen.json',
    keep: ['tcId', 'message', 'mu', 'rnd', 'sk', 'context', 'hashAlg', 'signature'],
    select: (tests, group) => {
      const chosen = new Set(tests.filter((t) => meetsPrehashStrength(group, t)).slice(0, 3));
      const weak = tests.find((t) => !meetsPrehashStrength(group, t));
      if (weak) chosen.add(weak);
      return inUpstreamOrder(tests, chosen);
    },
  },
  {
    key: 'sigVer',
    path: 'gen-val/json-files/ML-DSA-sigVer-FIPS204/internalProjection.json',
    sha256: '47cdd6314c7f746d02421ffcba89d4dbc7bb875ac49e07a029fdfc26fba55437',
    out: 'ml-dsa-sigver.json',
    keep: ['tcId', 'testPassed', 'reason', 'pk', 'message', 'mu', 'context', 'hashAlg', 'signature'],
    select: (tests, group) => {
      const chosen = new Set();
      for (const reason of new Set(tests.map((t) => t.reason))) {
        const ofReason = tests.filter((t) => t.reason === reason);
        // Prefer a case the library will actually run; fall back to the first
        // of that reason so no reason is ever dropped.
        chosen.add(ofReason.find((t) => meetsPrehashStrength(group, t)) ?? ofReason[0]);
      }
      const weak = tests.find((t) => !meetsPrehashStrength(group, t));
      if (weak) chosen.add(weak);
      return inUpstreamOrder(tests, chosen);
    },
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function fetchPinned(file) {
  const url = `https://raw.githubusercontent.com/usnistgov/ACVP-Server/${UPSTREAM.commit}/${file.path}`;
  process.stderr.write(`fetching ${file.key} ...\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const got = sha256(body);
  if (got !== file.sha256) {
    throw new Error(
      `${file.path}: upstream digest mismatch\n  expected ${file.sha256}\n  got      ${got}\n` +
        'The pinned commit should be immutable. Investigate before touching the pin.'
    );
  }
  return JSON.parse(body.toString('utf8'));
}

/** Keep every group; thin the tests inside each one by the file's own rule. */
function subset(doc, file) {
  return {
    algorithm: doc.algorithm,
    mode: doc.mode,
    revision: doc.revision,
    testGroups: doc.testGroups.map((group) => {
      const { tests, ...meta } = group;
      return {
        ...meta,
        tests: file.select(tests, group).map((t) =>
          Object.fromEntries(Object.entries(t).filter(([k]) => file.keep.includes(k)))
        ),
      };
    }),
  };
}

const write = process.argv.includes('--write');
const manifest = {
  $comment:
    'Generated by scripts/fetch-acvp-vectors.mjs. `upstreamSha256` is the digest of the complete ' +
    'upstream file at the pinned commit; `vendoredSha256` is the digest of the subset in this repo. ' +
    'The test suite verifies the vendored digests on every run and never fetches anything.',
  upstream: UPSTREAM,
  generatedBy: 'scripts/fetch-acvp-vectors.mjs',
  selectionRule: {
    keyGen: 'first 5 tests of every test group',
    sigGen:
      'first 3 tests satisfying FIPS 204 §5.4 pre-hash strength, plus the first that does not',
    sigVer:
      'per distinct `reason`, the first test satisfying FIPS 204 §5.4 (else the first of that reason), plus the first non-satisfying test in the group',
    note: 'Every test group is retained in all three files; only repetitions within a group are dropped. Selecting §5.4-satisfying cases first guarantees each group has cases the implementation runs as well as a pairing it must refuse.',
  },
  files: {},
};

for (const file of FILES) {
  const doc = await fetchPinned(file);
  const picked = subset(doc, file);
  const json = `${JSON.stringify(picked, null, 2)}\n`;
  const groups = picked.testGroups.length;
  const tests = picked.testGroups.reduce((n, g) => n + g.tests.length, 0);

  manifest.files[file.key] = {
    upstreamPath: file.path,
    upstreamSha256: file.sha256,
    vendoredFile: file.out,
    vendoredSha256: sha256(Buffer.from(json, 'utf8')),
    testGroups: groups,
    testCases: tests,
    upstreamTestCases: doc.testGroups.reduce((n, g) => n + g.tests.length, 0),
    fieldsKept: file.keep,
  };

  if (write) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, file.out), json);
  }
  process.stderr.write(`  ${file.key}: ${groups} groups, ${tests} cases\n`);
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
if (write) {
  writeFileSync(join(OUT_DIR, 'manifest.json'), manifestJson);
  process.stderr.write(`wrote ${OUT_DIR}\n`);
} else {
  const current = readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8');
  if (current !== manifestJson) {
    process.stderr.write('manifest differs from what this script would write; run with --write\n');
    process.exit(1);
  }
  process.stderr.write('vendored vectors are in sync with the pinned upstream\n');
}
