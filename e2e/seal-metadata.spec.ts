import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const width of [1280, 380, 320]) {
  test(`normal seal verdict scopes unsigned metadata at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    // Meta-delivered frame-ancestors is a documented browser warning, tested
    // separately by the existing CSP suite; retain that limitation.
    await page.setViewportSize({ width, height: 900 });
    await page.goto('.');
    for (const variant of ['44', '65', '87']) {
      await page.locator('#variant-pills .pill', { hasText: `ML-DSA-${variant}` }).click();
      await page.locator('#btn-keygen').click();
      await expect(page.locator('#btn-seal')).toBeEnabled();
      await page.locator('#doc-input').fill('hello');
      await page.locator('#signer-name').fill('Alice');
      await page.locator('#btn-seal').click();
      await expect(page.locator('#seal-output')).toContainText('Signer label and timestamp are unsigned/unverified');
      await expect(page.locator('#seal-output .badge-pass')).toContainText('CONTENT ONLY');
      const downloading = page.waitForEvent('download');
      await page.locator('#btn-export-seal').click();
      const download = await downloading;
      const doc = JSON.parse(await readFile((await download.path())!, 'utf8'));
      doc.signerLabel = 'Mallory'; doc.timestamp = '1900-01-01';
      await page.locator('#seal-json-input').fill(JSON.stringify(doc));
      await page.locator('#btn-verify-seal').click();
      const output = page.locator('#seal-verify-output');
      await expect(output.locator('.badge-pass')).toHaveText('✓ VERIFIED — CONTENT ONLY');
      await expect(output).toContainText('valid under the included public key');
      await expect(output).toContainText('Signer label and timestamp are unsigned/unverified');
      await expect(output).toContainText('not bound to a trusted identity');
      await expect(output).not.toContainText('Signed by');
      await expect(output).not.toContainText('Mallory');
      await expect(output).not.toContainText('1900-01-01');
      doc.content = 'changed content';
      await page.locator('#seal-json-input').fill(JSON.stringify(doc));
      await page.locator('#btn-verify-seal').click();
      await expect(output.locator('.badge-fail')).toHaveText('✗ FAILED');
      await expect(output.locator('.badge-pass')).toHaveCount(0);
      await expect(output).toContainText('Signer label and timestamp are unsigned/unverified');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('sealing does not paint a success badge when its immediate verification fails', async ({ page }) => {
  await page.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let checks = 0;
    Object.defineProperty(crypto.subtle, 'digest', { value: async (algorithm: AlgorithmIdentifier, bytes: BufferSource) => {
      const result = await digest(algorithm, bytes);
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() === 'SHA-256' && ++checks === 2) {
        // A controlled mismatch between the stored convenience hash and its
        // immediate verification. Signing/ML-DSA verification remain real.
        const changed = new Uint8Array(result); changed[0] ^= 1;
        return changed.buffer;
      }
      return result;
    }});
  });
  await page.goto('.');
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-seal')).toBeEnabled();
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output .badge-fail')).toHaveText('✗ SEAL VERIFICATION FAILED');
  await expect(page.locator('#seal-output .badge-pass')).toHaveCount(0);
  await expect(page.locator('#seal-output')).toContainText('recorded hash or content may have changed');
});
