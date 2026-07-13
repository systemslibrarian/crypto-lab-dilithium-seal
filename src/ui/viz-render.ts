/**
 * DOM rendering for the teaching visualizations:
 *   1. Fiat-Shamir-with-aborts animator (Signing step)
 *   2. Module-LWE "add / remove the error" visual (Why quantum-hard)
 *
 * All math is delegated to fiat-shamir-viz.ts (real, live-computed). This file
 * only paints coefficient bar plots and drives the reject→retry animation.
 */

import { runSign, rerollSecret, FS_PARAMS, type SignAttempt } from './fiat-shamir-viz';

// ── Coefficient bar plot ────────────────────────────────────────────────────
// A signed row of bars centred on a zero baseline. Values above `bound` (when
// given) are flagged red so an oversized z reads at a glance.
function coeffBars(
  coeffs: number[],
  opts: { max: number; bound?: number; accent?: string } = { max: 1 },
): string {
  const { max, bound, accent } = opts;
  const bars = coeffs
    .map((v) => {
      const frac = Math.min(1, Math.abs(v) / max);
      const h = Math.round(frac * 100);
      const over = bound !== undefined && Math.abs(v) >= bound;
      const cls = over ? 'coeff-bar over' : accent ? `coeff-bar ${accent}` : 'coeff-bar';
      const up = v >= 0;
      return `
        <div class="coeff-col" role="img" aria-label="coefficient ${v}">
          <div class="coeff-half top">${up ? `<span class="${cls}" style="height:${h}%"></span>` : ''}</div>
          <div class="coeff-axis"></div>
          <div class="coeff-half bot">${!up ? `<span class="${cls}" style="height:${h}%"></span>` : ''}</div>
          <div class="coeff-val">${v}</div>
        </div>`;
    })
    .join('');
  return `<div class="coeff-plot">${bars}</div>`;
}

function attemptCard(a: SignAttempt, idx: number): string {
  const { GAMMA1, REJECT_BOUND } = FS_PARAMS;
  const verdict = a.accepted
    ? `<span class="badge badge-pass">✓ ACCEPT — ‖z‖∞ = ${a.zNorm} &lt; ${REJECT_BOUND}</span>`
    : `<span class="badge badge-fail">✗ REJECT — ‖z‖∞ = ${a.zNorm} ≥ ${REJECT_BOUND} (would leak s₁)</span>`;
  return `
    <div class="fs-attempt ${a.accepted ? 'ok' : 'rej'}">
      <div class="fs-attempt-head">
        <span class="fs-attempt-n">Attempt ${idx + 1}</span> ${verdict}
      </div>
      <div class="fs-grid">
        <div class="fs-cell">
          <div class="fs-cap"><strong>y</strong> — random mask <span class="text-muted">(‖y‖∞ ≤ γ₁=${GAMMA1})</span></div>
          ${coeffBars(a.y, { max: GAMMA1, accent: 'mask' })}
        </div>
        <div class="fs-cell">
          <div class="fs-cap"><strong>c·s₁</strong> — secret's contribution <span class="text-muted">(small)</span></div>
          ${coeffBars(a.cs1, { max: GAMMA1, accent: 'secret' })}
        </div>
        <div class="fs-cell">
          <div class="fs-cap"><strong>z = y + c·s₁</strong> — response <span class="text-muted">(reject if any |coef| ≥ ${REJECT_BOUND})</span></div>
          ${coeffBars(a.z, { max: GAMMA1, bound: REJECT_BOUND })}
        </div>
      </div>
    </div>`;
}

export function renderFiatShamir(host: HTMLElement): void {
  const { N, Q, GAMMA1, BETA, TAU, ETA, REJECT_BOUND } = FS_PARAMS;
  host.innerHTML = `
    <div class="fs-viz">
      <p class="text-sm text-muted">
        Press <strong>Run the signing loop</strong> to watch Fiat-Shamir <em>with aborts</em> happen for real.
        Each attempt draws a fresh random mask <strong>y</strong>, adds the secret's contribution
        <strong>c·s₁</strong>, and forms the response <strong>z</strong>. If any coefficient of z is too
        large it <strong>leaks information about s₁</strong>, so the signer throws that attempt away and
        retries. Only a "short enough" z is released.
      </p>
      <div class="fs-controls flex-row">
        <button class="btn" id="fs-run" type="button">Run the signing loop</button>
        <button class="btn btn-secondary" id="fs-reroll" type="button">New secret s₁</button>
        <span class="fs-stats text-sm" id="fs-stats" aria-live="polite"></span>
      </div>
      <div class="fs-scale text-sm text-muted">
        Illustrative scale model — real ML-DSA math, shrunk so every coefficient is visible:
        N=${N} coeffs (real: 256), q=${Q} (real: 8380417), η=${ETA}, γ₁=${GAMMA1}, β=${BETA} (τ=${TAU}),
        reject bound γ₁−β=${REJECT_BOUND}. The reject rule and the equation z = y + c·s₁ are exact.
      </div>
      <div class="fs-attempts" id="fs-attempts" aria-live="polite"></div>
    </div>`;

  const runBtn = host.querySelector<HTMLButtonElement>('#fs-run')!;
  const rerollBtn = host.querySelector<HTMLButtonElement>('#fs-reroll')!;
  const stats = host.querySelector<HTMLElement>('#fs-stats')!;
  const list = host.querySelector<HTMLElement>('#fs-attempts')!;

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function play(): void {
    runBtn.disabled = true;
    rerollBtn.disabled = true;
    list.innerHTML = '';
    stats.textContent = '';
    const run = runSign();
    const rejects = run.attempts.length - 1;

    const reveal = (i: number) => {
      if (i >= run.attempts.length) {
        stats.innerHTML = rejects === 0
          ? `Accepted on the first try (0 rejects this time).`
          : `Rejected <strong>${rejects}</strong> oversized response${rejects === 1 ? '' : 's'}, then accepted attempt ${run.attempts.length}. Real ML-DSA averages ~4–7 tries.`;
        runBtn.disabled = false;
        rerollBtn.disabled = false;
        return;
      }
      list.insertAdjacentHTML('beforeend', attemptCard(run.attempts[i], i));
      const cards = list.querySelectorAll('.fs-attempt');
      cards[cards.length - 1]?.scrollIntoView({ block: 'nearest' });
      if (reduce) reveal(i + 1);
      else setTimeout(() => reveal(i + 1), 650);
    };
    reveal(0);
  }

  runBtn.addEventListener('click', play);
  rerollBtn.addEventListener('click', () => {
    rerollSecret();
    list.innerHTML = '';
    stats.textContent = 'Fresh secret s₁ drawn. Run the loop to sign with it.';
  });
}

