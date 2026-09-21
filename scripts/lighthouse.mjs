#!/usr/bin/env node
/**
 * Lighthouse budgets, enforced over three runs.
 *
 * ── Why three runs, and why the MEDIAN ────────────────────────────────────
 * A single Lighthouse run on a shared CI runner is noisy: the performance score
 * moves several points between identical runs depending on what else the host
 * is doing. Gating on one run means the build fails at random, which trains
 * everyone to re-run CI until it passes — at which point the gate has stopped
 * being a gate. Three runs and the median is the cheapest defensible answer.
 *
 * Accessibility is the exception. It is scored from deterministic audits, not
 * from timings, so it does not vary between runs — and the threshold here is
 * 1.00, meaning EVERY run must be perfect. The median would hide one bad run;
 * for this category the worst run is the one that matters.
 *
 * Usage:  node scripts/lighthouse.mjs <url>
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'lighthouse-report');
const RUNS = 3;

/**
 * Minimum score per category, and how the three runs are combined.
 *
 * `worst` for accessibility because a 1.00 threshold means no run may regress;
 * `median` for the rest because they are timing-sensitive on shared runners.
 */
export const BUDGETS = [
  { category: 'performance', minimum: 0.9, combine: 'median' },
  { category: 'accessibility', minimum: 1.0, combine: 'worst' },
  { category: 'best-practices', minimum: 0.9, combine: 'median' },
  { category: 'seo', minimum: 0.9, combine: 'median' },
];

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function combine(values, how) {
  return how === 'worst' ? Math.min(...values) : median(values);
}

/** Decide pass/fail from collected scores. Pure, so it is unit-testable. */
export function evaluate(scoresByCategory, budgets = BUDGETS) {
  return budgets.map((budget) => {
    const scores = scoresByCategory[budget.category] ?? [];
    const value = scores.length > 0 ? combine(scores, budget.combine) : 0;
    return {
      category: budget.category,
      scores,
      combined: value,
      how: budget.combine,
      minimum: budget.minimum,
      // Scores are reported to two decimals by Lighthouse; compare with a small
      // epsilon so 0.8999999 from floating point does not fail a 0.90 budget.
      passed: value + 1e-9 >= budget.minimum,
    };
  });
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    process.stderr.write('usage: node scripts/lighthouse.mjs <url>\n');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const scoresByCategory = {};
  try {
    for (let run = 1; run <= RUNS; run++) {
      process.stderr.write(`lighthouse: run ${run} of ${RUNS} against ${url}\n`);
      const result = await lighthouse(
        url,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        undefined
      );
      if (!result?.lhr) throw new Error(`lighthouse run ${run} produced no result`);

      writeFileSync(join(OUT_DIR, `run-${run}.json`), result.report);
      for (const [category, data] of Object.entries(result.lhr.categories)) {
        (scoresByCategory[category] ??= []).push(data.score ?? 0);
      }
    }
  } finally {
    await chrome.kill();
  }

  const results = evaluate(scoresByCategory);
  process.stderr.write('\n');
  for (const r of results) {
    const runs = r.scores.map((s) => s.toFixed(2)).join(', ');
    process.stderr.write(
      `${r.passed ? 'PASS' : 'FAIL'}  ${r.category.padEnd(15)} ` +
        `${r.how} ${r.combined.toFixed(2)} (min ${r.minimum.toFixed(2)})  runs: ${runs}\n`
    );
  }
  writeFileSync(join(OUT_DIR, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);

  if (results.some((r) => !r.passed)) {
    process.stderr.write('\nLighthouse budgets not met.\n');
    process.exit(1);
  }
  process.stderr.write('\nAll Lighthouse budgets met.\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await main();
}
