import { expect, test, type Page } from '@playwright/test';

/**
 * Runtime assurances, checked in a real browser.
 *
 * The unit suite proves the fail-closed behaviour of the crypto module. This
 * file proves the two things only a browser can show:
 *
 *  - the page TELLS the reader when it refuses, instead of leaving a spinner
 *    turning. An operation that stops silently is indistinguishable from one
 *    that hung, and "fails closed" is not a property of code that never says so.
 *  - the limitations are on the page rather than in a source comment.
 */

/** Remove crypto.getRandomValues before any application code runs. */
async function disableRandomness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', {
      value: undefined,
      configurable: true,
    });
  });
}

async function openAbout(page: Page): Promise<void> {
  await page.locator('#tab-btn-about').click();
  await expect(page.locator('#implementation-identity')).toBeVisible();
}

test.describe('implementation identity is on the page', () => {
  test('names the library and an exact version next to where keys are made', async ({ page }) => {
    await page.goto('.');
    const badge = page.locator('.impl-badge');
    await expect(badge).toBeVisible();
    const text = await badge.innerText();
    expect(text).toContain('@noble/post-quantum');
    // An exact x.y.z, never a range.
    expect(text).toMatch(/@noble\/post-quantum \d+\.\d+\.\d+/);
    expect(text).not.toMatch(/[\^~]\d/);
    expect(text).toContain('crypto.getRandomValues');
    expect(text).toContain('Not independently audited');
  });

  test('the version shown matches the one the build injected', async ({ page }) => {
    await page.goto('.');
    const badgeVersion = (await page.locator('.impl-badge').innerText()).match(
      /@noble\/post-quantum (\d+\.\d+\.\d+)/
    )?.[1];
    await openAbout(page);
    const tableVersion = await page
      .locator('#implementation-packages tbody tr')
      .first()
      .locator('td')
      .first()
      .innerText();
    // Two independent renderings of the same build-time constant; if they can
    // disagree, one of them is hand-written.
    expect(badgeVersion).toBe(tableVersion.trim());
  });

  test('states implementation type, randomness, audit and validation', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const panel = page.locator('#implementation-identity');
    await expect(panel).toContainText('JavaScript');
    await expect(panel).toContainText('no WebAssembly');
    await expect(panel).toContainText('getRandomValues');
    await expect(panel).toContainText('has not been independently audited');
    await expect(panel).toContainText('no CMVP certificate');
    // The self-audit does not cover what ships, and the page says so.
    await expect(panel).toContainText('later than that');
  });

  test('lists the ML-DSA modes and the integrity hash of each package', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    await expect(page.locator('#implementation-identity')).toContainText('HashML-DSA');
    await expect(page.locator('#implementation-identity')).toContainText('external-µ');
    const integrity = await page
      .locator('#implementation-packages tbody tr')
      .first()
      .locator('td')
      .nth(1)
      .innerText();
    expect(integrity).toMatch(/^sha\d{3}-/);
  });
});

test.describe('limitations are visible, not buried', () => {
  const REQUIRED = [
    'not-constant-time',
    'no-erasure',
    'trust-boundary',
    'kat-not-audit',
    'identity-binding',
    'randomness-dependency',
  ];

  test('every required limitation renders with real text', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    for (const id of REQUIRED) {
      const el = page.locator(`#limitation-${id}`);
      await expect(el, id).toBeVisible();
      expect((await el.innerText()).length, id).toBeGreaterThan(150);
    }
  });

  test('says the implementation is not claimed to be constant-time', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const body = await page.locator('#limitations').innerText();
    expect(body).toContain('does not claim constant-time execution');
    // And nowhere on the page is constant-time asserted as a property.
    const whole = await page.locator('#app').innerText();
    expect(whole).not.toMatch(/is constant[- ]time/i);
    expect(whole).not.toMatch(/constant[- ]time (?:implementation|guarantee)/i);
  });

  test('says a valid signature does not by itself establish identity', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const body = await page.locator('#limitation-identity-binding').innerText();
    expect(body).toMatch(/does not tell you whose key it is/i);
    expect(body).toMatch(/proof of possession/i);
  });

  test('says passing vectors is not an audit or a validation', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const body = await page.locator('#limitation-kat-not-audit').innerText();
    expect(body).toMatch(/not a CMVP/i);
    expect(body).toMatch(/not an independent security audit/i);
  });

  test('never calls itself NIST-validated, CMVP-validated or FIPS-certified', async ({ page }) => {
    await page.goto('.');
    for (const id of ['sign-verify', 'compare', 'how-it-works', 'pqc-trio', 'about']) {
      await page.locator(`#tab-btn-${id}`).click();
      await expect(page.locator('#tab-content')).not.toBeEmpty();
      const text = await page.locator('#app').innerText();
      // The negated forms are what the page DOES say, so match only the
      // affirmative claim.
      expect(text, id).not.toMatch(/\bis (NIST|CMVP)[- ]validated\b/i);
      expect(text, id).not.toMatch(/\bFIPS[- ]certified\b/i);
      expect(text, id).not.toMatch(/\bFIPS 140[- ]validated\b(?!.{0,40}(no|not))/i);
    }
  });
});

test.describe('failing closed on randomness', () => {
  test('key generation refuses and says so, instead of spinning forever', async ({ page }) => {
    await disableRandomness(page);
    await page.goto('.');
    await expect(page.locator('#btn-keygen')).toBeEnabled();

    await page.locator('#btn-keygen').click();

    const out = page.locator('#keygen-output');
    await expect(out.locator('.badge-fail')).toHaveText('✗ STOPPED — NO SECURE RANDOMNESS');
    await expect(out).toContainText('Secure randomness is unavailable');
    await expect(out).toContainText('Nothing was generated or signed');
    // The spinner is gone and no key was produced.
    await expect(out.locator('.spinner')).toHaveCount(0);
    await expect(out).not.toContainText('Public key');
    // Nothing downstream unlocked.
    await expect(page.locator('#btn-sign')).toBeDisabled();
    await expect(page.locator('#btn-seal')).toBeDisabled();
    // ...and the control is usable again rather than left disabled.
    await expect(page.locator('#btn-keygen')).toBeEnabled();
  });

  test('never falls back: no key material appears anywhere after the refusal', async ({ page }) => {
    await disableRandomness(page);
    await page.goto('.');
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output .badge-fail')).toBeVisible();
    // A fallback would have rendered a hex dump and a byte count.
    const text = await page.locator('#tab-content').innerText();
    expect(text).not.toMatch(/\b\d{4} bytes\b/);
    expect(text).not.toMatch(/^[0-9a-f]{32}/m);
  });

  test('verification still works without randomness', async ({ page }) => {
    // Sign first, with randomness available.
    await page.goto('.');
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output')).toContainText('Public key');
    await page.locator('#btn-seal').click();
    await expect(page.locator('#seal-output .badge-pass')).toBeVisible();
    const exported = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-export-seal').click(),
    ]).then(async ([d]) => {
      const { readFile } = await import('node:fs/promises');
      return readFile((await d.path())!, 'utf8');
    });

    // Now reload with no RBG and verify the seal made earlier.
    await disableRandomness(page);
    await page.goto('.');
    await page.locator('#seal-json-input').fill(exported);
    await page.locator('#btn-verify-seal').click();
    await expect(page.locator('#seal-verify-output .badge-pass')).toHaveText('✓ VERIFIED');
  });
});
