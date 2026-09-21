#!/usr/bin/env node
/**
 * A deterministic SHA-256 manifest of everything in `dist/`.
 *
 * Two uses, both about the same question — *is the thing serving from Pages the
 * thing this source produces?*
 *
 *   1. CI builds twice from a clean tree and compares the two manifests. If
 *      they differ, the build is not reproducible and nobody — including the
 *      maintainer — can check what shipped against what was committed. It is
 *      reproducible today; this is what keeps it that way, because
 *      reproducibility is the kind of property that is lost by accident (a
 *      timestamp, a hash-map iteration order, a bundler's parallelism) and
 *      noticed years later.
 *   2. The manifest is published as a build artifact and printed in the log, so
 *      a reader who clones the repo at a tag and runs `npm ci && npm run build`
 *      can compare their own bytes against what CI produced.
 *
 * Output is sorted by path and contains no timestamps, so the manifest of one
 * build equals the manifest of any identical build.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function manifestFor(dir) {
  return walk(dir)
    .map((file) => {
      const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
      // Forward slashes so a manifest built on Windows matches one built on Linux.
      return `${digest}  ${relative(dir, file).split(sep).join('/')}`;
    })
    .sort()
    .join('\n');
}

function main() {
  let files;
  try {
    files = walk(DIST);
  } catch {
    process.stderr.write('hash-dist: no dist/ — run `npm run build` first\n');
    process.exit(1);
  }
  if (files.length === 0) {
    process.stderr.write('hash-dist: dist/ is empty\n');
    process.exit(1);
  }
  process.stdout.write(`${manifestFor(DIST)}\n`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
