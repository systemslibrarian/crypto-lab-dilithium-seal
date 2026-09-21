import { expect, test, type Page } from '@playwright/test';

/**
 * Browser resilience: the page under conditions it does not control.
 *
 * `a11y.spec.ts` drives every state through axe in both themes at two widths.
 * This file covers the rest of Priority 8's matrix — three named viewports,
 * forced-colors, reduced motion, keyboard-only operation, the complete
 * parameter selector, and whether a reader can actually *find* the security
 * policy, threat model, limitations, sources and implementation identity.
 *
 * The last one is not decoration. Documents nobody can reach are documents
 * nobody reads, and this project's honesty depends on them being reachable.
 */

const VIEWPORTS = [
  { name: '320px (smallest common phone)', width: 320, height: 720 },
  { name: '768px (tablet portrait)', width: 768, height: 1024 },
  { name: '1440px (desktop)', width: 1440, height: 900 },
] as const;

const TABS = ['sign-verify', 'compare', 'how-it-works', 'pqc-trio', 'about'] as const;
const VARIANTS = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'] as const;

/** Sizes from FIPS 204 Table 2, as the UI formats them. */
const EXPECTED = {
  'ML-DSA-44': { pub: '1.3 KB', priv: '2.5 KB', sig: '2.4 KB', cat: '2', bytes: 2420 },
  'ML-DSA-65': { pub: '1.9 KB', priv: '3.9 KB', sig: '3.2 KB', cat: '3', bytes: 3309 },
  'ML-DSA-87': { pub: '2.5 KB', priv: '4.8 KB', sig: '4.5 KB', cat: '5', bytes: 4627 },
} as const;

async function horizontalOverflow(page: Page): Promise<null | Record<string, unknown>> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;
    let widest = '';
    let right = 0;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > right) {
        right = box.right;
        widest = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`;
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest, right };
  });
}

async function selectVariant(page: Page, variant: string): Promise<void> {
  await page.locator('#variant-pills .pill', { hasText: variant }).click();
  await expect(page.locator('#variant-pills .pill', { hasText: variant })).toHaveAttribute(
    'aria-checked',
    'true'
  );
}

test.describe('layout holds at every named viewport', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: no horizontal overflow on any tab`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('.');
      for (const tab of TABS) {
        await page.locator(`#tab-btn-${tab}`).click();
        await expect(page.locator('#tab-content')).not.toBeEmpty();
        expect(await horizontalOverflow(page), `${viewport.name} / ${tab}`).toBeNull();
      }
    });

    test(`${viewport.name}: the signing chain works and stays in bounds`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('.');
      await page.locator('#btn-keygen').click();
      await expect(page.locator('#keygen-output')).toContainText('Public key');
      await page.locator('#btn-sign').click();
      await expect(page.locator('#sign-output')).toContainText('Signature');
      await page.locator('#btn-verify').click();
      await expect(page.locator('#verify-output .badge-pass')).toBeVisible();
      // Key and signature hex dumps are the longest strings the page renders.
      expect(await horizontalOverflow(page), `${viewport.name} after signing`).toBeNull();
    });
  }
});

