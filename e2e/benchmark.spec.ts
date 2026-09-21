import { expect, test, type Page } from '@playwright/test';

/**
 * The benchmark panel, in a real browser.
 *
 * The unit suite proves the statistics and the export shapes. Only a browser
 * can show the two properties that matter to a reader:
 *
 *  - the interface stays responsive while ~470 ML-DSA operations run. This is
 *    measured, not argued: the page counts animation frames during the run and
 *    the test asserts the longest gap between them stays small. The old panel
 *    ran 150 signatures in one blocking loop.
 *  - a downloaded file really does carry the environment. The exports are
 *    captured and parsed here, rather than trusting the serialiser's own tests.
 */

const RUN_TIMEOUT = 300_000;

async function openBenchmark(page: Page): Promise<void> {
  await page.goto('.');
  await page.locator('#tab-btn-compare').click();
  await expect(page.locator('#benchmark-panel')).toBeVisible();
}

async function runBenchmark(page: Page): Promise<void> {
  await page.locator('#btn-benchmark').click();
  await expect(page.locator('#bench-results')).toBeVisible({ timeout: RUN_TIMEOUT });
}

async function download(page: Page, selector: string): Promise<{ name: string; body: string }> {
  const d = await Promise.all([
    page.waitForEvent('download'),
    page.locator(selector).click(),
  ]).then(([event]) => event);
  const { readFile } = await import('node:fs/promises');
  return { name: d.suggestedFilename(), body: await readFile((await d.path())!, 'utf8') };
}

test.describe('methodology is stated before it is run', () => {
  test('declares the warm-up and sample counts on the panel', async ({ page }) => {
    await openBenchmark(page);
    const text = await page.locator('#benchmark-panel').innerText();
    expect(text).toContain('10 warm-up iterations');
    expect(text).toContain('50 timed samples');
    expect(text).toMatch(/median and p95/i);
  });

  test('carries the comparative-only caveat whether or not a run has happened', async ({ page }) => {
    await openBenchmark(page);
    const caveat = page.locator('#bench-caveat');
    await expect(caveat).toBeVisible();
    const text = await caveat.innerText();
    expect(text).toMatch(/not a performance guarantee/i);
    expect(text).toMatch(/one browser on one device/i);
    expect(text).toMatch(/Compare the parameter sets against each other within one run/i);
  });

  test('offers no export until there is something to export', async ({ page }) => {
    await openBenchmark(page);
    await expect(page.locator('#btn-bench-json')).toBeDisabled();
    await expect(page.locator('#btn-bench-csv')).toBeDisabled();
  });
});

