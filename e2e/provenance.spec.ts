import { expect, test, type Page } from '@playwright/test';

/**
 * Provenance, freshness and terminology, checked on the rendered page.
 *
 * `src/__tests__/sources.test.ts` proves the registry is internally consistent.
 * This file proves the reader can actually see it, and that the page does not
 * contradict it — a registry is worth nothing if the sentence next to the
 * citation still says something the source does not.
 *
 * The terminology assertions are the sharp ones. "Dilithium" and "ML-DSA" being
 * used interchangeably is not a typo, it is a claim: that the competition
 * submission and the standard are the same object. They are not — two of the
 * three signature sizes differ — so the page is required to keep them apart.
 */

const STRIP = '#standards-strip';

async function openAbout(page: Page): Promise<void> {
  await page.locator('#tab-btn-about').click();
  await expect(page.locator('#standards-status')).toBeVisible();
}

test.describe('standards status is visible without opening the README', () => {
  test('the strip is on screen on first paint, before any tab is chosen', async ({ page }) => {
    await page.goto('.');
    const strip = page.locator(STRIP);
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('FIPS 204');
    await expect(strip).toContainText('13 August 2024');
    await expect(strip).toContainText('Standards reviewed');
    await expect(strip).toContainText('no errata update issued');
  });

  test('the strip stays visible on every tab, not just About', async ({ page }) => {
    await page.goto('.');
    for (const id of ['compare', 'how-it-works', 'pqc-trio', 'about', 'sign-verify']) {
      await page.locator(`#tab-btn-${id}`).click();
      await expect(page.locator(STRIP), `strip on ${id}`).toBeVisible();
      await expect(page.locator(STRIP)).toContainText('Standards reviewed');
    }
  });

  test('the reviewed date is a real, non-future date', async ({ page }) => {
    await page.goto('.');
    const text = (await page.locator(STRIP).innerText()) ?? '';
    const match = text.match(/Standards reviewed (\d{1,2} \w+ \d{4})/);
    expect(match, `no reviewed date in: ${text}`).not.toBeNull();
    const reviewed = Date.parse(match![1]);
    expect(Number.isNaN(reviewed)).toBe(false);
    expect(reviewed).toBeLessThanOrEqual(Date.now());
  });
});