test.describe('the ML-DSA parameter selector', () => {
  test('offers exactly the three final parameter sets, as a radiogroup', async ({ page }) => {
    await page.goto('.');
    const group = page.locator('#variant-pills');
    await expect(group).toHaveAttribute('role', 'radiogroup');
    // Named, or a screen-reader user meets an unlabelled group of three.
    await expect(group).toHaveAttribute('aria-labelledby', 'variant-label');
    const pills = group.locator('[role="radio"]');
    await expect(pills).toHaveCount(3);
    expect(await pills.allInnerTexts()).toEqual([...VARIANTS]);
    // Exactly one selected at a time.
    await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
  });

  for (const variant of VARIANTS) {
    test(`${variant}: selecting it updates category, sizes and guidance`, async ({ page }) => {
      await page.goto('.');
      await selectVariant(page, variant);
      const info = await page.locator('#param-info').innerText();
      const expected = EXPECTED[variant];
      expect(info).toContain(expected.pub);
      expect(info).toContain(expected.priv);
      expect(info).toContain(expected.sig);
      expect(info).toContain(expected.cat);

      const guidance = await page.locator('#variant-guidance').innerText();
      expect(guidance).toMatch(/^Use when/);
      expect(guidance).toContain(`category ${expected.cat}`);
    });

    test(`${variant}: real KeyGen, Sign and Verify, at that set's own sizes`, async ({ page }) => {
      await page.goto('.');
      await selectVariant(page, variant);
      await page.locator('#btn-keygen').click();
      await expect(page.locator('#keygen-output')).toContainText('Public key');
      await page.locator('#btn-sign').click();
      await expect(page.locator('#sign-output')).toContainText('Signature');
      // The byte count printed must be this parameter set's, from FIPS 204.
      expect(await page.locator('#sign-output').innerText()).toContain(
        `${EXPECTED[variant].bytes} bytes`
      );
      await page.locator('#btn-verify').click();
      await expect(page.locator('#verify-output .badge-pass')).toHaveText('✓ VERIFIED');
    });

    test(`${variant}: a modified message and a modified signature are both rejected`, async ({
      page,
    }) => {
      await page.goto('.');
      await selectVariant(page, variant);
      await page.locator('#btn-keygen').click();
      await expect(page.locator('#btn-sign')).toBeEnabled();

      // 1. Modified message.
      await page.locator('#btn-sign').click();
      await expect(page.locator('#btn-tamper-msg')).toBeEnabled();
      await page.locator('#btn-tamper-msg').click();
      await page.locator('#btn-verify').click();
      await expect(page.locator('#verify-output .badge-fail')).toHaveText('✗ FAILED');

      // 2. Modified signature, from a freshly verifying state.
      await page.locator('#btn-sign').click();
      await page.locator('#btn-verify').click();
      await expect(page.locator('#verify-output .badge-pass')).toBeVisible();
      await page.locator('#btn-tamper-sig').click();
      await page.locator('#btn-verify').click();
      await expect(page.locator('#verify-output .badge-fail')).toHaveText('✗ FAILED');
    });
  }

  test('does not present any set as automatically best', async ({ page }) => {
    await page.goto('.');
    const text = await page.locator('#tab-content').innerText();
    expect(text).not.toMatch(/prioriti[sz]es security over speed/i);
    expect(text).not.toMatch(/ML-DSA-87 is (the )?(best|strongest|most secure)/i);
    // And it says what should actually drive the choice.
    const guidance = await page.locator('#selector-guidance').innerText();
    expect(guidance).toMatch(/is not "the best one"/i);
    expect(guidance).toMatch(/protocol/i);
    expect(guidance).toMatch(/security strength category/i);
    expect(guidance).toMatch(/how long must the signature remain meaningful/i);
    expect(guidance).toMatch(/interoperate/i);
  });

  test('changing the set invalidates key material rather than mixing profiles', async ({ page }) => {
    await page.goto('.');
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#btn-sign')).toBeEnabled();
    await selectVariant(page, 'ML-DSA-87');
    // A keypair belongs to exactly one parameter set.
    await expect(page.locator('#btn-sign')).toBeDisabled();
    await expect(page.locator('#keygen-output')).toContainText('Parameter set is now ML-DSA-87');
  });
});