test.describe('a measured run', () => {
  test.setTimeout(RUN_TIMEOUT);

  test('reports all three operations for all three parameter sets', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);

    const rows = await page.locator('#bench-results tbody tr').evaluateAll((trs) =>
      trs.map((tr) => ({
        set: (tr.querySelector('th') as HTMLElement).innerText.trim(),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
      })),
    );
    expect(rows).toHaveLength(9);
    for (const set of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
      const forSet = rows.filter((r) => r.set === set);
      expect(forSet.map((r) => r.cells[0]), set).toEqual(['keygen', 'sign', 'verify']);
    }
  });

  test('reports median and p95, not a mean alone, over 50 samples', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);
    // `.comparison-table thead th` is uppercased in CSS, so innerText comes
    // back as "MEDIAN". Match case-insensitively rather than asserting the
    // presentation.
    const header = (await page.locator('#bench-results thead').innerText()).toLowerCase();
    expect(header).toContain('median');
    expect(header).toContain('p95');
    expect(header).toContain('samples');

    const rows = await page.locator('#bench-results tbody tr').evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim())),
    );
    for (const cells of rows) {
      const [, median, p95, , min, max, samples] = cells;
      expect(Number(samples)).toBe(50);
      // Ordering that any real distribution must satisfy.
      expect(Number(min)).toBeLessThanOrEqual(Number(median));
      expect(Number(median)).toBeLessThanOrEqual(Number(p95));
      expect(Number(p95)).toBeLessThanOrEqual(Number(max));
      expect(Number(median)).toBeGreaterThan(0);
    }
  });

  test('shows the sizes of the parameter sets it measured, matching FIPS 204', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);
    const rows = await page.locator('#bench-sizes tbody tr').evaluateAll((trs) =>
      trs.map((tr) => ({
        set: (tr.querySelector('th') as HTMLElement).innerText.trim(),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
      })),
    );
    expect(rows.map((r) => [r.set, ...r.cells])).toEqual([
      ['ML-DSA-44', '1,312', '2,560', '2,420'],
      ['ML-DSA-65', '1,952', '4,032', '3,309'],
      ['ML-DSA-87', '2,592', '4,896', '4,627'],
    ]);
  });

  test('renders the environment beside the numbers, never numbers alone', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);
    const env = page.locator('#bench-environment');
    await expect(env).toBeVisible();
    const text = await env.innerText();
    for (const field of [
      'Browser',
      'Operating system',
      'Logical processors',
      'Timer source',
      'Timer resolution',
      'Library',
      'Warm-up iterations',
      'Measured iterations',
      'Timestamp',
    ]) {
      expect(text, field).toContain(field);
    }
    expect(text).toContain('performance.now()');
    expect(text).toMatch(/@noble\/post-quantum \d+\.\d+\.\d+/);
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('nothing is hard-coded: two runs produce different timings', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);
    const first = await page.locator('#bench-results tbody').innerText();
    await page.locator('#btn-benchmark').click();
    await expect(page.locator('#bench-results')).toBeVisible({ timeout: RUN_TIMEOUT });
    // Measured values must move between runs. Identical output across two runs
    // would mean the panel is printing constants.
    await expect
      .poll(async () => (await page.locator('#bench-results tbody').innerText()) !== first, {
        timeout: RUN_TIMEOUT,
      })
      .toBe(true);
  });
});

