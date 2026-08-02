import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the NIST KAT vectors;
 * this gates them on accessibility the same way.
 *
 * This lab is a single-page tabbed app: the five tab panels (Sign & Verify,
 * Compare, How It Works, PQC Trio, About) are rendered into #tab-content on
 * demand. There are no native <details>; instead the "How It Works" stepper
 * uses class-toggled bodies (.step.active > .step-body { display:block }), so
 * before scanning we activate every step to reveal all collapsed content. We
 * scan each tab individually, in both dark (default) and light themes.
 * Animations/transitions are neutralized so nothing is scanned mid-transition.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const TAB_IDS = [
  'sign-verify',
  'compare',
  'how-it-works',
  'pqc-trio',
  'about',
] as const;

async function neutralizeMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
}

async function revealCollapsibles(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Future-proof: expand any native <details>.
    for (const details of document.querySelectorAll('details')) {
      (details as HTMLDetailsElement).open = true;
    }
    // "How It Works" stepper: reveal every step body (normally display:none
    // until the step has .active). The disclosure state lives on the step's
    // title <button> (aria-expanded); the body shows via the .active class.
    for (const step of document.querySelectorAll('.step')) {
      step.classList.add('active');
    }
    for (const btn of document.querySelectorAll('.step .step-title')) {
      btn.setAttribute('aria-expanded', 'true');
    }
    // Expand every <details> "show the exact algebra / comparison" block so its
    // math is scanned too.
    for (const d of document.querySelectorAll('.step details')) {
      (d as HTMLDetailsElement).open = true;
    }
  });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

async function scanAllTabs(page: Page): Promise<void> {
  await neutralizeMotion(page);
  for (const id of TAB_IDS) {
    await page.locator(`#tab-btn-${id}`).click();
    await expect(page.locator(`#tab-btn-${id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await revealCollapsibles(page);
    await neutralizeMotion(page);
    await scan(page);
  }
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await scanAllTabs(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await scanAllTabs(page);
});

test('signature tamper is one-way until a fresh signature is created', async ({ page }) => {
  await page.goto('.');
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-sign')).toBeEnabled();
  await page.locator('#btn-sign').click();
  await expect(page.locator('#btn-tamper-sig')).toBeEnabled();
  await page.locator('#btn-tamper-sig').click();
  await expect(page.locator('#btn-tamper-sig')).toBeDisabled();
  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output')).toContainText('FAILED');
});

test('benchmark description defers to measured browser ratios', async ({ page }) => {
  await page.goto('.');
  await page.locator('#tab-btn-compare').click();
  const content = page.locator('#tab-content');
  await expect(content).toContainText('measured Ed25519-to-ML-DSA comparison');
  await expect(content).not.toContainText('typically 10–50× faster');
});