test.describe('keyboard-only operation', () => {
  test('both skip links are reachable by Tab, in order', async ({ page }) => {
    await page.goto('.');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Tab');
    await expect(page.locator('a.cl-skip-link')).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(page.locator('a.skip-link')).toBeFocused();
  });

  test('the tablist follows the WCAG pattern in both directions and wraps', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-sign-verify').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-btn-compare')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-btn-sign-verify')).toHaveAttribute('aria-selected', 'true');
    // Wrap backwards from the first tab.
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-btn-about')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.locator('#tab-btn-about')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-btn-sign-verify')).toHaveAttribute('aria-selected', 'true');
  });

  test('the parameter radiogroup moves with arrow keys and keeps one tab stop', async ({ page }) => {
    await page.goto('.');
    await page.locator('#variant-pills .pill[aria-checked="true"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#variant-pills .pill[aria-checked="true"]')).toHaveText('ML-DSA-87');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#variant-pills .pill[aria-checked="true"]')).toHaveText('ML-DSA-65');
    // Roving tabindex: exactly one pill is in the tab order.
    expect(await page.locator('#variant-pills .pill[tabindex="0"]').count()).toBe(1);
  });

  test('the whole signing chain can be driven without a mouse', async ({ page }) => {
    await page.goto('.');
    await page.locator('#btn-keygen').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#keygen-output')).toContainText('Public key');
    await page.locator('#btn-sign').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sign-output')).toContainText('Signature');
    await page.locator('#btn-verify').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#verify-output .badge-pass')).toBeVisible();
  });

  test('every focusable control shows a visible focus indicator', async ({ page }) => {
    await page.goto('.');
    for (const id of ['btn-keygen', 'tab-btn-compare', 'btn-verify-seal']) {
      const outline = await page.locator(`#${id}`).evaluate((el) => {
        el.focus();
        const style = getComputedStyle(el);
        return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
      });
      const visible = outline.outline !== 'none' || outline.shadow !== 'none';
      expect(visible, `${id} must show focus`).toBe(true);
    }
  });
});

test.describe('forced-colors mode', () => {
  test.use({ forcedColors: 'active' });

  test('the page still renders and the demo still works', async ({ page }) => {
    // Windows High Contrast replaces the author's colours wholesale. A page
    // that encodes meaning only in a background colour becomes unreadable.
    await page.goto('.');
    await expect(page.locator('#tabs [role="tab"]')).toHaveCount(5);
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output')).toContainText('Public key');
    await page.locator('#btn-sign').click();
    await page.locator('#btn-verify').click();
    await expect(page.locator('#verify-output .badge-pass')).toBeVisible();
  });

  test('pass and fail verdicts remain distinguishable by TEXT, not colour', async ({ page }) => {
    // WCAG 1.4.1: colour is never the only channel. In forced-colors the
    // author's green and red are gone, so the glyph and the words carry it.
    await page.goto('.');
    await page.locator('#btn-keygen').click();
    await page.locator('#btn-sign').click();
    await page.locator('#btn-verify').click();
    await expect(page.locator('#verify-output')).toContainText('✓ VERIFIED');

    await page.locator('#btn-tamper-sig').click();
    await page.locator('#btn-verify').click();
    await expect(page.locator('#verify-output')).toContainText('✗ FAILED');
  });

  test('fidelity labels still say what they mean', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-2').click();
    // The colour coding is gone; the words must still be there.
    await expect(page.locator('#fidelity-fiat-shamir')).toContainText('Reduced educational model');
    await expect(page.locator('#fidelity-fiat-shamir')).toContainText('not the real signer');
  });

  test('no content is hidden by the forced palette', async ({ page }) => {
    await page.goto('.');
    const invisible = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('#app *'))) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (!own) continue;
        if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
        if (el.closest('[aria-hidden="true"]')) continue;
        if (parseFloat(getComputedStyle(el).opacity) === 0) {
          out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
        }
      }
      return Array.from(new Set(out));
    });
    expect(invisible).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the preference reaches the page', async ({ page }) => {
    await page.goto('.');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true
    );
  });

  test('the Fiat-Shamir loop still renders every attempt, without animating', async ({ page }) => {
    // The reduced-motion block flips the reveal loop from a 650ms cascade to a
    // synchronous render. A block that CANCELLED the animation instead of
    // shortening it would leave the cards at their start state — invisible.
    await page.goto('.');
    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-2').click();
    await page.locator('#fs-run').click();
    await expect(page.locator('#fs-stats')).not.toBeEmpty();
    const cards = page.locator('.fs-attempt');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toBeVisible();
    const opacity = await cards.first().evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);
  });

  test('the spinner does not trap a verdict behind an animation', async ({ page }) => {
    await page.goto('.');
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output')).toContainText('Public key');
    await expect(page.locator('#keygen-output .spinner')).toHaveCount(0);
  });
});

