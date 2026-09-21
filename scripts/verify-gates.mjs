#!/usr/bin/env node
/**
 * Prove the gates are not vacuous, by breaking things on purpose.
 *
 * Every test in this repository passes. That is necessary and it is not the
 * interesting question. The interesting question is whether any of them would
 * NOTICE if the thing they check stopped being true — and a test suite cannot
 * answer that about itself, because a test that asserts nothing passes exactly
 * as loudly as one that asserts everything.
 *
 * So this introduces a specific, realistic defect, runs the gate that is
 * supposed to catch it, and requires that gate to FAIL. A gate that stays green
 * with the defect in place is reported as broken — which is the only way to find
 * out that a check has quietly stopped checking.
 *
 * Each mutation below corresponds to a claim this project makes loudly enough
 * that someone might rely on it.
 *
 * Usage:  node scripts/verify-gates.mjs [--only <name>]
 *
 * It edits files in place and restores them in a `finally`. It refuses to run
 * on a dirty working tree, so a crash can never lose uncommitted work.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The command must exit NON-ZERO once the defect is in place. `find` must
 * appear at least once — a refactor that moves the code is reported rather than
 * silently mutating nothing — and only the FIRST occurrence is replaced, which
 * is enough to break the property and keeps anchors that legitimately repeat
 * (the same action pinned in four jobs) usable.
 */
const MUTATIONS = [
  {
    name: 'csp-removed',
    claim: 'The page ships an enforced Content-Security-Policy',
    file: 'index.html',
    find: '<meta\n      http-equiv="Content-Security-Policy"',
    replace: '<meta\n      http-equiv="X-Disabled-For-Mutation-Test"',
    command: 'npx playwright test e2e/csp.spec.ts',
  },
  {
    name: 'verify-always-true',
    claim: 'An invalid signature is rejected',
    file: 'src/crypto/mldsa.ts',
    find: '  const impl = VARIANT_MAP[variant];\n  // noble argument order: (signature, message, publicKey).\n  return impl.verify(signature, message, publicKey);',
    replace: '  const impl = VARIANT_MAP[variant];\n  void impl;\n  return true;',
    command: 'npx vitest run src/__tests__/properties.test.ts src/__tests__/malformed-inputs.test.ts',
  },
  {
    name: 'length-check-removed',
    claim: 'FIPS 204 §3.6.2 — a wrong-length key or signature returns false',
    file: 'src/crypto/mldsa.ts',
    find: '  if (publicKey.length !== params.publicKey) return false;',
    replace: '  void params;',
    command: 'npx vitest run src/__tests__/malformed-inputs.test.ts',
  },
  {
    name: 'math-random-in-crypto',
    claim: 'No non-cryptographic randomness in the cryptographic path',
    file: 'src/crypto/random.ts',
    find: '  const out = new Uint8Array(length);',
    replace: '  const out = new Uint8Array(length);\n  if (length === -1) out[0] = Math.random();',
    command: 'npx vitest run src/__tests__/runtime.test.ts',
  },
  {
    name: 'wrong-parameter-value',
    claim: 'Every FIPS 204 parameter on the page matches the standard',
    file: 'src/data/parameters.ts',
    find: '    tau: 49,',
    replace: '    tau: 50,',
    command: 'npx vitest run src/__tests__/parameters.test.ts',
  },
  {
    name: 'stale-library-version',
    claim: 'The version the page shows cannot drift from the lockfile',
    file: 'build/runtime-facts.ts',
    find: "  const library = pin(lock, '@noble/post-quantum');",
    replace:
      "  const library = { ...pin(lock, '@noble/post-quantum'), version: '0.0.1-stale' };",
    command: 'npx vitest run src/__tests__/runtime.test.ts',
  },
  {
    name: 'unpinned-action',
    claim: 'Every GitHub Action is pinned to an immutable commit SHA',
    file: '.github/workflows/deploy.yml',
    find: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    replace: 'actions/checkout@v7',
    command: 'node scripts/check-action-pins.mjs',
  },
  {
    name: 'unsafe-inline-csp',
    claim: 'The build refuses a policy with an unsafe token',
    file: 'index.html',
    find: "script-src 'self' {{CSP_SCRIPT_HASHES}}",
    replace: "script-src 'self' 'unsafe-inline' {{CSP_SCRIPT_HASHES}}",
    command: 'npm run build',
  },
  {
    name: 'ranking-language',
    claim: 'No parameter set is presented as automatically best',
    file: 'src/ui/tab1-sign-verify.ts',
    find: "  const note = '';",
    replace: "  const note = ' (ML-DSA-87 prioritizes security over speed)';",
    command: 'npx playwright test e2e/resilience.spec.ts -g "automatically best"',
  },
  {
    name: 'overclaimed-security',
    claim: 'No page states a security property as an achieved fact',
    file: 'index.html',
    find: 'it is <em>designed</em> to keep signatures unforgeable',
    replace: 'it is provably secure and cannot be forged',
    command: 'npx playwright test e2e/provenance.spec.ts -g "hedged"',
  },
  {
    name: 'corrupted-vector',
    claim: 'The pinned NIST vectors are the ones the manifest records',
    file: 'vectors/acvp/ml-dsa-keygen.json',
    find: '"tcId": 1,',
    replace: '"tcId": 1001,',
    command: 'npx vitest run src/__tests__/acvp-conformance.test.ts',
  },
];

