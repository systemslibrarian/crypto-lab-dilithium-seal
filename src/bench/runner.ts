/**
 * The benchmark runner.
 *
 * Replaces a panel that timed 50 signatures in one blocking loop, divided, and
 * printed an ops/sec figure with no warm-up, no distribution, no sizes, and no
 * record of the machine it ran on. That number could not be compared with
 * anything — including a second run in the same browser.
 *
 * What this does instead, per parameter set and per operation:
 *
 *   - WARM-UP. At least 10 discarded iterations. A cold JIT is measuring the
 *     compiler, not the algorithm; the first ML-DSA-87 signature can cost
 *     several times the hundredth.
 *   - MEASURE. At least 50 iterations, each timed individually around the
 *     single call, so the samples are a distribution rather than a total.
 *   - KEEP THE RAW SAMPLES. They are the evidence; the summary is derived from
 *     them and the export carries both.
 *   - YIELD. Control returns to the event loop between iterations so the page
 *     stays responsive. This does not pollute the measurement: each sample
 *     brackets one operation, and the yield happens outside the bracket.
 *
 * ── Why yielding rather than a worker ─────────────────────────────────────
 * A worker would also keep the UI responsive, at the cost of a `worker-src`
 * directive in a policy that is currently `default-src 'none'` with three
 * narrow exceptions, plus structured-cloning key material across a thread
 * boundary. The longest single operation here is one ML-DSA-87 signature; the
 * yield between iterations keeps any single block to roughly that. The e2e gate
 * measures actual main-thread responsiveness during a full run rather than
 * taking this reasoning on trust.
 */

import { generateKeyPair, sign, verify, ML_DSA_PARAMS, type MLDSAVariant } from '../crypto/mldsa';
import { collectEnvironment, type BenchmarkEnvironment } from './environment';
import { summarize, type Summary } from './stats';

export const WARMUP_ITERATIONS = 10;
export const MEASURED_ITERATIONS = 50;

export type BenchmarkOperation = 'keygen' | 'sign' | 'verify';
export const OPERATIONS: BenchmarkOperation[] = ['keygen', 'sign', 'verify'];

export interface OperationResult {
  operation: BenchmarkOperation;
  /** Every measured sample, in the order taken. Never reordered. */
  samples: number[];
  summary: Summary;
}

export interface ParameterSetResult {
  parameterSet: MLDSAVariant;
  label: string;
  publicKeyBytes: number;
  privateKeyBytes: number;
  signatureBytes: number;
  operations: OperationResult[];
}

/**
 * A classical signature scheme measured alongside, for scale.
 *
 * Ed25519 through the Web Crypto API, under exactly the same methodology, so
 * the comparison is measured on this device rather than quoted from somewhere
 * else. `supported: false` when the browser has no Ed25519 — in which case the
 * page states that instead of printing a ratio it did not measure.
 */
export interface BaselineResult {
  name: string;
  supported: boolean;
  unsupportedReason?: string;
  publicKeyBytes: number;
  signatureBytes: number;
  operations: OperationResult[];
}

export interface BenchmarkRun {
  environment: BenchmarkEnvironment;
  warmupIterations: number;
  measuredIterations: number;
  results: ParameterSetResult[];
  /** The classical comparison, measured here or explicitly marked unsupported. */
  baseline: BaselineResult;
}

export interface RunOptions {
  warmup?: number;
  measured?: number;
  /** Called after each (parameter set, operation) pair, for the progress line. */
  onProgress?: (done: number, total: number, label: string) => void;
  /** Injected by tests so they do not have to wait on real timers. */
  yieldToEventLoop?: () => Promise<void>;
}

/** Hand the event loop back so paint and input are not starved. */
const defaultYield = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const VARIANTS: MLDSAVariant[] = ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'];

const ED25519 = { name: 'Ed25519' } as const;

/**
 * Measure Ed25519 with the same warm-up and sample count.
 *
 * Kept because the comparison it supports is the point of the tab: ML-DSA's
 * cost is only meaningful next to the thing it replaces. It is MEASURED rather
 * than quoted, so a reader gets the ratio for their own device — and when the
 * browser has no Ed25519, the page says so rather than printing a number from
 * somewhere else.
 */