test.describe('the interface does not freeze', () => {
  test.setTimeout(RUN_TIMEOUT);

  test('animation frames keep arriving throughout the run', async ({ page }) => {
    await openBenchmark(page);

    // Record the gap between consecutive animation frames. A blocking loop
    // shows up as one enormous gap; yielding keeps every gap near a frame.
    await page.evaluate(() => {
      const w = window as unknown as { __frameGaps: number[] };
      w.__frameGaps = [];
      let previous = performance.now();
      const tick = (): void => {
        const now = performance.now();
        w.__frameGaps.push(now - previous);
        previous = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await runBenchmark(page);

    const gaps = await page.evaluate(
      () => (window as unknown as { __frameGaps: number[] }).__frameGaps,
    );
    expect(gaps.length, 'frames must have been observed during the run').toBeGreaterThan(30);
    const worst = Math.max(...gaps);
    // The old panel ran 50 signatures per parameter set in one uninterrupted
    // loop — seconds of blocked main thread. With a yield between iterations
    // the worst gap is bounded by roughly one operation.
    expect(worst, `longest blocked interval was ${worst.toFixed(0)} ms`).toBeLessThan(750);
  });

  test('the page stays interactive while measuring', async ({ page }) => {
    await openBenchmark(page);
    await page.locator('#btn-benchmark').click();
    // Switch tabs mid-run. If the main thread were blocked this would not
    // resolve until the whole benchmark finished.
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('#tab-btn-about')).toHaveAttribute('aria-selected', 'true', {
      timeout: 10_000,
    });
  });

  test('reports progress as it goes, rather than going silent', async ({ page }) => {
    await openBenchmark(page);
    await page.locator('#btn-benchmark').click();
    await expect(page.locator('#bench-progress')).toContainText(/Warming up|Measured/, {
      timeout: 30_000,
    });
    await expect(page.locator('#bench-results')).toBeVisible({ timeout: RUN_TIMEOUT });
    await expect(page.locator('#bench-progress')).toContainText('measurements');
  });
});

test.describe('exports', () => {
  test.setTimeout(RUN_TIMEOUT);

  test('the JSON carries environment, methodology, summaries and raw samples', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);

    const { name, body } = await download(page, '#btn-bench-json');
    expect(name).toMatch(/^ml-dsa-benchmark-.*\.json$/);

    const parsed = JSON.parse(body);
    expect(parsed.schema).toBe('dilithium-seal.benchmark.v1');
    expect(parsed.environment.browser).not.toBe('unknown');
    expect(parsed.environment.libraryVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(parsed.environment.timerSource).toContain('performance.now()');
    expect(parsed.methodology.warmupIterations).toBe(10);
    expect(parsed.methodology.measuredIterations).toBe(50);
    expect(parsed.methodology.percentileMethod).toMatch(/type-7/);
    expect(parsed.methodology.note).toMatch(/not a performance guarantee/i);

    // The classical comparison is part of the record, measured or explicitly not.
    expect(parsed.baseline.name).toBe('Ed25519');
    expect(typeof parsed.baseline.supported).toBe('boolean');
    if (parsed.baseline.supported) {
      expect(parsed.baseline.sizes).toEqual({ publicKeyBytes: 32, signatureBytes: 64 });
      expect(parsed.baseline.operations).toHaveLength(3);
      for (const op of parsed.baseline.operations) expect(op.rawSamplesMs).toHaveLength(50);
    } else {
      expect(parsed.baseline.unsupportedReason.length).toBeGreaterThan(10);
    }

    expect(parsed.results).toHaveLength(3);
    for (const result of parsed.results) {
      expect(result.operations).toHaveLength(3);
      for (const op of result.operations) {
        // The raw measurements are the evidence, and they are all here.
        expect(op.rawSamplesMs).toHaveLength(50);
        expect(op.rawSamplesMs.every((s: number) => Number.isFinite(s) && s >= 0)).toBe(true);
        // The summary must be supported by the samples it claims to describe.
        const sorted = [...op.rawSamplesMs].sort((a: number, b: number) => a - b);
        expect(op.summaryMs.min).toBeCloseTo(sorted[0], 9);
        expect(op.summaryMs.max).toBeCloseTo(sorted[sorted.length - 1], 9);
        expect(op.summaryMs.n).toBe(50);
      }
    }
  });

  test('the CSV carries one row per sample, each with its environment', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);

    const { name, body } = await download(page, '#btn-bench-csv');
    expect(name).toMatch(/^ml-dsa-benchmark-.*\.csv$/);

    const lines = body.trim().split('\n');
    // 3 parameter sets × 3 operations × 50 samples, plus the Ed25519 baseline
    // when the browser provides it, plus the header. Chromium does, so the
    // count is checked exactly rather than loosely.
    expect(lines).toHaveLength(1 + 4 * 3 * 50);
    expect(lines[0]).toContain('parameterSet');
    expect(lines[0]).toContain('sampleMs');
    expect(lines[0]).toContain('groupMedianMs');
    expect(lines[0]).toContain('browser');
    expect(lines[0]).toContain('libraryVersion');

    // Every data row repeats the environment, so sorting the file in a
    // spreadsheet cannot separate a timing from the machine it came from.
    for (const line of lines.slice(1)) {
      expect(line).toContain('performance.now()');
    }
    // Count on the parameterSet COLUMN, not a substring of the row: every row
    // also carries `selectedParameterSet`, so `includes('ML-DSA-65')` matches
    // all 600 rows regardless of which set the row is about.
    const fields = (line: string): string[] => {
      const out: string[] = [];
      let current = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) {
          out.push(current);
          current = '';
        } else current += ch;
      }
      out.push(current);
      return out;
    };
    const column = fields(lines[0]).indexOf('parameterSet');
    expect(column).toBeGreaterThan(-1);
    for (const set of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'Ed25519']) {
      expect(lines.slice(1).filter((l) => fields(l)[column] === set), set).toHaveLength(150);
    }
  });

  test('the two exports describe the same run', async ({ page }) => {
    await openBenchmark(page);
    await runBenchmark(page);
    const json = JSON.parse((await download(page, '#btn-bench-json')).body);
    const csv = (await download(page, '#btn-bench-csv')).body;
    expect(csv).toContain(json.environment.timestamp);
    expect(csv).toContain(json.environment.libraryVersion);
  });
});