// ── Module-LWE "shrink the error" visual ────────────────────────────────────
// t = A·s + e. Real modular arithmetic; a slider scales the error e. At e=0 the
// system is a plain linear system (Gaussian elimination solves it instantly);
// with e present, recovering s is Module-LWE — no efficient (quantum) algorithm.
export function renderModuleLWE(host: HTMLElement): void {
  const q = 97;
  const s = [3, 1, 2]; // secret (small)
  const A = [
    [12, 5, 41],
    [7, 33, 2],
    [19, 8, 27],
  ];
  const As = A.map((row) => row.reduce((sum, aij, j) => sum + aij * s[j], 0) % q);

  function render(errScale: number): void {
    // Deterministic small error pattern scaled by the slider (0..3).
    const ePattern = [1, -1, 1];
    const e = ePattern.map((x) => x * errScale);
    const t = As.map((v, i) => (((v + e[i]) % q) + q) % q);
    const solvable = errScale === 0;

    const eq = As.map(
      (as, i) =>
        `<div class="mlwe-row">
           <span class="mlwe-t">t<sub>${i + 1}</sub> = ${t[i]}</span>
           <span class="mlwe-eqls">=</span>
           <span class="mlwe-as">(A·s)<sub>${i + 1}</sub> = ${as}</span>
           <span class="mlwe-plus">+</span>
           <span class="mlwe-e ${e[i] !== 0 ? 'live' : 'zero'}">e<sub>${i + 1}</sub> = ${e[i]}</span>
         </div>`,
    ).join('');

    host.querySelector('#mlwe-eq')!.innerHTML = eq;
    const verdict = host.querySelector<HTMLElement>('#mlwe-verdict')!;
    if (solvable) {
      verdict.className = 'mlwe-verdict solvable';
      verdict.innerHTML =
        '<span class="badge badge-fail">✗ NO ERROR → BROKEN</span> ' +
        'With e = 0 this is just <strong>t = A·s</strong>: a plain linear system. Gaussian elimination recovers the secret s instantly — no security at all.';
    } else {
      verdict.className = 'mlwe-verdict hard';
      verdict.innerHTML =
        '<span class="badge badge-pass">✓ ERROR PRESENT → HARD</span> ' +
        'The small error e hides s. Recovering it is <strong>Module-LWE</strong> — the best known classical <em>and</em> quantum algorithms are exponential. This is the wall Shor cannot climb.';
    }
  }

  host.innerHTML = `
    <div class="mlwe-viz">
      <p class="text-sm text-muted">
        ML-DSA's public key is <strong>t = A·s + e</strong>: a public matrix <strong>A</strong> times the
        secret <strong>s</strong>, plus a small <strong>error e</strong>. Drag the slider to change the error
        and watch the problem flip between trivially solvable and quantum-hard.
      </p>
      <div class="mlwe-slider-row">
        <label for="mlwe-err">Error size (‖e‖∞)</label>
        <input type="range" id="mlwe-err" min="0" max="3" step="1" value="1"
               aria-describedby="mlwe-verdict" />
        <output id="mlwe-err-out" for="mlwe-err">1</output>
      </div>
      <div class="mlwe-eq" id="mlwe-eq"></div>
      <div class="mlwe-verdict" id="mlwe-verdict" aria-live="polite"></div>
      <div class="mlwe-contrast">
        <div class="mlwe-contrast-col broken">
          <div class="mlwe-contrast-h">Shor <strong>breaks</strong></div>
          <p class="text-sm">RSA (factoring) and ECDSA (discrete log) — periodic structure a quantum computer finds in polynomial time.</p>
        </div>
        <div class="mlwe-contrast-col safe">
          <div class="mlwe-contrast-h">Shor <strong>fails</strong></div>
          <p class="text-sm">Module-LWE / Module-SIS have no periodic structure to exploit. No known quantum algorithm beats classical by more than Grover's quadratic factor.</p>
        </div>
      </div>
    </div>`;

  const slider = host.querySelector<HTMLInputElement>('#mlwe-err')!;
  const out = host.querySelector<HTMLOutputElement>('#mlwe-err-out')!;
  slider.addEventListener('input', () => {
    out.textContent = slider.value;
    render(Number(slider.value));
  });
  render(Number(slider.value));
}