test.describe('the provenance panel', () => {
  test('names the FIPS 204 edition and says no errata is incorporated', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const panel = page.locator('#standards-status');
    await expect(panel).toContainText('FIPS 204 (initial public version)');
    await expect(panel).toContainText('13 August 2024');
    await expect(panel).toContainText('Errata incorporated');
    await expect(panel).toContainText('None');
    // The errata spreadsheet exists and is described as non-binding.
    await expect(panel).toContainText('ARE NOT official changes');
  });

  test('lists every source with its status, and marks drafts as drafts', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const body = page.locator('#tab-content');
    await expect(body).toContainText('NIST IR 8547');
    await expect(body).toContainText('Initial Public Draft');
    await expect(body).toContainText('Competition submission');
    // Every source link must be external, labelled, and safe.
    const links = page.locator('#tab-content a[href^="https://"]');
    expect(await links.count()).toBeGreaterThan(10);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('rel', /noopener/);
      expect((await link.innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('records the repetitions correction rather than silently using either number', async ({
    page,
  }) => {
    await page.goto('.');
    await openAbout(page);
    const body = await page.locator('#tab-content').innerText();
    // Published values, pending values, and the fact that the correction is not
    // yet official — all three, or the page is misleading in one direction.
    expect(body).toContain('4.25');
    expect(body).toContain('4.36, 5.14 and 3.91');
    expect(body).toMatch(/not yet an official change/i);
  });
});

test.describe('CRYSTALS-Dilithium and ML-DSA are kept apart', () => {
  test('the hero does not present them as one name', async ({ page }) => {
    await page.goto('.');
    const sub = await page.locator('.cl-hero-sub').innerText();
    // The old subtitle was "ML-DSA · CRYSTALS-Dilithium · NIST FIPS 204" — three
    // labels in a row, which reads as three names for one thing.
    expect(sub).toContain('ML-DSA');
    expect(sub).toMatch(/standardized from/i);
    expect(sub).not.toMatch(/ML-DSA\s*[·•|]\s*CRYSTALS-Dilithium/);
  });

  test('the lineage table shows differences that are visible in bytes', async ({ page }) => {
    await page.goto('.');
    await openAbout(page);
    const body = await page.locator('#tab-content').innerText();
    // Round-3 sizes and final sizes, both present and different.
    expect(body).toContain('2420 / 3293 / 4595');
    expect(body).toContain('2420 / 3309 / 4627');
    expect(body).toMatch(/not interchangeable/i);
  });

  test('the signature the page actually produces is the FIPS 204 size, not the round-3 one', async ({
    page,
  }) => {
    await page.goto('.');
    // Default is ML-DSA-65: FIPS 204 says 3309 bytes, round-3 Dilithium3 says 3293.
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output')).toContainText('Public key');
    await page.locator('#btn-sign').click();
    await expect(page.locator('#sign-output')).toContainText('Signature');
    const out = await page.locator('#sign-output').innerText();
    expect(out).toContain('3309');
    expect(out).not.toContain('3293');
  });

  test('no page presents a round-3 Core-SVP estimate as a FIPS 204 property', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-4').click();
    await page.locator('.step.active details.math-details > summary').click();
    const body = await page.locator('#tab-content').innerText();

    // The figure may appear — it is a real number from a real document — but
    // only attributed to the round-3 submission, and never as "ML-DSA provides
    // N-bit security", which is what this page used to say.
    if (body.includes('165')) {
      expect(body).toMatch(/round-3/i);
      expect(body).toMatch(/Core-SVP/i);
    }
    expect(body).not.toMatch(/ML-DSA-65[^.]*approximately\s*165-bit/i);
    // And FIPS 204's own refusal to give a single number is quoted.
    expect(body).toMatch(/not described by a single number/i);
    expect(body).toMatch(/category 3/i);
  });
});

test.describe('claims carry citations', () => {
  test('every citation link resolves to a registered source document', async ({ page }) => {
    await page.goto('.');
    const seen = new Set<string>();
    for (const id of ['sign-verify', 'compare', 'how-it-works', 'pqc-trio', 'about']) {
      await page.locator(`#tab-btn-${id}`).click();
      await expect(page.locator('#tab-content')).not.toBeEmpty();
      for (const link of await page.locator('#tab-content a.cite').all()) {
        const href = (await link.getAttribute('href')) ?? '';
        const label = (await link.getAttribute('aria-label')) ?? '';
        expect(href, `citation on ${id}`).toMatch(/^https:\/\//);
        // "FIPS 204 Tbl 2" read aloud out of context is not a destination; the
        // accessible name has to name the document...
        expect(label, `citation on ${id}`).toMatch(/ — source: /);
        expect(label.length).toBeGreaterThan(20);
        // ...and WCAG 2.5.3 (Label in Name, level A) requires it to CONTAIN
        // the visible text, so voice control can activate what it can see.
        const visible = ((await link.innerText()) ?? '').replace(/\s*⚠$/, '').trim();
        expect(label.toLowerCase(), `visible "${visible}" vs name "${label}"`).toContain(
          visible.toLowerCase()
        );
        seen.add(href);
      }
    }
    // Citations must actually be present across the demo, not just on About.
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  test('the Sign & Verify tab cites the standard for the sizes it prints', async ({ page }) => {
    await page.goto('.');
    const cites = page.locator('#tab-content a.cite');
    expect(await cites.count()).toBeGreaterThan(0);
    await expect(cites.first()).toHaveAttribute('href', /csrc\.nist\.gov/);
  });
});
