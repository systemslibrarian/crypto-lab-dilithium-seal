import { expect, test, type Page } from '@playwright/test';

/**
 * Real ML-DSA versus the teaching models, checked on the rendered page.
 *
 * The acceptance criterion is a claim about a reader: "a learner cannot
 * reasonably mistake toy mathematics for the real implementation." That is not
 * directly testable, so it is decomposed into things that are:
 *
 *  - every panel carries a fidelity label;
 *  - the label comes BEFORE the thing it labels, in DOM order, so it is read
 *    first by a screen reader and seen first by everyone else;
 *  - the two reduced models say they are not the signer, in words, and put
 *    their toy parameters beside the real ones;
 *  - no visualization claims a security property it cannot demonstrate.
 *
 * The last one matters because the temptation is real: a rejection-sampling
 * animation looks like evidence about leakage, and it is not.
 */

const openStep = async (page: Page, step: number): Promise<void> => {
  await page.locator('#tab-btn-how-it-works').click();
  await page.locator(`#step-btn-${step}`).click();
  await expect(page.locator(`#step-btn-${step}`)).toHaveAttribute('aria-expanded', 'true');
};

test.describe('every panel declares what it is', () => {
  test('the four labels are defined in one legend', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-how-it-works').click();
    const legend = page.locator('#fidelity-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Real FIPS 204 operation');
    await expect(legend).toContainText('Real values, visualized');
    await expect(legend).toContainText('Reduced educational model');
    await expect(legend).toContainText('Conceptual');
  });

  test('the real operations are labelled as real', async ({ page }) => {
    await page.goto('.');
    for (const id of ['sign-verify', 'seal']) {
      const badge = page.locator(`#fidelity-${id}`);
      await expect(badge, id).toBeVisible();
      await expect(badge, id).toHaveAttribute('data-fidelity', 'operation');
    }
  });

  test('the reduced models are labelled as models, not as operations', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 2);
    await expect(page.locator('#fidelity-fiat-shamir')).toHaveAttribute('data-fidelity', 'model');
    await openStep(page, 4);
    await expect(page.locator('#fidelity-module-lwe')).toHaveAttribute('data-fidelity', 'model');
  });

  test('a label precedes the thing it labels', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 2);
    // DOCUMENT_POSITION_FOLLOWING = 4: the run button comes after the badge.
    const badgeIsFirst = await page.evaluate(() => {
      const badge = document.querySelector('#fidelity-fiat-shamir')!;
      const control = document.querySelector('#fs-run')!;
      return (badge.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(badgeIsFirst, 'the model label must be read before the model').toBe(true);
  });

  test('every tab carries at least one fidelity label', async ({ page }) => {
    await page.goto('.');
    for (const id of ['sign-verify', 'compare', 'how-it-works', 'pqc-trio', 'about']) {
      await page.locator(`#tab-btn-${id}`).click();
      await expect(page.locator('#tab-content')).not.toBeEmpty();
      expect(await page.locator('#tab-content [data-fidelity]').count(), id).toBeGreaterThan(0);
    }
  });
});

test.describe('the Fiat-Shamir model is unmistakably a model', () => {
  test('says outright that it is not the signer', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 2);
    const text = await page.locator('.fs-viz').innerText();
    expect(text).toMatch(/not the signer/i);
    expect(text).toContain('@noble/post-quantum');
    expect(text).toContain('8,380,417');
  });

  test('puts its toy parameters beside the real ones', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 2);
    const table = page.locator('.fs-scale-table');
    await expect(table).toBeVisible();
    const text = await table.innerText();
    // Toy column
    expect(text).toContain('257');
    // Real column — the actual FIPS 204 values, not a second set of invented ones
    expect(text).toContain('8,380,417');
    expect(text).toContain('256');
    expect(text).toContain('(6, 5)');
    expect(text).toContain('524,288');
  });

  test('admits the challenge is sampled rather than hashed', async ({ page }) => {
    // Without this the panel claims to demonstrate Fiat-Shamir, when what it
    // shows is the interactive proof that Fiat-Shamir makes non-interactive.
    await page.goto('.');
    await openStep(page, 2);
    const text = await page.locator('.fs-viz').innerText();
    expect(text).toMatch(/drawn at random rather than hashed/i);
    expect(await page.locator('.fs-scale-table').innerText()).toMatch(/hashing μ ‖ w₁/);
  });

  test('admits what it does not model at all', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 2);
    expect(await page.locator('.fs-scale-table').innerText()).toMatch(/not modelled/i);
  });
});