test.describe('discoverability of the assurance material', () => {
  test('the security policy, threat model and limitations are linked from the page', async ({
    page,
  }) => {
    await page.goto('.');
    await page.locator('#tab-btn-about').click();
    const links = page.locator('#assurance-links a');
    await expect(links.first()).toBeVisible();
    const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.some((h) => h.endsWith('/SECURITY.md'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/THREAT-MODEL.md'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/KNOWN-LIMITATIONS.md'))).toBe(true);
    expect(hrefs.some((h) => h.includes('vectors/acvp/SOURCE.md'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/EVIDENCE.md'))).toBe(true);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('rel', /noopener/);
      expect((await link.innerText()).trim().length).toBeGreaterThan(3);
    }
  });

  test('the sources panel is reachable and lists primary documents', async ({ page }) => {
    await page.goto('.');
    // Reachable from the always-visible strip, not only by knowing to open About.
    await expect(page.locator('#standards-strip')).toContainText('Sources');
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('#standards-status')).toBeVisible();
    const body = await page.locator('#tab-content').innerText();
    expect(body).toContain('FIPS 204');
    expect(body).toContain('NIST IR 8547');
  });

  test('the implementation identity is reachable from where keys are made', async ({ page }) => {
    await page.goto('.');
    // A one-line badge on tab 1, linking to the full panel.
    const badge = page.locator('.impl-badge');
    await expect(badge).toBeVisible();
    await expect(badge.locator('a')).toHaveAttribute('href', '#implementation-identity');
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('#implementation-identity')).toBeVisible();
    await expect(page.locator('#limitations')).toBeVisible();
  });

  test('every assurance link would resolve on the published repository', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('#assurance-links a').first()).toBeVisible();
    const hrefs = await page
      .locator('#assurance-links a')
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const href of hrefs) {
      expect(href).toMatch(/^https:\/\/github\.com\/systemslibrarian\/crypto-lab-dilithium-seal/);
    }
  });
});

