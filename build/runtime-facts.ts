/**
 * Read the facts about the implementation that ships, from the lockfile.
 *
 * The page states which cryptographic library it runs and at which version.
 * Written by hand, that sentence drifts the first time Dependabot lands a bump:
 * the site would keep naming the old version with nothing to catch it, and a
 * version claim that can be wrong is worse than no version claim, because a
 * reader uses it to decide which advisories and which audit apply.
 *
 * So the value is derived at build time from `package-lock.json` — the same
 * file `npm ci` installs from, not `package.json`, whose `^0.7.1` is a range
 * and not a fact. `src/__tests__/runtime.test.ts` re-reads the lockfile and
 * asserts the injected value still matches, so the two cannot separate.
 *
 * Everything here is a fact about the artifact. Nothing here is a judgement:
 * "not independently audited" is quoted from the library's own README and
 * pinned by a test that reads that README, so if it is ever audited the test
 * fails and a human updates the claim rather than the page quietly under- or
 * over-stating it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface LockPackage {
  version?: string;
  resolved?: string;
  integrity?: string;
}
interface Lockfile {
  packages: Record<string, LockPackage>;
}

import type { PinnedPackage, RuntimeFacts } from '../src/data/runtime.ts';

export type { PinnedPackage, RuntimeFacts };

function pin(lock: Lockfile, name: string): PinnedPackage {
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry?.version) {
    throw new Error(
      `runtime-facts: ${name} is not in package-lock.json. The page cannot state a version it ` +
        'cannot derive; fix the lockfile rather than hard-coding one.'
    );
  }
  if (!entry.resolved || !entry.integrity) {
    throw new Error(`runtime-facts: ${name} has no resolved URL or integrity hash in the lockfile`);
  }
  return { name, version: entry.version, resolved: entry.resolved, integrity: entry.integrity };
}

/** Semver compare restricted to the `x.y.z` this needs; no range handling. */
export function isAfter(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

export function readRuntimeFacts(): RuntimeFacts {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as Lockfile;
  const library = pin(lock, '@noble/post-quantum');

  // Quoted from node_modules/@noble/post-quantum/README.md, and pinned by
  // src/__tests__/runtime.test.ts, which reads that file.
  const SELF_AUDITED_VERSION = '0.6.1';

  return {
    library,
    // @noble/hashes is not incidental here: SHAKE128/SHAKE256 are where ML-DSA's
    // matrix expansion, challenge sampling and message representative come from.
    dependencies: [pin(lock, '@noble/hashes')],
    repository: 'https://github.com/paulmillr/noble-post-quantum',
    implementationType: 'javascript',
    randomnessSource: 'crypto.getRandomValues (Web Crypto API)',
    supportedModes: [
      'ML-DSA-44 / ML-DSA-65 / ML-DSA-87',
      'Pure ML-DSA (FIPS 204 Algorithms 2 and 3)',
      'Hedged signing (default) and deterministic signing',
      'Context strings up to 255 bytes',
      'HashML-DSA pre-hash signing (FIPS 204 §5.4)',
      'Internal interface, including external-µ',
    ],
    audit: {
      independent: false,
      statement: 'The library has not been independently audited yet.',
      selfAuditedVersion: SELF_AUDITED_VERSION,
      selfAuditedDate: '2026-04',
      shippedVersionIsAfterSelfAudit: isAfter(library.version, SELF_AUDITED_VERSION),
    },
    validation: {
      cmvp: false,
      fips140: false,
      statement:
        'This implementation has no CMVP certificate and no FIPS 140 validation. Passing NIST ' +
        'ACVP known-answer vectors is interoperability evidence and is not a validation.',
    },
    // Date only. A build timestamp to the second would change every build and
    // make the bundle non-reproducible for no reader benefit.
    builtAt: new Date().toISOString().slice(0, 10),
  };
}
