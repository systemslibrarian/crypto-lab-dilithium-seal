/**
 * "Not constant-time", measured rather than asserted.
 *
 * The limitations panel says the implementation does not claim constant-time
 * execution, and quotes the library saying so. That is honest and it is also
 * abstract: a reader has no idea whether it means a 2% wobble or something they
 * could see from across the room.
 *
 * This panel signs the SAME message with the SAME key several hundred times and
 * plots how long each one took. The spread is large and it is not noise — and
 * the way this panel shows it is not noise is by measuring a CONTROL in the same
 * conditions: verification, which has no rejection loop, run the same number of
 * times against the same data on the same thread in the same seconds. If both
 * were dominated by JIT warm-up, garbage collection and scheduler jitter, both
 * would be equally ragged. They are not.
 *
 * ── What this demonstrates, exactly ───────────────────────────────────────
 * That ML-DSA signing has an observable, input-dependent execution time, which
 * is what "not constant-time" means. FIPS 204's signing algorithm repeats until
 * its candidate response passes a norm check, and Table 1 gives the expected
 * number of repetitions as 4.25–5.14 depending on the parameter set; a run that
 * needs eight attempts genuinely does about twice the work of one that needs
 * four.
 *
 * ── What it does NOT demonstrate ──────────────────────────────────────────
 * It is not a key-recovery attack and does not show one is possible here. It
 * does not measure the loop's trip count — the library does not report it, and
 * this panel does not pretend to infer it. A timing channel existing is a
 * necessary condition for a timing attack, not a sufficient one. The panel says
 * all of this on screen, next to the chart, because a histogram with a scary
 * shape and no caveat is exactly the kind of thing that gets screenshotted.
 */

import { generateKeyPair, sign, verify } from '../crypto/mldsa';
import { percentile, summarize, type Summary } from '../bench/stats';
import { measureTimerResolution } from '../bench/environment';
import { getSelectedVariant, variantLabel } from './selected-variant';
import { InsecureRandomnessError } from '../crypto/random';
import { escapeHTML } from './helpers';
import { fidelityBadge } from './fidelity';

/** Enough samples for the shape to be a shape rather than an anecdote. */
const SAMPLES = 300;
const WARMUP = 30;

interface Measured {
  sign: number[];
  verify: number[];
  timerResolutionMs: number;
}

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

async function measure(onProgress: (done: number, total: number) => void): Promise<Measured> {
  const variant = getSelectedVariant();
  const message = new TextEncoder().encode(
    'The same message, signed many times, with the same key.'
  );
  const keyPair = await generateKeyPair(variant);
  const fixture = (await sign(keyPair.privateKey, message, variant)).signature;

  // Warm the JIT on both paths first, so neither distribution carries
  // compilation cost that the other does not.
  for (let i = 0; i < WARMUP; i++) {
    await sign(keyPair.privateKey, message, variant);
    await verify(keyPair.publicKey, message, fixture, variant);
  }
  await yieldToEventLoop();

  const signTimes: number[] = [];
  const verifyTimes: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    // Interleaved, not one batch then the other: a thermal or scheduler drift
    // partway through would otherwise land entirely on one of the two and look
    // like a property of the algorithm.
    const s0 = performance.now();
    await sign(keyPair.privateKey, message, variant);
    signTimes.push(performance.now() - s0);

    const v0 = performance.now();
    await verify(keyPair.publicKey, message, fixture, variant);
    verifyTimes.push(performance.now() - v0);

    if (i % 10 === 0) {
      onProgress(i, SAMPLES);
      await yieldToEventLoop();
    }
  }
  return { sign: signTimes, verify: verifyTimes, timerResolutionMs: measureTimerResolution() };
}

/**
 * A histogram as a row of labelled bars.
 *
 * Heights go through the CSSOM, like every other measured value on this page —
 * an inline `style` attribute would need `style-src 'unsafe-inline'`.
 */
function histogram(samples: number[], bins: number, id: string): string {
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0) as number[];
  for (const value of samples) {
    counts[Math.min(bins - 1, Math.floor((value - min) / width))]++;
  }
  const peak = Math.max(...counts);

  const bars = counts
    .map((count, i) => {
      const lo = (min + i * width).toFixed(2);
      const hi = (min + (i + 1) * width).toFixed(2);
      const height = peak > 0 ? Math.round((count / peak) * 100) : 0;
      return `
        <div class="tv-col" role="img" aria-label="${count} signature${count === 1 ? '' : 's'} took between ${lo} and ${hi} milliseconds">
          <div class="tv-bar-track"><span class="tv-bar" data-coeff-height="${height}"></span></div>
        </div>`;
    })
    .join('');

  return `
    <div class="tv-histogram" id="${escapeHTML(id)}">${bars}</div>
    <div class="tv-axis">
      <span>${min.toFixed(2)} ms</span>
      <span>${max.toFixed(2)} ms</span>
    </div>`;
}

/** The spread a reader can actually compare: how much slower the slow ones are. */
function spread(summary: Summary, samples: number[]): number {
  const low = percentile(samples, 0.05);
  return low > 0 ? summary.p95 / low : Infinity;
}