function run(command) {
  try {
    execSync(command, { cwd: ROOT, stdio: 'pipe' });
    return { failed: false };
  } catch (err) {
    return { failed: true, output: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
}

function main() {
  const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
  if (dirty) {
    process.stderr.write(
      'verify-gates: the working tree is dirty. This script edits files in place;\n' +
        'commit or stash first so a crash cannot lose your work.\n'
    );
    process.exit(1);
  }

  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
  const selected = only ? MUTATIONS.filter((m) => m.name === only) : MUTATIONS;
  if (selected.length === 0) {
    process.stderr.write(`verify-gates: no mutation named "${only}"\n`);
    process.exit(1);
  }

  const vacuous = [];
  for (const mutation of selected) {
    const path = join(ROOT, mutation.file);
    const original = readFileSync(path, 'utf8');
    const occurrences = original.split(mutation.find).length - 1;

    if (occurrences === 0) {
      // Not a failure of the gate — a failure of this script to still describe
      // the code. Either way it must be loud, because a mutation that changes
      // nothing passes as silently as one that is caught.
      vacuous.push(
        `${mutation.name}: its anchor is no longer present in ${mutation.file}, so nothing was mutated`
      );
      process.stderr.write(`  ?  ${mutation.name} — anchor no longer matches, cannot mutate\n`);
      continue;
    }

    try {
      writeFileSync(path, original.replace(mutation.find, mutation.replace));
      const result = run(mutation.command);
      if (result.failed) {
        process.stderr.write(`  ✓  ${mutation.name} — caught\n`);
      } else {
        vacuous.push(`${mutation.name}: "${mutation.claim}" — the gate stayed GREEN with the defect in place`);
        process.stderr.write(`  ✗  ${mutation.name} — NOT caught\n`);
      }
    } finally {
      writeFileSync(path, original);
    }
  }

  // Leave the tree exactly as it was found, including any build output the
  // mutated commands produced.
  run('npm run build');

  process.stderr.write(`\nverify-gates: ${selected.length - vacuous.length}/${selected.length} defects caught\n`);
  if (vacuous.length > 0) {
    process.stderr.write('\nGates that did not catch their defect:\n');
    for (const v of vacuous) process.stderr.write(`  - ${v}\n`);
    process.exit(1);
  }
  process.stderr.write('Every gate failed when the thing it checks was broken.\n');
}

main();
