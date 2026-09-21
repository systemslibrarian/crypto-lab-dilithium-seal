/**
 * The benchmark panel.
 *
 * What it replaces: a button that ran 50 signatures per parameter set in one
 * blocking loop, divided the total by the elapsed time, and printed an ops/sec
 * figure. No warm-up, so the first measurements included JIT compilation. No
 * distribution, so a rejection-heavy outlier moved the answer invisibly. No key
 * or signature sizes. No verification or key-generation timing at all. And no
 * record of the browser, the machine or the clock — which made the number
 * incomparable with anything, including a second run on the same laptop.
 *
 * What replaces it measures key generation, signing and verification for every
 * parameter set with a warm-up and fifty individually-timed samples, reports
 * the median and p95 rather than a mean alone, shows the sizes beside the
 * timings, and cannot render a result without the environment block.
 */

import {
  MEASURED_ITERATIONS,
  WARMUP_ITERATIONS,
  runBenchmark,
  type BenchmarkRun,
} from '../bench/runner';
import { COMPARATIVE_ONLY_NOTE, exportFilename, toCSV, toJSON } from '../bench/export';
import { escapeHTML } from './helpers';
import { fidelityBadge } from './fidelity';
import { InsecureRandomnessError } from '../crypto/random';

/** The most recent run, so the export buttons have something to write. */
let lastRun: BenchmarkRun | null = null;

const ms = (value: number): string => value.toFixed(3);

/**
 * A duration the clock could not actually resolve is not a duration.
 *
 * `performance.now()` is deliberately coarsened in a page that is not
 * cross-origin isolated — 0.1 ms in current Chromium. Ed25519 signs in roughly
 * 50 µs, so its samples quantise to 0.0 or 0.1 and the MEDIAN lands on exactly
 * zero. Printing "0.000 ms", and a speed ratio computed by dividing by it,
 * would be inventing a number the measurement never contained.
 */
function belowResolution(value: number, resolutionMs: number): boolean {
  return resolutionMs > 0 && value < resolutionMs;
}

function duration(value: number, resolutionMs: number): string {
  return belowResolution(value, resolutionMs)
    ? `&lt; ${ms(resolutionMs)}`
    : ms(value);
}

export function renderBenchmarkPanel(): string {
  return `
    <div class="card" id="benchmark-panel">
      <h2>Benchmark</h2>
      ${fidelityBadge('values', 'benchmark')}
      <p class="text-sm text-muted mb-1">
        Key generation, signing and verification for all three parameter sets, measured in this
        browser: <strong>${WARMUP_ITERATIONS} warm-up iterations</strong> discarded, then
        <strong>${MEASURED_ITERATIONS} timed samples</strong> per operation, each timed
        individually. Median and p95 are reported because ML-DSA signing is a rejection loop — the
        distribution has a long right tail and a mean alone hides it.
      </p>
      <p class="text-sm text-muted mb-1">
        Ed25519 is measured alongside under the same methodology, so any speed comparison on this
        page is a <strong>measured Ed25519-to-ML-DSA comparison</strong> from your own device —
        never a figure quoted from other hardware.
      </p>
      <div class="flex-row">
        <button class="btn" id="btn-benchmark" type="button">Run benchmark</button>
        <button class="btn btn-secondary" id="btn-bench-json" type="button" disabled>Download JSON</button>
        <button class="btn btn-secondary" id="btn-bench-csv" type="button" disabled>Download CSV</button>
      </div>
      <div id="bench-progress" role="status" aria-live="polite" aria-atomic="true"></div>
      <div id="bench-output"></div>
      <p class="text-sm text-muted mt-2" id="bench-caveat"><em>${escapeHTML(COMPARATIVE_ONLY_NOTE)}</em></p>
    </div>
  `;
}