async function measureBaseline(
  warmup: number,
  measured: number,
  yieldFn: () => Promise<void>,
  onProgress: RunOptions['onProgress'],
  progressBase: number,
  total: number
): Promise<BaselineResult> {
  const message = new TextEncoder().encode(
    'Benchmark message for ML-DSA timing — fixed across every parameter set.'
  );
  const unsupported = (reason: string): BaselineResult => ({
    name: 'Ed25519',
    supported: false,
    unsupportedReason: reason,
    publicKeyBytes: 0,
    signatureBytes: 0,
    operations: [],
  });

  let keyPair: CryptoKeyPair;
  let rawPublicKey: ArrayBuffer;
  let fixtureSignature: ArrayBuffer;
  try {
    keyPair = (await crypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])) as CryptoKeyPair;
    rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    fixtureSignature = await crypto.subtle.sign(ED25519, keyPair.privateKey, message);
  } catch (err) {
    return unsupported(
      `This browser did not provide Ed25519 through the Web Crypto API (${
        err instanceof Error ? err.message : String(err)
      }).`
    );
  }

  const operations: OperationResult[] = [];
  let done = progressBase;
  for (const operation of OPERATIONS) {
    const once = async (): Promise<unknown> => {
      if (operation === 'keygen') return crypto.subtle.generateKey(ED25519, true, ['sign', 'verify']);
      if (operation === 'sign') return crypto.subtle.sign(ED25519, keyPair.privateKey, message);
      return crypto.subtle.verify(ED25519, keyPair.publicKey, fixtureSignature, message);
    };
    for (let i = 0; i < warmup; i++) await once();
    await yieldFn();
    const samples = await timeOperation(measured, once, yieldFn);
    operations.push({ operation, samples, summary: summarize(samples) });
    done++;
    onProgress?.(done, total, `Ed25519 ${operation}`);
  }

  return {
    name: 'Ed25519',
    supported: true,
    publicKeyBytes: rawPublicKey.byteLength,
    signatureBytes: fixtureSignature.byteLength,
    operations,
  };
}

/**
 * Time one operation `count` times, yielding between iterations.
 *
 * `prepare` runs OUTSIDE the timed region and returns the arguments for one
 * call, so setup a real caller would not repeat — generating a fresh keypair to
 * sign under — is never charged to the operation being measured.
 */
async function timeOperation(
  count: number,
  run: () => Promise<unknown>,
  yieldFn: () => Promise<void>
): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    // AWAITED inside the bracket. The crypto wrappers are `async` but their
    // bodies are synchronous today, so a fire-and-forget call would happen to
    // measure the right thing — until someone added a real `await` inside, at
    // which point the timings would silently become the cost of creating a
    // promise. The extra microtask turn costs far less than this clock can
    // resolve.
    await run();
    samples.push(performance.now() - start);
    await yieldFn();
  }
  return samples;
}

export async function runBenchmark(options: RunOptions = {}): Promise<BenchmarkRun> {
  const warmup = options.warmup ?? WARMUP_ITERATIONS;
  const measured = options.measured ?? MEASURED_ITERATIONS;
  const yieldFn = options.yieldToEventLoop ?? defaultYield;

  if (warmup < WARMUP_ITERATIONS) {
    throw new RangeError(`warm-up must be at least ${WARMUP_ITERATIONS} iterations, got ${warmup}`);
  }
  if (measured < MEASURED_ITERATIONS) {
    throw new RangeError(
      `at least ${MEASURED_ITERATIONS} measured iterations are required, got ${measured}`
    );
  }

  // Collected BEFORE the run, so the timestamp is when measurement started.
  const environment = collectEnvironment();
  const results: ParameterSetResult[] = [];
  // Three parameter sets plus the classical baseline, three operations each.
  const total = (VARIANTS.length + 1) * OPERATIONS.length;
  let done = 0;

  for (const variant of VARIANTS) {
    const label = variant.toUpperCase();
    const message = new TextEncoder().encode(
      'Benchmark message for ML-DSA timing — fixed across every parameter set.'
    );

    // Fixtures for the sign and verify measurements, built outside any timed
    // region. Verify needs a signature that actually verifies, or it would be
    // timing the early-exit path instead of the full check.
    const keyPair = await generateKeyPair(variant);
    const fixtureSignature = (await sign(keyPair.privateKey, message, variant)).signature;

    const operations: OperationResult[] = [];
    for (const operation of OPERATIONS) {
      const once = async (): Promise<unknown> => {
        if (operation === 'keygen') return generateKeyPair(variant);
        if (operation === 'sign') return sign(keyPair.privateKey, message, variant);
        return verify(keyPair.publicKey, message, fixtureSignature, variant);
      };

      // Warm-up: the same work, samples discarded. A cold JIT measures the
      // compiler rather than the algorithm.
      for (let i = 0; i < warmup; i++) await once();
      await yieldFn();

      const samples = await timeOperation(measured, once, yieldFn);
      operations.push({ operation, samples, summary: summarize(samples) });

      done++;
      options.onProgress?.(done, total, `${label} ${operation}`);
    }

    const sizes = ML_DSA_PARAMS[variant];
    results.push({
      parameterSet: variant,
      label,
      publicKeyBytes: sizes.publicKey,
      privateKeyBytes: sizes.privateKey,
      signatureBytes: sizes.signature,
      operations,
    });
  }

  const baseline = await measureBaseline(warmup, measured, yieldFn, options.onProgress, done, total);

  return { environment, warmupIterations: warmup, measuredIterations: measured, results, baseline };
}
