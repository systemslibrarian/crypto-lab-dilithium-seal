/**
 * Benchmark statistics, methodology and export structure.
 *
 * The statistics are checked against values computed by hand, not against the
 * implementation's own output — a test that asserts `median([...]) === median([...])`
 * is a tautology. The percentile cases below are the R type-7 answers, which
 * are also what NumPy's `percentile` and Excel's `PERCENTILE` return, so they
 * can be checked with any of those.
 *
 * The export tests care about one thing above all: that there is no way to
 * produce a result without the environment attached. A timing separated from
 * the machine it was taken on is not a measurement.
 */

import { describe, expect, it } from 'vitest';
import { mean, percentile, stdDev, summarize } from '../bench/stats';
import { __parsers, measureTimerResolution } from '../bench/environment';
import {
  CSV_COLUMNS,
  COMPARATIVE_ONLY_NOTE,
  EXPORT_SCHEMA,
  exportFilename,
  toCSV,
  toExport,
  toJSON,
} from '../bench/export';
import {
  MEASURED_ITERATIONS,
  OPERATIONS,
  WARMUP_ITERATIONS,
  runBenchmark,
  type BenchmarkRun,
} from '../bench/runner';

describe('percentile', () => {
  // R type-7 on 1..10: p50 = 5.5, p95 = 9.55, p0 = 1, p100 = 10.
  const oneToTen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('interpolates between closest ranks', () => {
    expect(percentile(oneToTen, 0)).toBe(1);
    expect(percentile(oneToTen, 1)).toBe(10);
    expect(percentile(oneToTen, 0.5)).toBeCloseTo(5.5, 10);
    expect(percentile(oneToTen, 0.95)).toBeCloseTo(9.55, 10);
    expect(percentile(oneToTen, 0.25)).toBeCloseTo(3.25, 10);
  });

  it('gives the middle value for an odd-length sample', () => {
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
    expect(percentile([5, 1, 9, 3, 7], 0.5)).toBe(5);
  });

  it('does not require sorted input and does not reorder the caller"s array', () => {
    const raw = [9, 1, 5, 3, 7];
    expect(percentile(raw, 0.5)).toBe(5);
    // The samples are evidence. Sorting them in place would silently destroy
    // the order they were taken in, which the export is required to preserve.
    expect(raw).toEqual([9, 1, 5, 3, 7]);
  });

  it('handles a single sample and rejects an empty one', () => {
    expect(percentile([42], 0.95)).toBe(42);
    expect(() => percentile([], 0.5)).toThrow(RangeError);
  });

  it('rejects a p outside [0, 1]', () => {
    expect(() => percentile(oneToTen, -0.1)).toThrow(RangeError);
    expect(() => percentile(oneToTen, 1.5)).toThrow(RangeError);
  });

  it('is monotonic in p', () => {
    let previous = -Infinity;
    for (let p = 0; p <= 1.00001; p += 0.05) {
      const value = percentile(oneToTen, Math.min(p, 1));
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('mean and standard deviation', () => {
  it('computes the mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(() => mean([])).toThrow(RangeError);
  });

  it('computes the Bessel-corrected sample standard deviation', () => {
    // [2,4,4,4,5,5,7,9]: mean 5, population sd 2, sample sd = sqrt(32/7).
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(stdDev([5])).toBe(0);
    expect(stdDev([3, 3, 3, 3])).toBe(0);
  });
});

describe('summarize', () => {
  it('reports the distribution, not just a mean', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const s = summarize(samples);
    expect(s.n).toBe(10);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.median).toBeCloseTo(5.5, 10);
    expect(s.mean).toBeCloseTo(14.5, 10);
    // The point of reporting both: one outlier moves the mean by 9ms and the
    // median by nothing. ML-DSA signing is a rejection loop, so this is the
    // normal shape of the data rather than a contrived case.
    expect(s.mean).toBeGreaterThan(s.median * 2);
  });

  it('derives ops/sec from the median, not the mean', () => {
    const s = summarize([10, 10, 10, 10, 1000]);
    expect(s.median).toBe(10);
    expect(s.medianOpsPerSecond).toBeCloseTo(100, 10);
  });

  it('refuses to summarize nothing', () => {
    expect(() => summarize([])).toThrow(RangeError);
  });
});

describe('environment detection', () => {
  const { parseBrowser, parseOperatingSystem } = __parsers;

  it('identifies browsers that all claim to be Chrome and Safari', () => {
    // Every Chromium browser says "Chrome", and Chrome says "Safari", so the
    // order of the patterns is the whole test.
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
    const edge = `${chrome} Edg/141.0.3537.57`;
    const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0';
    const safari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

    expect(parseBrowser(chrome)).toEqual({ browser: 'Chrome', browserVersion: '141.0.0.0' });
    expect(parseBrowser(edge).browser).toBe('Edge');
    expect(parseBrowser(firefox)).toEqual({ browser: 'Firefox', browserVersion: '132.0' });
    expect(parseBrowser(safari)).toEqual({ browser: 'Safari', browserVersion: '18.1' });
  });

  it('says "unknown" rather than guessing', () => {
    expect(parseBrowser('something else entirely')).toEqual({
      browser: 'unknown',
      browserVersion: 'unknown',
    });
    expect(parseOperatingSystem('no os here')).toBe('unknown');
  });

  it('identifies the operating system', () => {
    expect(parseOperatingSystem('... Windows NT 10.0; Win64 ...')).toBe('Windows 10.0');
    expect(parseOperatingSystem('... Intel Mac OS X 10_15_7 ...')).toBe('macOS 10.15.7');
    expect(parseOperatingSystem('... Android 14; Pixel ...')).toBe('Android 14');
    expect(parseOperatingSystem('... (X11; Linux x86_64) ...')).toBe('Linux');
  });

  it('measures timer resolution instead of assuming it', () => {
    // A stub clock that advances in 5 ms steps must be reported as 5 ms, not
    // as whatever the real environment happens to offer.
    let t = 0;
    const coarse = (): number => {
      t += 5;
      return t;
    };
    expect(measureTimerResolution(coarse)).toBe(5);
  });

  it('returns 0 rather than hanging on a clock that never advances', () => {
    expect(measureTimerResolution(() => 0)).toBe(0);
  });
});

/** A small synthetic run, so the export tests do not depend on real timings. */
function fakeRun(): BenchmarkRun {
  const samples = Array.from({ length: 50 }, (_, i) => i + 1);
  return {
    environment: {
      browser: 'Chrome',
      browserVersion: '141.0.0.0',
      operatingSystem: 'macOS 15.0.0',
      logicalProcessors: 10,
      timerSource: 'performance.now() — DOMHighResTimeStamp, monotonic',
      timerResolutionMs: 0.005,
      crossOriginIsolated: false,
      library: '@noble/post-quantum',
      libraryVersion: '0.7.1',
      timestamp: '2026-09-20T12:00:00.000Z',
      userAgent: 'Mozilla/5.0 ... Chrome/141.0.0.0 ...',
    },
    warmupIterations: 10,
    measuredIterations: 50,
    results: [
      {
        parameterSet: 'ml-dsa-65',
        label: 'ML-DSA-65',
        publicKeyBytes: 1952,
        privateKeyBytes: 4032,
        signatureBytes: 3309,
        operations: [{ operation: 'sign', samples, summary: summarize(samples) }],
      },
    ],
    baseline: {
      name: 'Ed25519',
      supported: true,
      publicKeyBytes: 32,
      signatureBytes: 64,
      operations: [{ operation: 'sign', samples, summary: summarize(samples) }],
    },
  };
}

describe('JSON export', () => {
  const run = fakeRun();
  const exported = toExport(run);

  it('carries the environment, and could not be read without it', () => {
    expect(exported.environment.browser).toBe('Chrome');
    expect(exported.environment.libraryVersion).toBe('0.7.1');
    expect(exported.environment.timestamp).toBe('2026-09-20T12:00:00.000Z');
    expect(exported.environment.logicalProcessors).toBe(10);
    expect(exported.environment.timerSource).toContain('performance.now()');
  });

  it('records the methodology, including how percentiles were computed', () => {
    expect(exported.methodology.warmupIterations).toBe(10);
    expect(exported.methodology.measuredIterations).toBe(50);
    // "p95" is at least nine different numbers depending on the estimator, so
    // a percentile reported without its method is not reproducible.
    expect(exported.methodology.percentileMethod).toMatch(/type-7/);
    expect(exported.methodology.note).toBe(COMPARATIVE_ONLY_NOTE);
  });

  it('preserves every raw sample, in the order taken', () => {
    const op = exported.results[0].operations[0];
    expect(op.rawSamplesMs).toHaveLength(50);
    expect(op.rawSamplesMs).toEqual(run.results[0].operations[0].samples);
    // Not sorted: order is part of the record.
    expect(op.rawSamplesMs[0]).toBe(1);
    expect(op.rawSamplesMs[49]).toBe(50);
  });

  it('carries a summary that the raw samples actually support', () => {
    const op = exported.results[0].operations[0];
    expect(summarize(op.rawSamplesMs)).toEqual(op.summaryMs);
  });

  it('carries the sizes of the parameter set measured', () => {
    expect(exported.results[0].sizes).toEqual({
      publicKeyBytes: 1952,
      privateKeyBytes: 4032,
      signatureBytes: 3309,
    });
  });

  it('carries the classical baseline, measured or explicitly not', () => {
    expect(exported.baseline.name).toBe('Ed25519');
    expect(exported.baseline.supported).toBe(true);
    expect(exported.baseline.sizes).toEqual({ publicKeyBytes: 32, signatureBytes: 64 });
    expect(exported.baseline.operations[0].rawSamplesMs).toHaveLength(50);
  });

  it('round-trips through JSON.parse', () => {
    const parsed = JSON.parse(toJSON(run)) as typeof exported;
    expect(parsed.schema).toBe(EXPORT_SCHEMA);
    expect(parsed).toEqual(exported);
  });
});

/** Split one RFC 4180 record into fields, honouring quotes. */
function fields(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

describe('CSV export', () => {
  const run = fakeRun();
  const csv = toCSV(run);
  const lines = csv.trim().split('\n');

  it('starts with the declared header', () => {
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('writes one row per raw measurement, baseline included', () => {
    // One ML-DSA group and the Ed25519 baseline, 50 samples each.
    expect(lines).toHaveLength(1 + 100);
  });

  it('repeats the environment on every row', () => {
    // Deliberate denormalisation: a metadata header block is lost the moment
    // someone sorts the file in a spreadsheet.
    for (const line of lines.slice(1)) {
      expect(line).toContain('Chrome');
      expect(line).toContain('0.7.1');
      expect(line).toContain('2026-09-20T12:00:00.000Z');
    }
  });

  it('gives every row the same number of fields as the header', () => {
    for (const line of lines) expect(fields(line)).toHaveLength(CSV_COLUMNS.length);
  });

  it('quotes fields containing a comma, per RFC 4180', () => {
    // The timer-source string contains an em dash and a comma.
    expect(csv).toContain('"performance.now() — DOMHighResTimeStamp, monotonic"');
  });

  it('carries the iteration index and the group statistics', () => {
    // Split with the quote-aware parser, not `String.split(',')` — the
    // timer-source field legitimately contains a comma, which is why it is
    // quoted, and a naive split silently shifts every column after it.
    const first = fields(lines[1]);
    const at = (name: (typeof CSV_COLUMNS)[number]): number => CSV_COLUMNS.indexOf(name);
    expect(first[at('iteration')]).toBe('1');
    expect(first[at('sampleMs')]).toBe('1');
    expect(fields(lines[50])[at('iteration')]).toBe('50');
    // The group statistics are the ones the summary reports for this group.
    const summary = summarize(run.results[0].operations[0].samples);
    expect(first[at('groupMedianMs')]).toBe(String(summary.median));
    expect(first[at('groupP95Ms')]).toBe(String(summary.p95));
    expect(first[at('parameterSet')]).toBe('ML-DSA-65');
    expect(first[at('signatureBytes')]).toBe('3309');
    // The baseline rides in the same shape, so filtering on `parameterSet`
    // reaches every measurement in the file.
    expect(fields(lines[51])[at('parameterSet')]).toBe('Ed25519');
  });
});

describe('export filenames', () => {
  it('identify the run without opening it, and are filesystem-safe', () => {
    const run = fakeRun();
    for (const ext of ['json', 'csv'] as const) {
      const name = exportFilename(run, ext);
      expect(name).toBe(`ml-dsa-benchmark-2026-09-20T12-00-00-000Z.${ext}`);
      expect(name).not.toMatch(/[:*?"<>|]/);
    }
  });
});

describe('the runner enforces its own methodology', () => {
  it('refuses fewer than the required warm-up iterations', async () => {
    await expect(runBenchmark({ warmup: 0 })).rejects.toThrow(/warm-up must be at least 10/);
    await expect(runBenchmark({ warmup: WARMUP_ITERATIONS - 1 })).rejects.toThrow(RangeError);
  });

  it('refuses fewer than the required measured iterations', async () => {
    await expect(runBenchmark({ measured: 10 })).rejects.toThrow(/at least 50 measured/);
    await expect(runBenchmark({ measured: MEASURED_ITERATIONS - 1 })).rejects.toThrow(RangeError);
  });

  it('measures all three operations for all three parameter sets', async () => {
    // A real run at the minimum settings. Slow, but this is the assertion that
    // the panel measures what it says it measures.
    const run = await runBenchmark({ yieldToEventLoop: async () => {} });
    expect(run.results).toHaveLength(3);
    expect(run.results.map((r) => r.label)).toEqual(['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']);
    for (const result of run.results) {
      expect(result.operations.map((o) => o.operation)).toEqual(OPERATIONS);
      for (const op of result.operations) {
        expect(op.samples).toHaveLength(MEASURED_ITERATIONS);
        // Every sample is a real elapsed time.
        expect(op.samples.every((s) => s >= 0 && Number.isFinite(s))).toBe(true);
        expect(op.summary).toEqual(summarize(op.samples));
      }
    }
  }, 300_000);

  it('reports the sizes of the set it measured, matching FIPS 204', async () => {
    const run = await runBenchmark({ yieldToEventLoop: async () => {} });
    const sizes = Object.fromEntries(
      run.results.map((r) => [r.label, [r.publicKeyBytes, r.privateKeyBytes, r.signatureBytes]])
    );
    expect(sizes['ML-DSA-44']).toEqual([1312, 2560, 2420]);
    expect(sizes['ML-DSA-65']).toEqual([1952, 4032, 3309]);
    expect(sizes['ML-DSA-87']).toEqual([2592, 4896, 4627]);
  }, 300_000);
});
