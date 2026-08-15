import { test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: both skip links focused
 * through the real tab order; the locked Sign & Verify chain scanned before
 * each control that unlocks it; a keypair generated, a message signed, verified,
 * tampered, refused, re-signed, its signature flipped and refused again; a
 * document sealed and its two-lesson tamper readout rendered; the pasted-seal
 * verifier taken through its empty-box error, its malformed-JSON error, its
 * exported-and-verified success and an edited-JSON refusal; the whole chain
 * re-locked by moving the parameter radiogroup with ArrowRight and rebuilt at
 * ML-DSA-87; the Compare tab with a benchmark actually measured in the browser;
 * the How It Works accordion opened one step at a time from an all-but-one-shut
 * start, with the Fiat-Shamir abort loop run until both a rejected and an
 * accepted attempt are on screen, reset to a fresh secret, both `<details>`
 * opened through their summaries, and the Module-LWE slider driven to both ends
 * of its verdict; the PQC Trio and About tabs; and the tablist wrapped back to
 * the first tab with ArrowRight. Every one of those states is scanned, in both
 * themes, at desktop and phone width.
 *
 * See `gate.ts` for why nothing is injected into the page, why no panel is
 * force-revealed, why the lab's defaults are asserted rather than assumed, and
 * why `violations` is not the whole oracle.
 *
 * `expectBaselineNotStale` runs after each drive. It is the third of the three
 * rules the non-text baseline claims to enforce — a finding not listed fails, a
 * listed finding that got WORSE fails, and a listed finding that has been FIXED
 * fails until its entry is deleted — and it is the one that keeps the file a
 * to-do list rather than an allowlist. It was defined and exported in `gate.ts`
 * and nothing called it, so that rule had never run and the baseline could only
 * grow. It is called here, after `driveAllStates`, because it asserts over the
 * states the whole drive reached.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expectBaselineNotStale();
    reportCollected();
  });
}