function environmentBlock(run: BenchmarkRun): string {
  const e = run.environment;
  const rows: Array<[string, string]> = [
    ['Browser', `${e.browser} ${e.browserVersion}`],
    ['Operating system', e.operatingSystem],
    ['Logical processors', e.logicalProcessors > 0 ? String(e.logicalProcessors) : 'not reported'],
    ['Timer source', e.timerSource],
    ['Timer resolution', `${e.timerResolutionMs.toFixed(4)} ms`],
    ['Cross-origin isolated', e.crossOriginIsolated ? 'yes' : 'no'],
    ['Library', `${e.library} ${e.libraryVersion}`],
    ['Warm-up iterations', String(run.warmupIterations)],
    ['Measured iterations', String(run.measuredIterations)],
    ['Timestamp (UTC)', e.timestamp],
  ];
  return `
    <h3 class="mt-2">Environment</h3>
    <table class="comparison-table table-prose" id="bench-environment" tabindex="0">
      <caption class="sr-only">The browser, machine, clock and library version these measurements were taken with.</caption>
      <thead><tr><th scope="col">Property</th><th scope="col">Value</th></tr></thead>
      <tbody>
        ${rows
          .map(
            ([label, value]) =>
              `<tr><th scope="row">${escapeHTML(label)}</th><td>${escapeHTML(value)}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function resultsTable(run: BenchmarkRun): string {
  const resolution = run.environment.timerResolutionMs;
  const rows = run.results
    .flatMap((result) =>
      result.operations.map((op) => {
        const s = op.summary;
        return `
        <tr>
          <th scope="row">${escapeHTML(result.label)}</th>
          <td>${escapeHTML(op.operation)}</td>
          <td class="bench-number">${duration(s.median, resolution)}</td>
          <td class="bench-number">${duration(s.p95, resolution)}</td>
          <td class="bench-number">${duration(s.mean, resolution)}</td>
          <td class="bench-number">${duration(s.min, resolution)}</td>
          <td class="bench-number">${duration(s.max, resolution)}</td>
          <td class="bench-number">${s.n}</td>
        </tr>`;
      })
    )
    .join('');

  return `
    <h3 class="mt-2">Timings (milliseconds)</h3>
    <table class="comparison-table table-prose" id="bench-results" tabindex="0">
      <caption class="sr-only">
        Measured key generation, signing and verification times for each ML-DSA parameter set,
        reported as median, 95th percentile, mean, minimum and maximum over the measured samples.
      </caption>
      <thead>
        <tr>
          <th scope="col">Parameter set</th>
          <th scope="col">Operation</th>
          <th scope="col">Median</th>
          <th scope="col">p95</th>
          <th scope="col">Mean</th>
          <th scope="col">Min</th>
          <th scope="col">Max</th>
          <th scope="col">Samples</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * ML-DSA against a classical scheme, measured on this device.
 *
 * The ratio is computed from MEDIANS taken in the same run on the same machine,
 * so it is the one comparison on this page that is genuinely apples-to-apples.
 * When the browser has no Ed25519 the panel says so — it never prints a ratio
 * it did not measure, which is the property `e2e/claims.spec.ts` has guarded
 * since before this rewrite.
 */
function baselineSection(run: BenchmarkRun): string {
  const base = run.baseline;
  if (!base.supported) {
    return `
      <h3 class="mt-2">Against a classical signature</h3>
      <p class="text-sm text-muted" id="bench-baseline-unavailable">
        No comparison is shown: ${escapeHTML(base.unsupportedReason ?? 'Ed25519 was not available.')}
        A ratio is only printed when both sides were measured in this run.
      </p>`;
  }

  const medianOf = (ops: BenchmarkRun['results'][number]['operations'], op: string): number =>
    ops.find((o) => o.operation === op)?.summary.median ?? NaN;

  const resolution = run.environment.timerResolutionMs;
  let anyLowerBound = false;

  const rows = run.results
    .map((result) => {
      const cells = ['keygen', 'sign', 'verify'].map((op) => {
        const mine = medianOf(result.operations, op);
        const theirs = medianOf(base.operations, op);
        if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return '<td>—</td>';
        // When the baseline is faster than the clock can resolve, the exact
        // ratio is unknowable. Report a LOWER BOUND using the resolution as the
        // denominator, and say that is what it is.
        if (belowResolution(theirs, resolution) || theirs <= 0) {
          anyLowerBound = true;
          const bound = mine / Math.max(resolution, Number.MIN_VALUE);
          return `<td class="bench-number">&gt; ${bound.toFixed(0)}×</td>`;
        }
        return `<td class="bench-number">${(mine / theirs).toFixed(1)}×</td>`;
      });
      return `<tr><th scope="row">${escapeHTML(result.label)}</th>${cells.join('')}
        <td class="bench-number">${(result.publicKeyBytes / base.publicKeyBytes).toFixed(0)}×</td>
        <td class="bench-number">${(result.signatureBytes / base.signatureBytes).toFixed(0)}×</td></tr>`;
    })
    .join('');

  return `
    <h3 class="mt-2">Against a classical signature, measured in the same run</h3>
    <p class="text-sm text-muted">
      Ed25519 through the Web Crypto API, under the same warm-up and sample count. Each cell is the
      ML-DSA median divided by the Ed25519 median for the same operation — a value above 1 means
      ML-DSA was slower here. Measured on this device, in this browser, just now.
    </p>
    <table class="comparison-table table-prose" id="bench-baseline" tabindex="0">
      <caption class="sr-only">How each ML-DSA parameter set compares with Ed25519 for key generation, signing, verification, public key size and signature size, measured in the same run.</caption>
      <thead>
        <tr>
          <th scope="col">Parameter set</th>
          <th scope="col">KeyGen</th>
          <th scope="col">Sign</th>
          <th scope="col">Verify</th>
          <th scope="col">Public key</th>
          <th scope="col">Signature</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="text-sm text-muted" id="bench-baseline-summary">
      Ed25519 baseline: ${base.publicKeyBytes} B public key, ${base.signatureBytes} B signature;
      median sign ${duration(medianOf(base.operations, 'sign'), resolution)} ms.
      ${
        anyLowerBound
          ? `<strong>Ed25519 was faster than this browser's clock can resolve</strong>
             (${ms(resolution)} ms granularity), so the timing ratios above are lower bounds
             rather than measurements. The size ratios are exact. A cross-origin-isolated page
             would get a finer clock; this one deliberately is not.`
          : ''
      }
    </p>`;
}

function sizesTable(run: BenchmarkRun): string {
  const rows = run.results
    .map(
      (r) => `
      <tr>
        <th scope="row">${escapeHTML(r.label)}</th>
        <td class="bench-number">${r.publicKeyBytes.toLocaleString('en-GB')}</td>
        <td class="bench-number">${r.privateKeyBytes.toLocaleString('en-GB')}</td>
        <td class="bench-number">${r.signatureBytes.toLocaleString('en-GB')}</td>
      </tr>`
    )
    .join('');
  return `
    <h3 class="mt-2">Sizes (bytes)</h3>
    <p class="text-sm text-muted">
      Taken from the parameter set actually measured, so they cannot describe a different profile
      from the timings beside them.
    </p>
    <table class="comparison-table table-prose" id="bench-sizes" tabindex="0">
      <caption class="sr-only">Public key, private key and signature sizes for each measured ML-DSA parameter set.</caption>
      <thead>
        <tr>
          <th scope="col">Parameter set</th>
          <th scope="col">Public key</th>
          <th scope="col">Private key</th>
          <th scope="col">Signature</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function bindBenchmarkPanel(): void {
  const runButton = document.getElementById('btn-benchmark') as HTMLButtonElement | null;
  const jsonButton = document.getElementById('btn-bench-json') as HTMLButtonElement | null;
  const csvButton = document.getElementById('btn-bench-csv') as HTMLButtonElement | null;
  const progress = document.getElementById('bench-progress');
  const output = document.getElementById('bench-output');
  if (!runButton || !jsonButton || !csvButton || !progress || !output) return;

  // A panel re-rendered by a tab switch must not show the previous run's
  // numbers beside a fresh environment block.
  lastRun = null;

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    jsonButton.disabled = true;
    csvButton.disabled = true;
    output.innerHTML = '';
    progress.innerHTML = `<p class="text-sm text-muted mt-1"><span class="spinner"></span> Warming up…</p>`;

    try {
      const run = await runBenchmark({
        onProgress: (done, total, label) => {
          progress.innerHTML =
            `<p class="text-sm text-muted mt-1"><span class="spinner"></span> ` +
            `Measured ${escapeHTML(label)} — ${done} of ${total}…</p>`;
        },
      });
      lastRun = run;
      const groups =
        run.results.length * run.results[0].operations.length + run.baseline.operations.length;
      progress.innerHTML = `<p class="text-sm text-muted mt-1">Done: ${groups} measurements of ${run.measuredIterations} samples each.</p>`;
      output.innerHTML =
        resultsTable(run) + sizesTable(run) + baselineSection(run) + environmentBlock(run);
      jsonButton.disabled = false;
      csvButton.disabled = false;
    } catch (err) {
      // Signing and key generation need the RBG; say so rather than leaving a
      // spinner turning, exactly as the Sign & Verify tab does.
      const detail =
        err instanceof InsecureRandomnessError
          ? err.message
          : `The benchmark did not complete: ${err instanceof Error ? err.message : String(err)}`;
      progress.innerHTML = '';
      output.innerHTML = `
        <div class="mt-1"><span class="badge badge-fail">✗ BENCHMARK STOPPED</span></div>
        <p class="text-sm text-red mt-1">${escapeHTML(detail)}</p>`;
    } finally {
      runButton.disabled = false;
    }
  });

  jsonButton.addEventListener('click', () => {
    if (!lastRun) return;
    download(exportFilename(lastRun, 'json'), toJSON(lastRun), 'application/json');
  });
  csvButton.addEventListener('click', () => {
    if (!lastRun) return;
    download(exportFilename(lastRun, 'csv'), toCSV(lastRun), 'text/csv');
  });
}
