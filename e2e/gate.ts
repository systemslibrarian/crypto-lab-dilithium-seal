import AxeBuilder from '@axe-core/playwright';
import { expect, type Download, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText, formatNonTextFailures, type NonTextFailure } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Four rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The gate this replaces
 *     called `neutralizeMotion()` before every scan, pushing
 *     `animation: none !important; transition: none !important` through
 *     `addStyleTag` so the spinner and the tab/pill/step colour transitions
 *     could not be caught mid-flight. It was right about the problem and wrong
 *     about the remedy: overriding from the test BYPASSES this lab's own
 *     `@media (prefers-reduced-motion: reduce)` block instead of exercising it,
 *     so it could not catch the defect where an element's only route to its
 *     painted state is an animation the reduced-motion block cancels without
 *     restoring the end state. That block is load-bearing twice over here — it
 *     also flips `renderFiatShamir`'s reveal loop from a 650ms-per-attempt
 *     cascade to a synchronous render, which is the behaviour the gate then
 *     measures. `boot` asks for the preference, asserts it took effect,
 *     `settle` waits for the animations to drain, and `expectNotBlank` asserts
 *     nothing landed invisible — the same guarantee, obtained honestly.
 *
 *  2. IT REVEALED WHAT IT COULD NOT REACH. `revealCollapsibles()` added
 *     `.active` to every `.step` and forced every `<details>` open, assembling
 *     a document no visitor can load: the stepper is an accordion that shows
 *     exactly one step at a time, and both `<details>` sit inside collapsed
 *     steps. Every step body was scanned simultaneously and none was scanned
 *     the way a reader reaches it, so the collapsed state — which is four of
 *     the five steps, always — was never scanned at all.
 *
 *  3. IT DROVE ALMOST NOTHING ELSE. Two runs (one per theme), each clicking the
 *     five tabs and scanning. It never pressed Generate Keypair, so no key, no
 *     signature, no ✓ VERIFIED, no ✗ FAILED, no tamper warning, no sealed
 *     document, no benchmark table, no Fiat-Shamir attempt card and no
 *     Module-LWE verdict was ever measured; and it never re-locked the page by
 *     switching parameter set. One viewport, and every scan asserted only
 *     `violations`.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab's
 * reduced-motion block collapses `animation-duration` and `transition-duration`
 * to 0.01ms rather than setting `animation: none`, which is the safe form — a
 * cancelled animation loses its end state, a zero-length one still lands on it —
 * and it touches nothing but those two properties, which is the other half of
 * being safe. Neither fact is assumed: this assertion is what checks the first
 * in every driven state, and the second is a two-declaration block anyone can
 * read.
 *
 * `aria-hidden` subtrees are excluded. The cost of that exclusion is stated
 * plainly: text removed from the accessibility tree AND painted at zero opacity
 * is not checked here.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page — including the
 * lab's DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page, because an emulation that silently did
 * nothing would leave the gate certifying a different rendering than the one it
 * claims to.
 *
 * The defaults matter here because this lab's whole first tab is a chain of
 * locks: seven of its nine controls ship disabled and only Generate Keypair
 * opens the first one. If a future change shipped Sign already enabled, or
 * shipped ML-DSA-44 selected instead of -65, the drive below would still be
 * green while measuring a different page. So the locked state is asserted, not
 * assumed — and it is also scanned, because a reader who lands here and reads
 * nothing else sees exactly this.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful. 20s turns that silent hang
  // into a named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  // Every tab panel is rendered into an empty `#tab-content` by `initTabs`, so
  // a navigation that resolves proves nothing.
  await expect(page.locator('#tabs [role="tab"]')).toHaveCount(5);
  await expect(page.locator('#tab-btn-sign-verify')).toHaveAttribute('aria-selected', 'true');
  for (const id of ['compare', 'how-it-works', 'pqc-trio', 'about']) {
    await expect(page.locator(`#tab-btn-${id}`)).toHaveAttribute('aria-selected', 'false');
  }

  // ── The shipped defaults of the Sign & Verify tab ────────────────────────
  // ML-DSA-65, not 44 or 87.
  await expect(page.locator('.pill[aria-checked="true"]')).toHaveText('ML-DSA-65');
  await expect(page.locator('#param-info .info-item')).toHaveCount(4);
  // The locks. Everything downstream of a keypair is shut.
  await expect(page.locator('#btn-keygen')).toBeEnabled();
  await expect(page.locator('#btn-verify-seal')).toBeEnabled();
  for (const id of [
    'btn-sign',
    'btn-verify',
    'btn-tamper-msg',
    'btn-tamper-sig',
    'btn-seal',
    'btn-export-seal',
    'btn-tamper-seal',
  ]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  // And nothing has been computed yet.
  for (const id of ['keygen-output', 'sign-output', 'verify-output', 'seal-output', 'seal-verify-output']) {
    await expect(page.locator(`#${id}`)).toBeEmpty();
  }
  await expect(page.locator('#seal-json-input')).toHaveValue('');

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this lab is a
 * plausible offender at 380px: it prints 64-character hex key dumps and an
 * 80-character base64 signature slice, lays out a five-column scheme table and
 * a seven-column FIPS 204 parameter table, and draws three twelve-column
 * coefficient plots side by side inside every Fiat-Shamir attempt card.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. That
    // cost a run elsewhere in this fleet, and this lab has several decoys: the
    // tab strip, both `.comparison-table`s (which become their own scrollers
    // below 768px) and every `.math-block` scroll sideways inside their own
    // containers.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    // Prefer an unclipped culprit; fall back to the widest clipped one rather
    // than reporting nothing, so the message always names something to look at.
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This is an oracle that only bites after a drive, which is why the gate this
 * replaces never saw it: `.output` is empty until a keypair exists and only
 * overflows its 160px cap once a key dump is in it, and `.comparison-table`
 * only becomes a scroller below 768px. `#tabs` is the one scroller that is a
 * scroller on arrival, and it passes because it is full of buttons.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the
 * committed workflow, and a run with it set prints every finding as it happens
 * and then fails at the end, so a green collection run cannot be mistaken for a
 * green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything.
 *
 * Without this a collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function expectScrollersReachableSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectScrollersReachable(page, label);
  try {
    await expectNoNewNonTextFailures(page, label);
  await expectScrollersReachable(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

async function expectNoHorizontalOverflowSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectNoHorizontalOverflow(page, label);
  try {
    await expectNoHorizontalOverflow(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

/**
 * Scan the page as it currently stands.
 *
 * Six assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. Everything else in that bucket is a real result axe
 *    simply could not finish — including `aria-prohibited-attr`, which is where
 *    an `aria-label` on a role-less `<div>` hides, a defect that never reaches
 *    the violations array at all and which this page shipped.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *    Note the one thing it cannot reach, `::before` generated content; see the
 *    header of `contrast.ts` for the four counters that were measured by hand
 *    instead.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node. Both were being found by hand-sampling screenshot pixels, which does
 * not regress-test.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate, and this sweep has spent its whole length deleting checks
 * that could not fail. So it ratchets instead: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and the run is
  // deliberately left failing at the end by `expectBaselineNotStale` so a
  // capture pass can never be mistaken for a passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(
        `WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`
      );
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  await expectScrollersReachableSoft(page, label);
  await expectNoHorizontalOverflowSoft(page, label);
}



/** Switch tabs the way a reader does, and wait for the panel to be rebuilt. */
async function openTab(page: Page, id: string, firstHeading: string): Promise<void> {
  await page.locator(`#tab-btn-${id}`).click();
  await expect(page.locator(`#tab-btn-${id}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-content')).toHaveAttribute('aria-labelledby', `tab-btn-${id}`);
  await expect(page.locator('#tab-content .card h2').first()).toHaveText(firstHeading);
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Six things shape this drive:
 *
 *  - THE LOCKS ARE STATES, NOT OBSTACLES. Sign & Verify is a chain: Generate
 *    Keypair unlocks Sign and Seal, Sign unlocks Verify and the two tamper
 *    buttons, Seal unlocks Export and Tamper & Verify. Each lock is scanned
 *    before the thing that opens it, and the whole chain is re-locked once more
 *    by switching parameter set — which is a real reset a reader can reach and
 *    which repaints the keygen pane with its own explanatory note.
 *
 *  - BOTH VERDICTS OF EVERYTHING. `.badge-pass` and `.badge-fail`; a signature
 *    that verifies and one broken by a flipped message byte and again by a
 *    flipped signature byte; a sealed document verified from its own exported
 *    JSON and one refused; the empty-input and the malformed-JSON errors; both
 *    sides of the Module-LWE slider (`.mlwe-verdict.solvable` /
 *    `.hard`); and a Fiat-Shamir run, which draws `.fs-attempt.rej` cards until
 *    it draws an `.fs-attempt.ok` one. Those tones exist nowhere else and the
 *    gate this replaces had measured none of them.
 *
 *  - THE ACCORDION IS OPENED ONE STEP AT A TIME. The stepper shows exactly one
 *    `.step.active` at a time, and both `<details class="math-details">` sit
 *    inside collapsed steps. Each step is opened by clicking its own
 *    `.step-title` button and each `<details>` by clicking its `<summary>`, so
 *    the collapsed state is scanned too and a failure names the step it belongs
 *    to. Nothing is force-revealed.
 *
 *  - KEYBOARD ROUTES ARE DRIVEN, NOT ASSUMED. Both skip links are reached by
 *    walking the real tab order (the lab's own reveals itself on `:focus`, and
 *    a scripted `.focus()` is not the same event); the ML-DSA parameter
 *    radiogroup is moved with ArrowRight; and the tablist is moved with
 *    ArrowLeft, which is also the path that wraps from the first tab to the
 *    last.
 *
 *  - THE EXPORTED SEAL IS FED BACK IN. `Export Seal` writes a download rather
 *    than anything on screen, so it is captured and its JSON pasted into the
 *    "Verify a Sealed Document" box. That is the only route to the verifying
 *    branch of `handleVerifySealJSON`, and it exercises the export at the same
 *    time.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a string or class the page itself
 *    writes when the work is done.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('first paint, Sign & Verify locked');

  // ── Both skip links, reached the way a keyboard reaches them ─────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('shared-header skip link focused');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(page.locator('a.skip-link')).toBeFocused();
  await scanAt("lab's own skip link focused");

  // ── Tab 1: the signing chain ─────────────────────────────────────────────
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#keygen-output')).toContainText('Public key');
  await expect(page.locator('#btn-sign')).toBeEnabled();
  await expect(page.locator('#btn-seal')).toBeEnabled();
  await expect(page.locator('#btn-verify')).toBeDisabled();
  await scanAt('keypair generated, annotated public and private key');

  await page.locator('#btn-sign').click();
  await expect(page.locator('#sign-output')).toContainText('Signature');
  await expect(page.locator('#btn-verify')).toBeEnabled();
  await scanAt('message signed');

  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output .badge-pass')).toHaveText('✓ VERIFIED');
  await scanAt('signature verified');

  await page.locator('#btn-tamper-msg').click();
  await expect(page.locator('#verify-output .text-red')).toContainText('Message tampered');
  await scanAt('message tampered, verdict retired');

  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output .badge-fail')).toHaveText('✗ FAILED');
  await scanAt('tampered message refused');

  // A fresh signature over the edited message, so the signature-tamper branch
  // starts from a verifying state rather than an already-failing one.
  await page.locator('#btn-sign').click();
  await expect(page.locator('#verify-output')).toBeEmpty();
  await expect(page.locator('#btn-tamper-sig')).toBeEnabled();
  await scanAt('re-signed over the edited message');

  await page.locator('#btn-tamper-sig').click();
  await expect(page.locator('#btn-tamper-sig')).toBeDisabled();
  await expect(page.locator('#verify-output .text-red')).toContainText('Signature tampered');
  await scanAt('signature byte flipped, tamper control spent');

  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output .badge-fail')).toHaveText('✗ FAILED');
  await scanAt('tampered signature refused');

  // ── Tab 1: sealing ───────────────────────────────────────────────────────
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output .badge-pass')).toHaveText('✓ SEALED & VERIFIED');
  await expect(page.locator('#btn-export-seal')).toBeEnabled();
  await scanAt('document sealed');

  await page.locator('#btn-tamper-seal').click();
  await expect(page.locator('.tamper-lesson')).toBeVisible();
  await expect(page.locator('.tamper-lesson .badge-fail')).toHaveText('✗ TAMPER DETECTED BY SIGNATURE');
  await scanAt('seal tampered, both lessons rendered');

  // ── Tab 1: verifying a pasted seal — every branch ────────────────────────
  await page.locator('#btn-verify-seal').click();
  await expect(page.locator('#seal-verify-output')).toContainText('Please paste a sealed document JSON');
  await scanAt('seal verifier refuses an empty box');

  await page.locator('#seal-json-input').fill('{ not json');
  await page.locator('#btn-verify-seal').click();
  await expect(page.locator('#seal-verify-output')).toContainText('Invalid JSON format');
  await scanAt('seal verifier refuses malformed JSON');

  // The export is a download, and its JSON is the only route to the verifying
  // branch of the pasted-seal path.
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btn-export-seal').click(),
  ]).then(([d]) => d);
  const exported = await readDownload(download);
  await page.locator('#seal-json-input').fill(exported);
  await page.locator('#btn-verify-seal').click();
  await expect(page.locator('#seal-verify-output .badge-pass')).toHaveText('✓ VERIFIED');
  await scanAt('exported seal pasted back and verified');

  // A seal whose content no longer matches what was signed.
  await page.locator('#seal-json-input').fill(
    exported.replace(/"content":\s*"/, '"content": "TAMPERED ')
  );
  await page.locator('#btn-verify-seal').click();
  await expect(page.locator('#seal-verify-output .badge-fail')).toHaveText('✗ FAILED');
  await scanAt('edited seal JSON refused');

  // ── Tab 1: the parameter-set reset, driven from the keyboard ─────────────
  await page.locator('.pill[aria-checked="true"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pill[aria-checked="true"]')).toHaveText('ML-DSA-87');
  await expect(page.locator('#keygen-output')).toContainText('Parameter set is now ML-DSA-87');
  await expect(page.locator('#btn-sign')).toBeDisabled();
  await expect(page.locator('#sign-output')).toBeEmpty();
  await scanAt('parameter set changed to ML-DSA-87, chain re-locked');

  await page.locator('#btn-keygen').click();
  await expect(page.locator('#keygen-output')).toContainText('Public key');
  await scanAt('ML-DSA-87 keypair generated');

  // ── Tab 2: comparison, charts and the live benchmark ─────────────────────
  await openTab(page, 'compare', 'ML-DSA vs Classical Signatures');
  await scanAt('Compare tab');

  await page.locator('#btn-benchmark').click();
  await expect(page.locator('#bench-output table')).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('#bench-output tbody tr')).toHaveCount(4);
  await scanAt('benchmark measured in this browser');

  // ── Tab 3: the accordion, its two visualizations, its two <details> ──────
  await openTab(page, 'how-it-works', 'Start here: the one-sentence idea');
  // Step 1 open, the other four shut — asserted, not assumed.
  await expect(page.locator('.step.active')).toHaveCount(1);
  await expect(page.locator('#step-btn-0')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('details[open]')).toHaveCount(0);
  await scanAt('How It Works, step 1 open');

  for (const i of [1, 2, 3, 4]) {
    await page.locator(`#step-btn-${i}`).click();
    await expect(page.locator(`#step-btn-${i}`)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.step.active')).toHaveCount(1);
    await scanAt(`How It Works, step ${i + 1} open`);
  }

  // Step 3 — the Fiat-Shamir abort loop, run for real.
  await page.locator('#step-btn-2').click();
  await expect(page.locator('#fs-run')).toBeVisible();
  await expect(page.locator('#fs-attempts .fs-attempt')).toHaveCount(0);
  await page.locator('#fs-run').click();
  await expect(page.locator('#fs-stats')).not.toBeEmpty();
  await expect(page.locator('.fs-attempt')).not.toHaveCount(0);
  await scanAt('Fiat-Shamir signing loop run');

  // The abort tone is the lesson, so keep drawing until ONE run has produced
  // both a rejected attempt and the accepted one. A run can also exhaust
  // `runSign`'s 40-attempt safety cap without ever accepting — a third rendered
  // state, with all-red cards and its own summary line — which was measured at
  // about 5% of runs against about 87% for "both". So the cap is scanned
  // opportunistically the first time it appears rather than waited for, and the
  // loop is sized so never reaching "both" is not a practical outcome.
  let cappedScanned = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const rejected = await page.locator('.fs-attempt.rej').count();
    const accepted = await page.locator('.fs-attempt.ok').count();
    if (rejected > 0 && accepted === 1) break;
    if (accepted === 0 && !cappedScanned) {
      const summary = (await page.locator('#fs-stats').textContent()) ?? '';
      if (summary.includes('safety cap')) {
        cappedScanned = true;
        await scanAt('Fiat-Shamir run stopped at its safety cap, nothing accepted');
      }
    }
    await page.locator('#fs-run').click();
    await expect(page.locator('#fs-stats')).not.toBeEmpty();
  }
  await expect(page.locator('.fs-attempt.rej').first()).toBeVisible();
  await expect(page.locator('.fs-attempt.ok')).toHaveCount(1);
  await scanAt('Fiat-Shamir run showing rejected and accepted attempts');

  await page.locator('#fs-reroll').click();
  await expect(page.locator('#fs-stats')).toHaveText(/Fresh secret/);
  await expect(page.locator('.fs-attempt')).toHaveCount(0);
  await scanAt('Fiat-Shamir reset to a fresh secret');

  await page.locator('.step.active details.math-details > summary').click();
  await expect(page.locator('.step.active details.math-details')).toHaveAttribute('open', '');
  await scanAt('step 3 algebra disclosure open');

  // Step 5 — Module-LWE, both sides of the slider.
  await page.locator('#step-btn-4').click();
  await expect(page.locator('#mlwe-err')).toBeVisible();
  await expect(page.locator('.mlwe-verdict.hard')).toBeVisible();
  await scanAt('Module-LWE with an error present');

  await page.locator('#mlwe-err').fill('0');
  await expect(page.locator('#mlwe-err-out')).toHaveText('0');
  await expect(page.locator('.mlwe-verdict.solvable .badge-fail')).toBeVisible();
  await scanAt('Module-LWE with the error removed, system solvable');

  await page.locator('#mlwe-err').fill('3');
  await expect(page.locator('.mlwe-verdict.hard .badge-pass')).toBeVisible();
  await scanAt('Module-LWE at the largest error');

  await page.locator('.step.active details.math-details > summary').click();
  await expect(page.locator('.step.active details.math-details')).toHaveAttribute('open', '');
  await scanAt('step 5 complexity disclosure open');

  // ── Tabs 4 and 5 ─────────────────────────────────────────────────────────
  await openTab(page, 'pqc-trio', 'The NIST Post-Quantum Cryptography Trio');
  await scanAt('PQC Trio tab');

  await openTab(page, 'about', 'About dilithium-seal');
  await scanAt('About tab');

  // The tablist's own keyboard route, taken at the wrap point.
  await page.locator('#tab-btn-about').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-btn-sign-verify')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-btn-sign-verify')).toBeFocused();
  await scanAt('tablist wrapped back to tab 1 with ArrowRight');
}

/**
 * Read a Playwright download into a string.
 *
 * `node:fs` is imported dynamically, matching `claims.spec.ts`: this repo's
 * `tsconfig.json` scopes type-checking to `src`, so the e2e suite has no Node
 * type declarations and a top-level `import … from 'node:fs/promises'` would be
 * a compile error in an editor even though Playwright transpiles it fine.
 */
async function readDownload(download: Download): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile((await download.path())!, 'utf8');
}
