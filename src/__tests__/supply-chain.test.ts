/**
 * Supply-chain gate tests.
 *
 * These assert over the *configuration*, not over the code, because the thing
 * being claimed is a property of the pipeline: "a pull request that introduces a
 * moderate-or-higher advisory cannot go green, and an automated dependency PR
 * cannot merge itself past it."
 *
 * That claim has no other oracle. A green CI run proves the current tree is
 * clean; it does not prove the gate exists, and before this suite the gate did
 * not exist at all — nothing in the pipeline ran `npm audit`, so a Dependabot
 * bump that pulled in a vulnerable transitive dependency would have merged
 * itself on the strength of unit tests that know nothing about advisories.
 *
 * The workflow is read as text rather than parsed as YAML on purpose: adding a
 * YAML parser to devDependencies to check a supply-chain rule would widen the
 * very surface the rule exists to narrow.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const workflow = read('.github/workflows/deploy.yml');
const dependabot = read('.github/dependabot.yml');
const pkg = JSON.parse(read('package.json')) as {
  engines?: { node?: string };
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>;
};
const lock = JSON.parse(read('package-lock.json')) as {
  lockfileVersion: number;
  packages: Record<string, { version?: string; resolved?: string; integrity?: string }>;
};

describe('vulnerability gate', () => {
  it('runs npm audit at moderate-or-higher, which is what makes it fail closed', () => {
    // `--audit-level=moderate` is the whole gate: without it `npm audit` exits 0
    // and reports advisories as prose that nothing reads.
    expect(pkg.scripts['audit:ci']).toBe('npm audit --audit-level=moderate');
    expect(workflow).toContain('npm run audit:ci');
  });

  it('audits the tree npm ci produces, not a re-resolved one', () => {
    const auditJob = workflow.slice(workflow.indexOf('  audit:'), workflow.indexOf('  build:'));
    expect(auditJob).toContain('npm ci');
    expect(auditJob).not.toContain('npm install');
  });

  it('blocks deployment and Dependabot self-merge on the audit job', () => {
    // Both are `needs: [audit, build]`. If either lost `audit`, a vulnerable
    // tree could still ship or still merge itself, and every other test here
    // would stay green.
    const needs = Array.from(workflow.matchAll(/^ {4}needs: (.+)$/gm)).map((m) => m[1].trim());
    expect(needs.length).toBe(2);
    for (const n of needs) {
      expect(n).toContain('audit');
      expect(n).toContain('build');
    }
  });

  it('keeps the full test/build/browser suite in the job Dependabot must pass', () => {
    const buildJob = workflow.slice(workflow.indexOf('  build:'), workflow.indexOf('  deploy:'));
    for (const step of ['npm ci', 'npm test', 'npm run build', 'npm run test:a11y']) {
      expect(buildJob).toContain(step);
    }
  });
});

describe('reproducible install', () => {
  it('pins one Node version for CI and local checkouts from a single file', () => {
    expect(read('.nvmrc').trim()).toBe('22');
    // `node-version-file` rather than a literal, so the two cannot drift.
    expect(workflow).toContain('node-version-file: .nvmrc');
    expect(workflow).not.toMatch(/node-version: \d/);
  });

  it('declares an engines range every dependency actually supports', () => {
    // vitest 5 is the strictest: ^22.12.0 || ^24.0.0 || >=26.0.0. The previous
    // CI pin of Node 20 satisfied neither this range nor Node's own support
    // window — Node 20 went end-of-life in April 2026.
    expect(pkg.engines?.node).toBe('^22.12.0 || ^24.0.0 || >=26.0.0');
    expect(pkg.engines?.node).not.toMatch(/\b20\b/);
  });

  it('has a lockfile with an integrity hash for every resolved package', () => {
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(3);
    const missing = Object.entries(lock.packages)
      .filter(([name, meta]) => name !== '' && meta.resolved && !meta.integrity)
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
});

describe('dependabot policy', () => {
  it('groups minor and patch upgrades for both ecosystems', () => {
    const groups = Array.from(dependabot.matchAll(/^ {6}([\w-]+):$/gm)).map((m) => m[1]);
    expect(groups).toEqual(['npm-minor-and-patch', 'github-actions-minor-and-patch']);
  });

  it('leaves majors out of every group, so each arrives on its own', () => {
    // Two groups, each restricted to minor+patch. A `update-types` list that
    // gained "major" — or a group that dropped the list entirely, which means
    // "everything" — would bundle a breaking bump with safe ones.
    const updateTypes = Array.from(
      dependabot.matchAll(/update-types:\n((?: {10}- "[a-z]+"\n)+)/g)
    ).map((m) => m[1].match(/"([a-z]+)"/g)?.join(',') ?? '');
    expect(updateTypes).toEqual(['"minor","patch"', '"minor","patch"']);
  });
});
