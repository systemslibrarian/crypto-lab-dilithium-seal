/**
 * Serialising a benchmark run for download.
 *
 * Two formats, because they answer different questions and neither alone is
 * enough:
 *
 *   JSON  the complete record — environment, methodology, summaries AND every
 *         raw sample in the order taken. This is the archival artifact: a run
 *         exported today can be recomputed from scratch years later, and the
 *         summary can be checked against the samples it claims to describe.
 *
 *   CSV   one row per raw measurement, with the environment repeated on every
 *         row. Repeating it is deliberate: a CSV that carried the metadata in a
 *         header block would lose it the moment anyone opened the file in a
 *         spreadsheet and sorted, and a timing separated from the machine it
 *         was taken on is not a measurement. The median and p95 for the row's
 *         group are carried too, so the file is readable without recomputing.
 *
 * Every export therefore carries its environment. There is no code path that
 * produces a result without one.
 */

import type { BenchmarkRun } from './runner';

/** Schema version, so a future reader can tell what it is holding. */
export const EXPORT_SCHEMA = 'dilithium-seal.benchmark.v1';

export interface ExportedBenchmark {
  schema: typeof EXPORT_SCHEMA;
  methodology: {
    warmupIterations: number;
    measuredIterations: number;
    timerSource: string;
    percentileMethod: string;
    note: string;
  };
  environment: BenchmarkRun['environment'];
  /** The classical comparison, measured here — or explicitly not measured. */
  baseline: {
    name: string;
    supported: boolean;
    unsupportedReason?: string;
    sizes: { publicKeyBytes: number; signatureBytes: number };
    operations: Array<{
      operation: string;
      summaryMs: BenchmarkRun['results'][number]['operations'][number]['summary'];
      rawSamplesMs: number[];
    }>;
  };
  results: Array<{
    parameterSet: string;
    sizes: { publicKeyBytes: number; privateKeyBytes: number; signatureBytes: number };
    operations: Array<{
      operation: string;
      summaryMs: BenchmarkRun['results'][number]['operations'][number]['summary'];
      rawSamplesMs: number[];
    }>;
  }>;
}

/**
 * The sentence that has to travel with the numbers.
 *
 * A browser benchmark measures this build of this library, in this browser, on
 * this machine, under whatever else that machine was doing. It is a comparative
 * measurement, not a property of ML-DSA.
 */
export const COMPARATIVE_ONLY_NOTE =
  'These are comparative measurements taken in one browser on one device at one moment. ' +
  'They are not a performance guarantee for ML-DSA, for this library, or for any other ' +
  'machine. JavaScript timings depend on the engine, the JIT state, CPU frequency scaling ' +
  'and background load; a native or hardware implementation will differ by a large factor. ' +
  'Compare the parameter sets against each other within one run, not across runs or devices.';

const PERCENTILE_METHOD =
  'Linear interpolation between closest ranks (R type-7 / NumPy default). Median is the same ' +
  'estimator at p = 0.5.';

export function toExport(run: BenchmarkRun): ExportedBenchmark {
  return {
    schema: EXPORT_SCHEMA,
    methodology: {
      warmupIterations: run.warmupIterations,
      measuredIterations: run.measuredIterations,
      timerSource: run.environment.timerSource,
      percentileMethod: PERCENTILE_METHOD,
      note: COMPARATIVE_ONLY_NOTE,
    },
    environment: run.environment,
    baseline: {
      name: run.baseline.name,
      supported: run.baseline.supported,
      ...(run.baseline.unsupportedReason
        ? { unsupportedReason: run.baseline.unsupportedReason }
        : {}),
      sizes: {
        publicKeyBytes: run.baseline.publicKeyBytes,
        signatureBytes: run.baseline.signatureBytes,
      },
      operations: run.baseline.operations.map((op) => ({
        operation: op.operation,
        summaryMs: op.summary,
        rawSamplesMs: op.samples,
      })),
    },
    results: run.results.map((r) => ({
      parameterSet: r.label,
      sizes: {
        publicKeyBytes: r.publicKeyBytes,
        privateKeyBytes: r.privateKeyBytes,
        signatureBytes: r.signatureBytes,
      },
      operations: r.operations.map((op) => ({
        operation: op.operation,
        summaryMs: op.summary,
        // The evidence, in the order taken.
        rawSamplesMs: op.samples,
      })),
    })),
  };
}

export function toJSON(run: BenchmarkRun): string {
  return `${JSON.stringify(toExport(run), null, 2)}\n`;
}

/** RFC 4180: quote when the value contains a comma, quote or newline. */
function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_COLUMNS = [
  'schema',
  'timestamp',
  'browser',
  'browserVersion',
  'operatingSystem',
  'logicalProcessors',
  'timerSource',
  'timerResolutionMs',
  'crossOriginIsolated',
  'library',
  'libraryVersion',
  'warmupIterations',
  'measuredIterations',
  'parameterSet',
  'publicKeyBytes',
  'privateKeyBytes',
  'signatureBytes',
  'operation',
  'iteration',
  'sampleMs',
  'groupMedianMs',
  'groupP95Ms',
] as const;

/**
 * One row per raw measurement, environment repeated on every row.
 *
 * 3 parameter sets × 3 operations × 50 samples = 450 rows at the default
 * settings, which any spreadsheet handles, and every one of them carries the
 * machine it was taken on.
 */
export function toCSV(run: BenchmarkRun): string {
  const env = run.environment;
  const rows: string[] = [CSV_COLUMNS.join(',')];

  const groups = [
    ...run.results,
    // The baseline rides in the same shape so a reader can filter on
    // `parameterSet` and get every measurement in the file.
    {
      label: run.baseline.name,
      publicKeyBytes: run.baseline.publicKeyBytes,
      privateKeyBytes: 0,
      signatureBytes: run.baseline.signatureBytes,
      operations: run.baseline.operations,
    },
  ].filter((g) => g.operations.length > 0);

  for (const result of groups) {
    for (const op of result.operations) {
      op.samples.forEach((sample, index) => {
        rows.push(
          [
            EXPORT_SCHEMA,
            env.timestamp,
            env.browser,
            env.browserVersion,
            env.operatingSystem,
            env.logicalProcessors,
            env.timerSource,
            env.timerResolutionMs,
            env.crossOriginIsolated,
            env.library,
            env.libraryVersion,
            run.warmupIterations,
            run.measuredIterations,
            result.label,
            result.publicKeyBytes,
            result.privateKeyBytes,
            result.signatureBytes,
            op.operation,
            index + 1,
            sample,
            op.summary.median,
            op.summary.p95,
          ]
            .map(csvCell)
            .join(',')
        );
      });
    }
  }
  return `${rows.join('\n')}\n`;
}

/** A filename that identifies the run without opening it. */
export function exportFilename(run: BenchmarkRun, extension: 'json' | 'csv'): string {
  const stamp = run.environment.timestamp.replace(/[:.]/g, '-');
  return `ml-dsa-benchmark-${stamp}.${extension}`;
}
