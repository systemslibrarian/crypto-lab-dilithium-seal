#!/usr/bin/env node
/**
 * Refuse any GitHub Action that is not pinned to an immutable commit SHA.
 *
 * `actions/checkout@v7` is not a version, it is a *pointer*. Whoever controls
 * that repository can move it, and the next CI run then executes different code
 * with the same spelling — with this repository's `GITHUB_TOKEN`, its
 * `pages: write` permission, and its `npm ci` tree. That is the shortest path
 * from a compromised upstream to a compromised published artifact, and it
 * leaves no trace in this repository's diff.
 *
 * A 40-character commit SHA cannot be moved. The trailing `# vX.Y.Z` comment
 * says which release the SHA was, so a human can read the file and Dependabot
 * can keep both current — it understands SHA pins and rewrites the comment with
 * the SHA.
 *
 * Usage:  node scripts/check-action-pins.mjs
 * Exits non-zero, listing every offender, if anything is unpinned.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

/** `uses:` lines, with the surrounding quoting GitHub Actions permits. */
const USES = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?\s*(?:#\s*(.*))?$/;

/**
 * Actions that need no pin.
 *
 * Local (`./…`) actions live in this repository and are already covered by its
 * own review; a Docker reference (`docker://…`) is pinned by its own digest
 * when one is given. Everything else must be `owner/repo@<40 hex>`.
 */
const isLocal = (ref) => ref.startsWith('./') || ref.startsWith('.\\');
const isDocker = (ref) => ref.startsWith('docker://');
const SHA_PINNED = /^[^@]+@[0-9a-f]{40}$/;

export function findWorkflowFiles(dir = WORKFLOW_DIR) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile());
}

/**
 * Every problem in one workflow's text.
 *
 * Exported and pure so the rule is unit-testable without writing workflow files
 * to disk.
 */
export function checkWorkflowText(text, filename = 'workflow') {
  const problems = [];
  text.split('\n').forEach((line, index) => {
    const match = line.match(USES);
    if (!match) return;
    const [, ref, comment] = match;
    if (isLocal(ref) || isDocker(ref)) return;

    const where = `${filename}:${index + 1}`;
    if (!ref.includes('@')) {
      problems.push(`${where}: "${ref}" has no version at all`);
      return;
    }
    if (!SHA_PINNED.test(ref)) {
      const [name, version] = ref.split('@');
      problems.push(
        `${where}: "${ref}" is pinned to the movable ref "${version}". ` +
          `Use ${name}@<40-character commit sha> # ${version}`
      );
      return;
    }
    // Pinned — but a SHA with no comment is unreadable and unmaintainable, and
    // Dependabot uses the comment to know which version it is updating from.
    if (!comment || !/v?\d/.test(comment)) {
      problems.push(
        `${where}: "${ref}" is pinned but carries no "# vX.Y.Z" comment saying which release it is`
      );
    }
  });
  return problems;
}

function main() {
  const files = findWorkflowFiles();
  if (files.length === 0) {
    process.stderr.write('check-action-pins: no workflow files found — is this the repo root?\n');
    process.exit(1);
  }

  const problems = files.flatMap((file) =>
    checkWorkflowText(readFileSync(file, 'utf8'), file.slice(ROOT.length))
  );

  if (problems.length > 0) {
    process.stderr.write('Unpinned GitHub Actions found:\n\n');
    for (const problem of problems) process.stderr.write(`  ${problem}\n`);
    process.stderr.write(
      '\nA tag is a pointer its owner can move; a commit SHA cannot be moved. Resolve one with:\n' +
        '  gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha\n'
    );
    process.exit(1);
  }

  const count = files.reduce(
    (n, file) => n + (readFileSync(file, 'utf8').match(/^\s*(?:-\s*)?uses:/gm) ?? []).length,
    0
  );
  process.stderr.write(
    `check-action-pins: ${count} action reference(s) across ${files.length} workflow(s), all SHA-pinned\n`
  );
}

// Only run when invoked directly, so the test can import the pure helpers.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
