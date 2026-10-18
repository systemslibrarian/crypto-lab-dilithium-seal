import { test, expect } from '@playwright/test';

test('research note is visible without expanding the complexity details', async ({ page }) => {
  await page.goto('./');
  await page.locator('#tab-btn-how-it-works').click();
  await page.locator('#step-btn-4').click();
  const note = page.locator('#msis-research-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('16 October 2026');
  await expect(note).toContainText('model-dependent extrapolation');
  await expect(note).toContainText('not demonstrated production-key recovery');
  await expect(note).toContainText('does not change FIPS 204 security categories');
  await expect(note.locator('a')).toHaveAttribute('href', 'https://eprint.iacr.org/2026/607');
  await page.locator('.step.active details.math-details > summary').click();
  await expect(page.locator('.step.active')).toContainText('category 3');
  await expect(page.locator('.step.active')).toContainText('112, 165 and 229');
});