function statsRow(label: string, samples: number[]): string {
  const s = summarize(samples);
  const ratio = spread(s, samples);
  return `
    <tr>
      <th scope="row">${escapeHTML(label)}</th>
      <td class="bench-number">${s.median.toFixed(3)}</td>
      <td class="bench-number">${s.p95.toFixed(3)}</td>
      <td class="bench-number">${s.max.toFixed(3)}</td>
      <td class="bench-number">${Number.isFinite(ratio) ? `${ratio.toFixed(1)}×` : '—'}</td>
    </tr>`;
}

export function renderTimingVariability(host: HTMLElement): void {
  host.innerHTML = `
    <div class="tv-viz">
      ${fidelityBadge('values', 'timing-variability')}
      <p class="text-sm text-muted">
        The toy loop above shows the <em>mechanism</em>. This measures its consequence in the real
        signer. It signs one message with one key <strong>${SAMPLES} times</strong> and plots how
        long each signature took — then does the same for verification, which has no rejection
        loop, as a control. Both run on the same thread in the same seconds against the same data,
        so anything that affects one affects the other.
      </p>
      <div class="flex-row">
        <button class="btn" id="tv-run" type="button">Measure signing time ${SAMPLES} times</button>
        <span class="text-sm" id="tv-status" aria-live="polite"></span>
      </div>
      <div id="tv-output"></div>
    </div>`;

  const button = host.querySelector<HTMLButtonElement>('#tv-run')!;
  const status = host.querySelector<HTMLElement>('#tv-status')!;
  const output = host.querySelector<HTMLElement>('#tv-output')!;

  button.addEventListener('click', async () => {
    button.disabled = true;
    output.innerHTML = '';
    status.innerHTML = '<span class="spinner"></span> Measuring…';

    let data: Measured;
    try {
      data = await measure((done, total) => {
        status.innerHTML = `<span class="spinner"></span> ${done} of ${total}…`;
      });
    } catch (err) {
      status.textContent = '';
      output.innerHTML =
        err instanceof InsecureRandomnessError
          ? `<div class="mt-1"><span class="badge badge-fail">✗ STOPPED — NO SECURE RANDOMNESS</span></div>
             <p class="text-sm text-red mt-1">${escapeHTML(err.message)}</p>`
          : `<p class="text-sm text-red mt-1">${escapeHTML(
              err instanceof Error ? err.message : String(err)
            )}</p>`;
      button.disabled = false;
      return;
    }

    const signSummary = summarize(data.sign);
    const verifySummary = summarize(data.verify);
    const signSpread = spread(signSummary, data.sign);
    const verifySpread = spread(verifySummary, data.verify);
    const coarse = data.timerResolutionMs >= signSummary.median / 10;

    status.textContent = '';
    output.innerHTML = `
      <h4 class="tv-heading">Signing — has a rejection loop</h4>
      ${histogram(data.sign, 24, 'tv-hist-sign')}

      <h4 class="tv-heading">Verification — has no rejection loop (control)</h4>
      ${histogram(data.verify, 24, 'tv-hist-verify')}

      <table class="comparison-table table-prose" id="tv-stats" tabindex="0">
        <caption class="sr-only">
          Median, 95th percentile, maximum and spread for ${SAMPLES} signatures and
          ${SAMPLES} verifications of the same message under the same key.
        </caption>
        <thead>
          <tr>
            <th scope="col">Operation</th>
            <th scope="col">Median (ms)</th>
            <th scope="col">p95 (ms)</th>
            <th scope="col">Max (ms)</th>
            <th scope="col">p95 ÷ p5</th>
          </tr>
        </thead>
        <tbody>
          ${statsRow('Signing', data.sign)}
          ${statsRow('Verification (control)', data.verify)}
        </tbody>
      </table>

      <p class="text-sm mt-1" id="tv-conclusion">
        <strong>Signing spread ${signSpread.toFixed(1)}× against verification's
        ${verifySpread.toFixed(1)}×.</strong>
        Same key, same message, same thread, same seconds — and signing varies
        ${signSpread > verifySpread ? 'substantially more' : 'no more'} than the operation with no
        data-dependent loop. FIPS 204 signing repeats until its candidate response passes a norm
        check; Table 1 puts the expected number of repetitions at 4.25–5.14, so a signature that
        needs eight attempts really does about twice the work of one that needs four.
        <strong>That is what "not constant-time" means:</strong> the execution time depends on
        values derived from the secret key.
      </p>

      <p class="text-sm text-muted mt-1" id="tv-caveat">
        <strong>What this is not.</strong> It is not a key-recovery attack, and it does not show
        that one is possible here. It does not measure the loop's trip count — the library does not
        report it and this panel does not infer it. A timing channel existing is a necessary
        condition for a timing attack, not a sufficient one: a real attack would need many
        signatures, a far better clock than a browser offers, and a way to link each timing to
        known inputs. What it does show is that the channel is <em>there</em>, and large enough to
        see from a web page.
        ${
          coarse
            ? `<br><strong>Note:</strong> this browser's clock resolves
               ${data.timerResolutionMs.toFixed(4)} ms, which is coarse relative to these timings —
               treat the shape as indicative rather than precise.`
            : ''
        }
      </p>`;

    for (const el of Array.from(output.querySelectorAll<HTMLElement>('[data-coeff-height]'))) {
      el.style.height = `${el.dataset.coeffHeight}%`;
    }

    status.textContent = `${SAMPLES} signatures and ${SAMPLES} verifications, ${variantLabel()}.`;
    button.disabled = false;
  });
}