test.describe('the selection is one value, shared by the whole demo', () => {
  test('survives a trip to another tab and back', async ({ page }) => {
    // It used to be a module-local variable reset on every render: a reader who
    // chose ML-DSA-44, went to Compare and came back landed on ML-DSA-65 again
    // with no explanation.
    await page.goto('.');
    await selectVariant(page, 'ML-DSA-44');
    await page.locator('#tab-btn-compare').click();
    await expect(page.locator('#benchmark-panel')).toBeVisible();
    await page.locator('#tab-btn-sign-verify').click();
    await expect(page.locator('#variant-pills .pill[aria-checked="true"]')).toHaveText('ML-DSA-44');
    // And the values that depend on it came back with it.
    await expect(page.locator('#param-info')).toContainText(EXPECTED['ML-DSA-44'].sig);
    await expect(page.locator('#variant-guidance')).toContainText('category 2');
  });

  test('the benchmark marks the selected set and names it', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('.');
    await selectVariant(page, 'ML-DSA-87');
    await page.locator('#tab-btn-compare').click();
    await page.locator('#btn-benchmark').click();
    await expect(page.locator('#bench-results')).toBeVisible({ timeout: 300_000 });

    // Named in words, not signalled by colour alone (WCAG 1.4.1).
    await expect(page.locator('#bench-selected-note')).toContainText('ML-DSA-87');
    // Three rows — one per operation — marked, and only for that set.
    const marked = page.locator('#bench-results tbody tr.bench-selected');
    await expect(marked).toHaveCount(3);
    for (const row of await marked.all()) {
      expect(await row.locator('th').innerText()).toBe('ML-DSA-87');
    }
    await expect(page.locator('#bench-sizes tbody tr.bench-selected')).toHaveCount(1);
  });

  test('the exported evidence records the selection', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('.');
    await selectVariant(page, 'ML-DSA-44');
    await page.locator('#tab-btn-compare').click();
    await page.locator('#btn-benchmark').click();
    await expect(page.locator('#bench-results')).toBeVisible({ timeout: 300_000 });

    const grab = async (selector: string): Promise<string> => {
      const d = await Promise.all([
        page.waitForEvent('download'),
        page.locator(selector).click(),
      ]).then(([event]) => event);
      const { readFile } = await import('node:fs/promises');
      return readFile((await d.path())!, 'utf8');
    };

    const json = JSON.parse(await grab('#btn-bench-json'));
    expect(json.selectedParameterSet).toBe('ML-DSA-44');
    // Still measures all three — the comparison is the point.
    expect(json.results).toHaveLength(3);

    const csv = await grab('#btn-bench-csv');
    expect(csv.split('\n')[0]).toContain('selectedParameterSet');
    for (const line of csv.trim().split('\n').slice(1)) {
      expect(line).toContain('ML-DSA-44');
    }
  });
});

test.describe('panels load on demand without breaking', () => {
  test('the landing tab needs no second request', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/assets/') && r.url().endsWith('.js')) chunks.push(r.url());
    });
    await page.goto('.');
    // Tab 1 is statically imported precisely so first paint does not wait on a
    // second round trip: exactly one JS request before anything is clicked.
    await expect(page.locator('#btn-keygen')).toBeEnabled();
    expect(chunks).toHaveLength(1);
  });

  test('each other tab fetches its own chunk, once', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/assets/') && r.url().endsWith('.js')) chunks.push(r.url());
    });
    await page.goto('.');
    await expect(page.locator('#btn-keygen')).toBeEnabled();

    await page.locator('#tab-btn-compare').click();
    await expect(page.locator('#benchmark-panel')).toBeVisible();
    const afterFirstVisit = chunks.length;
    expect(afterFirstVisit).toBeGreaterThan(1);

    // Going away and back must not re-fetch: the module is already evaluated.
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('#standards-status')).toBeVisible();
    await page.locator('#tab-btn-compare').click();
    await expect(page.locator('#benchmark-panel')).toBeVisible();
    const revisit = chunks.filter((u) => u.includes('tab2-compare')).length;
    expect(revisit).toBe(1);
  });

  test('a chunk that fails to load says so instead of showing an empty tab', async ({ page }) => {
    await page.goto('.');
    await expect(page.locator('#btn-keygen')).toBeEnabled();
    // Break exactly the About chunk. Silence here would look identical to a
    // tab that simply has nothing in it.
    await page.route('**/assets/tab5-about-*.js', (route) => route.abort());
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('#tab-content')).toContainText('could not be loaded');
    // And the crypto that was already loaded still works.
    await page.locator('#tab-btn-sign-verify').click();
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output')).toContainText('Public key');
  });

  test('switching quickly lands on the tab that was clicked last', async ({ page }) => {
    await page.goto('.');
    await expect(page.locator('#btn-keygen')).toBeEnabled();
    // Two chunks in flight at once; the slower one must not win.
    await page.locator('#tab-btn-compare').click();
    await page.locator('#tab-btn-pqc-trio').click();
    await expect(page.locator('#tab-btn-pqc-trio')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-content')).toContainText('Post-Quantum Cryptography Trio');
    await expect(page.locator('#benchmark-panel')).toHaveCount(0);
  });
});