test.describe('the Module-LWE model is unmistakably a model', () => {
  test('states that its numbers are invented, right beside them', async ({ page }) => {
    // This panel previously carried NO caveat at all. It opened "ML-DSA's
    // public key is t = A·s + e" and then showed nine small numbers.
    await page.goto('.');
    await openStep(page, 4);
    const text = await page.locator('.mlwe-viz').innerText();
    expect(text).toMatch(/invented for legibility/i);
    expect(text).toContain('97');
    expect(text).toContain('8,380,417');
    expect(text).toMatch(/hand-picked secret/i);
  });

  test('gives the real scale so the gap is a number, not an adjective', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 4);
    const text = await page.locator('.mlwe-viz').innerText();
    expect(text).toContain('6×5');
    expect(text).toContain('7,680');
    expect(text).toMatch(/rather than three/i);
  });

  test('does not present the toy system as evidence about real hardness', async ({ page }) => {
    await page.goto('.');
    await openStep(page, 4);
    const text = await page.locator('.mlwe-viz').innerText();
    expect(text).toMatch(/nothing here is evidence about the real problem/i);
  });
});

test.describe('no visualization claims a property it cannot show', () => {
  test('nothing in the visualizations claims constant-time or leakage resistance', async ({
    page,
  }) => {
    await page.goto('.');
    for (const step of [2, 4]) {
      await openStep(page, step);
      const text = await page.locator('#tab-content').innerText();
      expect(text, `step ${step}`).not.toMatch(/constant[- ]time/i);
      expect(text, `step ${step}`).not.toMatch(/leak(age)?[- ]resistan/i);
      expect(text, `step ${step}`).not.toMatch(/side[- ]channel (safe|proof|resistant)/i);
    }
  });

  test('the abort loop is described as leak PREVENTION by design, not as measured proof', async ({
    page,
  }) => {
    await page.goto('.');
    await openStep(page, 2);
    const text = await page.locator('.fs-viz').innerText();
    // It is legitimate to say an oversized z would leak — that is the rule's
    // purpose. It is not legitimate to imply the animation demonstrates the
    // real implementation's side-channel posture.
    expect(text).toMatch(/leak/i);
    expect(text).not.toMatch(/proves|demonstrates that the (implementation|signer) is/i);
  });
});

test.describe('the parameter table is complete and real', () => {
  test('carries every FIPS 204 parameter, not just the sizes', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-about').click();
    const table = page.locator('#fips204-parameter-table');
    await expect(table).toBeVisible();
    const text = await table.innerText();
    for (const needle of [
      'Ring dimension',
      'Modulus',
      'Module dimensions',
      'Private-key coefficient range',
      'Challenge weight',
      'Collision strength',
      'Mask coefficient range',
      'Low-order rounding range',
      'Rejection shift bound',
      'Rejection bound on z',
      'Maximum 1s in the hint',
      'NIST security category',
    ]) {
      expect(text, needle).toContain(needle);
    }
  });

  test('prints the exact FIPS 204 values for each set', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-about').click();
    const text = await page.locator('#fips204-parameter-table').innerText();
    // Table 1: τ, η, ω and λ across the three sets.
    expect(text).toContain('8,380,417');
    expect(text).toContain('1753');
    expect(text).toContain('(4, 4)');
    expect(text).toContain('(6, 5)');
    expect(text).toContain('(8, 7)');
    expect(text).toContain('2¹⁷ = 131,072');
    expect(text).toContain('2¹⁹ = 524,288');
    expect(text).toContain('(q−1)/88 = 95,232');
    expect(text).toContain('(q−1)/32 = 261,888');
    // Table 2 sizes.
    for (const size of ['1,312', '1,952', '2,592', '2,560', '4,032', '4,896', '2,420', '3,309', '4,627']) {
      expect(text, size).toContain(size);
    }
  });

  test('shows the errata correction beside the published repetitions', async ({ page }) => {
    await page.goto('.');
    await page.locator('#tab-btn-about').click();
    const text = await page.locator('#fips204-parameter-table').innerText();
    expect(text).toContain('4.25');
    expect(text).toContain('errata: 4.36');
    expect(text).toContain('5.1');
    expect(text).toContain('errata: 5.14');
    expect(text).toContain('3.85');
    expect(text).toContain('errata: 3.91');
  });
});
