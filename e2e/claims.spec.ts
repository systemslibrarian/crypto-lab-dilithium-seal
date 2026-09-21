import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

/**
 * Functional gate for the claims this page makes on screen.
 *
 * The a11y spec proves the page is reachable; this one proves it is HONEST:
 * every verdict badge is checked against a number the page itself computed
 * (rendered byte counts, rendered coefficients, rendered ops/sec), every
 * tamper path is driven to its failure state and made to say why, and every
 * derived statistic is checked for internal consistency rather than presence.
 *
 * Nothing here hardcodes a FIPS 204 constant: sizes are read from the About
 * tab's Table 1 rendering and then required to agree everywhere else, so a
 * table edited in one place and not the others fails the suite.
 */

const VARIANTS = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'] as const;
type Variant = (typeof VARIANTS)[number];

/** Mirror of src/ui/helpers.ts formatBytes — the KB rendering under each pill. */
function formatBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

/** The number to the right of "=" — the labels carry subscripts like "t₁ = 27". */
function rhs(text: string): number {
  return num(text.split('=').pop()!);
}

function num(text: string): number {
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  expect(match, `expected a number in ${JSON.stringify(text)}`).not.toBeNull();
  return Number(match![0]);
}

/** Fail loudly on any uncaught page exception — a stuck spinner used to hide one. */
function watchForPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

interface Table1Row {
  publicKey: number;
  privateKey: number;
  signature: number;
  category: number;
  /** Module dimensions (k, ℓ) of the matrix A. */
  k: number;
  l: number;
  q: number;
  n: number;
  d: number;
  eta: number;
  tau: number;
  lambda: number;
  omega: number;
  beta: number;
  gamma1: number;
  gamma2: number;
  rejectBound: number;
  /** "4.25 (errata: 4.36)" — kept raw so the test can assert both halves. */
  repetitions: string;
}

/**
 * The FIPS 204 parameter table from the About tab, keyed by parameter set.
 *
 * The table is TRANSPOSED relative to the one this suite first read: it now
 * carries nineteen parameters, which only fit as rows, so the three parameter
 * sets are the columns. The previous seven-column layout listed the sizes, the
 * category, (k, ℓ) and q and nothing else — enough to look authoritative and
 * not enough to check anything, since it omitted every parameter that makes
 * ML-DSA the scheme it is.
 */
async function readTable1(page: Page): Promise<Record<Variant, Table1Row>> {
  await page.locator('#tab-btn-about').click();
  await expect(page.locator('#fips204-parameter-table')).toBeVisible();

  const rows = await page
    .locator('#fips204-parameter-table tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => ({
        label: (tr.querySelector('th') as HTMLElement).innerText.trim(),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
      })),
    );

  const cellsFor = (prefix: string): string[] => {
    const row = rows.find((r) => r.label.startsWith(prefix));
    expect(row, `parameter table row starting "${prefix}"`).toBeTruthy();
    expect(row!.cells, `row "${prefix}" must have one column per parameter set`).toHaveLength(3);
    return row!.cells;
  };
  /** Last number in the cell: "2¹⁷ = 131,072" and "(q−1)/88 = 95,232" both end in the value. */
  const value = (cell: string): number => num(cell.match(/[\d,]+(?!.*[\d,])/)![0]);

  const sets: Variant[] = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'];
  const headers = await page
    .locator('#fips204-parameter-table thead th')
    .evaluateAll((ths) => ths.map((th) => (th as HTMLElement).innerText.trim()));
  expect(headers.slice(1), 'parameter table columns').toEqual(sets);

  const table = {} as Record<Variant, Table1Row>;
  sets.forEach((variant, i) => {
    const dims = cellsFor('Module dimensions')[i].match(/-?\d+/g)!.map(Number);
    table[variant] = {
      n: value(cellsFor('Ring dimension')[i]),
      q: value(cellsFor('Modulus')[i]),
      d: value(cellsFor('Dropped bits')[i]),
      k: dims[0],
      l: dims[1],
      eta: value(cellsFor('Private-key coefficient range')[i]),
      tau: value(cellsFor('Challenge weight')[i]),
      lambda: value(cellsFor('Collision strength')[i]),
      gamma1: value(cellsFor('Mask coefficient range')[i]),
      gamma2: value(cellsFor('Low-order rounding range')[i]),
      beta: value(cellsFor('Rejection shift bound')[i]),
      rejectBound: value(cellsFor('Rejection bound on z')[i]),
      omega: value(cellsFor('Maximum 1s in the hint')[i]),
      repetitions: cellsFor('Expected signing repetitions')[i],
      category: value(cellsFor('NIST security category')[i]),
      publicKey: value(cellsFor('Public key (bytes)')[i]),
      privateKey: value(cellsFor('Private key (bytes)')[i]),
      signature: value(cellsFor('Signature (bytes)')[i]),
    };
  });
  return table;
}

async function selectVariant(page: Page, variant: Variant): Promise<void> {
  await page.locator('#variant-pills .pill', { hasText: variant }).click();
  await expect(page.locator('#variant-pills .pill', { hasText: variant })).toHaveAttribute(
    'aria-checked',
    'true',
  );
}

/** The four values under the parameter pills, keyed by their label. */
async function readParamInfo(page: Page): Promise<Record<string, string>> {
  return page.locator('#param-info .info-item').evaluateAll((items) =>
    Object.fromEntries(
      items.map((item) => [
        (item.querySelector('.label') as HTMLElement).innerText.trim(),
        (item.querySelector('.value') as HTMLElement).innerText.trim(),
      ]),
    ),
  );
}

async function keygenAndSign(page: Page): Promise<void> {
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-sign')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#btn-sign').click();
  await expect(page.locator('#sign-output')).toContainText('Signed in', { timeout: 30_000 });
}

// ───────────────────────────── parameter sets ─────────────────────────────

test('FIPS 204 sizes agree across the About table, the Compare table and the parameter pills', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('.');
  const table1 = await readTable1(page);

  // Compare tab's scheme table must carry the same public key / signature sizes.
  await page.locator('#tab-btn-compare').click();
  const compare = await page
    .locator('#tab-content .comparison-table tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => ({
        name: (tr.querySelector('th') as HTMLElement).innerText.trim(),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
      })),
    );
  for (const variant of VARIANTS) {
    const row = compare.find((r) => r.name === variant);
    expect(row, `Compare table row for ${variant}`).toBeTruthy();
    expect(num(row!.cells[0]), `${variant} public key size in Compare`).toBe(table1[variant].publicKey);
    expect(num(row!.cells[1]), `${variant} signature size in Compare`).toBe(table1[variant].signature);
    expect(row!.cells[2], `${variant} must be marked quantum safe`).toBe('Yes');
  }
  // Every classical scheme in the same table must be marked NOT quantum safe.
  for (const name of ['RSA-PSS-2048', 'ECDSA P-256', 'Ed25519']) {
    expect(compare.find((r) => r.name === name)!.cells[2], `${name} quantum safe cell`).toBe('No');
  }

  // The Sign & Verify pills render the same numbers through formatBytes().
  await page.locator('#tab-btn-sign-verify').click();
  for (const variant of VARIANTS) {
    await selectVariant(page, variant);
    const info = await readParamInfo(page);
    expect(info['PUBLIC KEY']).toBe(formatBytes(table1[variant].publicKey));
    expect(info['PRIVATE KEY']).toBe(formatBytes(table1[variant].privateKey));
    expect(info['SIGNATURE']).toBe(formatBytes(table1[variant].signature));
    expect(num(info['SECURITY CAT.'])).toBe(table1[variant].category);
  }
});

// ───────────────────────── sign / verify / tamper ─────────────────────────

for (const variant of VARIANTS) {
  test(`${variant}: keygen and sign render the parameter set's own byte counts, and Verify passes`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchForPageErrors(page);
    await page.goto('.');
    const table1 = await readTable1(page);
    await page.locator('#tab-btn-sign-verify').click();
    await selectVariant(page, variant);

    await page.locator('#btn-keygen').click();
    await expect(page.locator('#btn-sign')).toBeEnabled({ timeout: 30_000 });
    const keygen = await page.locator('#keygen-output').innerText();
    const publicBytes = num(keygen.match(/Public key \(([\d,]+) bytes\)/)![1]);
    const privateBytes = num(keygen.match(/Private key \(([\d,]+) bytes\)/)![1]);
    expect(publicBytes).toBe(table1[variant].publicKey);
    expect(privateBytes).toBe(table1[variant].privateKey);
    // The page's own annotation claims the private key is the larger of the two.
    expect(privateBytes).toBeGreaterThan(publicBytes);
    expect(keygen).toContain('larger than the public key');
    expect(num(keygen.match(/Generated in ([\d.]+) ms/)![1])).toBeGreaterThan(0);

    await page.locator('#btn-sign').click();
    await expect(page.locator('#sign-output')).toContainText('Signed in', { timeout: 30_000 });
    const sign = await page.locator('#sign-output').innerText();
    expect(num(sign.match(/Signature \(([\d,]+) bytes\)/)![1])).toBe(table1[variant].signature);
    expect(num(sign.match(/Signed in ([\d.]+) ms/)![1])).toBeGreaterThan(0);
    // The "prioritizes security over speed" aside is claimed for ML-DSA-87 only.
    expect(
      sign.includes('ML-DSA-87 prioritizes security over speed'),
      `${variant}: the ML-DSA-87 speed aside must appear for -87 and no other set`,
    ).toBe(variant === 'ML-DSA-87');

    await page.locator('#btn-verify').click();
    const verify = page.locator('#verify-output');
    await expect(verify.locator('.badge-pass')).toHaveText(/VERIFIED/);
    await expect(verify).toContainText(`The ${variant} signature is valid`);
    await expect(verify).not.toContainText('FAILED');
    // The verdict reports a real measured duration, not a placeholder.
    expect(num((await verify.innerText()).match(/Verified in ([\d.]+) ms/)![1])).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('a fresh keypair retires the previous run\'s signature and its verdict', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await keygenAndSign(page);
  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output').locator('.badge-pass')).toHaveText(/VERIFIED/);

  // Generating a new keypair drops lastSignature/lastMessage internally. If the
  // panes were left alone, the page would keep displaying "✓ VERIFIED — the
  // signature is valid" for a keypair that has signed nothing, and Verify would
  // early-return on the null signature so the stale pass could never be cleared.
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#keygen-output')).toContainText('Generated in', { timeout: 30_000 });

  await expect(page.locator('#verify-output')).toBeEmpty();
  await expect(page.locator('#sign-output')).toBeEmpty();
  for (const id of ['#btn-verify', '#btn-tamper-msg', '#btn-tamper-sig']) {
    await expect(page.locator(id), `${id} after a fresh keygen`).toBeDisabled();
  }
  // Signing again with the new keypair restores a genuine passing verdict.
  await page.locator('#btn-sign').click();
  await expect(page.locator('#sign-output')).toContainText('Signed in', { timeout: 30_000 });
  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output').locator('.badge-pass')).toHaveText(/VERIFIED/);
  expect(errors).toEqual([]);
});

test('tampering with the message flips Verify to FAILED and names the cause', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await keygenAndSign(page);

  const textarea = page.locator('#message-input');
  const before = await textarea.inputValue();
  await page.locator('#btn-tamper-msg').click();
  const after = await textarea.inputValue();
  // The tamper is a single appended character — the "one flipped bit" claim.
  expect(after.length).toBe(before.length + 1);
  expect(after.startsWith(before)).toBe(true);
  await expect(page.locator('#verify-output')).toContainText('Message tampered');

  await page.locator('#btn-verify').click();
  const verify = page.locator('#verify-output');
  await expect(verify.locator('.badge-fail')).toHaveText(/FAILED/);
  await expect(verify).toContainText('The message or signature has been tampered with');
  await expect(verify).not.toContainText('VERIFIED');

  // Re-signing the edited message must recover a passing verdict.
  await page.locator('#btn-sign').click();
  await expect(page.locator('#sign-output')).toContainText('Signed in', { timeout: 30_000 });
  await page.locator('#btn-verify').click();
  await expect(verify.locator('.badge-pass')).toHaveText(/VERIFIED/);
  expect(errors).toEqual([]);
});

test('tampering with one signature byte flips Verify to FAILED, and re-signing restores it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await keygenAndSign(page);

  await page.locator('#btn-tamper-sig').click();
  await expect(page.locator('#btn-tamper-sig')).toBeDisabled();
  await expect(page.locator('#verify-output')).toContainText('1 byte flipped once');

  await page.locator('#btn-verify').click();
  const verify = page.locator('#verify-output');
  await expect(verify.locator('.badge-fail')).toHaveText(/FAILED/);
  await expect(verify).toContainText('Signature verification failed');

  await page.locator('#btn-sign').click();
  await expect(page.locator('#sign-output')).toContainText('Signed in', { timeout: 30_000 });
  await expect(page.locator('#btn-tamper-sig')).toBeEnabled();
  await page.locator('#btn-verify').click();
  await expect(verify.locator('.badge-pass')).toHaveText(/VERIFIED/);
  expect(errors).toEqual([]);
});

test('switching the parameter set invalidates the keypair instead of crashing Sign', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  const table1 = await readTable1(page);
  await page.locator('#tab-btn-sign-verify').click();

  // Default set is ML-DSA-65: seal and sign with it first.
  await keygenAndSign(page);
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output')).toContainText('SEALED & VERIFIED', { timeout: 30_000 });

  await selectVariant(page, 'ML-DSA-44');
  // An ML-DSA-65 secret key cannot sign under ML-DSA-44, so every dependent
  // control must go back to disabled and say so, rather than throwing.
  for (const id of [
    '#btn-sign',
    '#btn-verify',
    '#btn-tamper-msg',
    '#btn-tamper-sig',
    '#btn-seal',
    '#btn-export-seal',
    '#btn-tamper-seal',
  ]) {
    await expect(page.locator(id), `${id} after parameter-set change`).toBeDisabled();
  }
  await expect(page.locator('#keygen-output')).toContainText('generate a new keypair');
  await expect(page.locator('#sign-output')).toBeEmpty();
  await expect(page.locator('#verify-output')).toBeEmpty();
  await expect(page.locator('#seal-output')).toBeEmpty();

  // A fresh keypair under the new set signs and verifies at the new sizes.
  await keygenAndSign(page);
  const sign = await page.locator('#sign-output').innerText();
  expect(num(sign.match(/Signature \(([\d,]+) bytes\)/)![1])).toBe(table1['ML-DSA-44'].signature);
  await page.locator('#btn-verify').click();
  await expect(page.locator('#verify-output').locator('.badge-pass')).toHaveText(/VERIFIED/);
  expect(errors).toEqual([]);
});

// ──────────────────────────── document sealing ────────────────────────────

test('sealing produces a package whose hash, key and signature sizes all check out', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  const table1 = await readTable1(page);
  await page.locator('#tab-btn-sign-verify').click();

  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-seal')).toBeEnabled({ timeout: 30_000 });
  const signer = 'Regression Signer';
  await page.locator('#signer-name').fill(signer);
  await page.locator('#btn-seal').click();
  const seal = page.locator('#seal-output');
  await expect(seal).toContainText('SEALED & VERIFIED', { timeout: 30_000 });
  await expect(seal.locator('.badge-pass')).toHaveText(/SEALED & VERIFIED/);
  await expect(seal).toContainText(`Signed by "${signer}"`);
  await expect(seal).toContainText('ML-DSA-65 signature is valid');

  const sealedText = await seal.innerText();
  const renderedHash = sealedText.match(/\b[0-9a-f]{64}\b/)![0];
  expect(num(sealedText.match(/Signature \(([\d,]+) bytes, truncated\)/)![1])).toBe(
    table1['ML-DSA-65'].signature,
  );

  // Export the package and check it against the rendering, byte for byte.
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-seal').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sealed-document-ml-dsa-65.json');
  const path = await download.path();
  const doc = JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8'));

  const docText = await page.locator('#doc-input').inputValue();
  expect(doc.content).toBe(docText);
  expect(doc.contentHash).toBe(renderedHash);
  expect(doc.contentHash).toBe(createHash('sha256').update(doc.content, 'utf8').digest('hex'));
  expect(Buffer.from(doc.signature, 'base64').length).toBe(table1['ML-DSA-65'].signature);
  expect(Buffer.from(doc.publicKey, 'base64').length).toBe(table1['ML-DSA-65'].publicKey);
  expect(doc.variant).toBe('ml-dsa-65');
  expect(doc.signerLabel).toBe(signer);
  expect(doc.version).toBe('dilithium-seal-v1');
  expect(Date.parse(doc.timestamp)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Tamper & Verify isolates the signature: the hash can be faked, the signature cannot', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-seal')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output')).toContainText('SEALED & VERIFIED', { timeout: 30_000 });

  await page.locator('#btn-tamper-seal').click();
  const lesson = page.locator('.tamper-lesson');
  await expect(lesson).toContainText('Lesson 2', { timeout: 30_000 });

  // Lesson 1: hash recomputed so it passes; the ML-DSA signature still fails.
  const lessonText = await lesson.innerText();
  const [lesson1, lesson2] = lessonText.split('Lesson 2');
  expect(lesson1).toContain('✓ passes — but it was just recomputed');
  expect(lesson1).toContain('✗ FAILS — this is what actually detects the tamper');
  expect(lesson1).not.toContain('✓ FAILS');
  // The overall verdict badge must be the failing one — a "TAMPER DETECTED"
  // headline sitting on a badge-pass would be the verdict contradicting itself.
  await expect(lesson.locator('.badge')).toHaveClass(/badge-fail/);
  await expect(lesson.locator('.badge')).toHaveText(/TAMPER DETECTED BY SIGNATURE/);

  // Lesson 2: stale hash left alone, so both signals fire.
  expect(lesson2).toContain('✗ FAILED (quick local check)');
  expect(lesson2).toContain('✗ FAILED (proves authenticity)');
  expect(lesson2).not.toContain('✓ FAILED');
  expect(lesson2).toContain('The signature — not the hash — is what proves authenticity');
  expect(errors).toEqual([]);
});

test('the seal verifier reaches every failure state it can report', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-seal')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output')).toContainText('SEALED & VERIFIED', { timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-seal').click();
  const download = await downloadPromise;
  const good = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );

  const input = page.locator('#seal-json-input');
  const output = page.locator('#seal-verify-output');
  const verifyJSON = async (text: string) => {
    await input.fill(text);
    await page.locator('#btn-verify-seal').click();
  };

  // 1. Empty input — a prompt, not a verdict.
  await input.fill('');
  await page.locator('#btn-verify-seal').click();
  await expect(output).toContainText('Please paste a sealed document JSON');
  await expect(output.locator('.badge')).toHaveCount(0);

  // 2. Malformed JSON.
  await verifyJSON('{not json');
  await expect(output).toContainText('Invalid JSON format');
  await expect(output.locator('.badge')).toHaveCount(0);

  // 3. The untouched export verifies.
  await verifyJSON(JSON.stringify(good));
  await expect(output.locator('.badge-pass')).toHaveText(/VERIFIED/, { timeout: 30_000 });
  await expect(output).toContainText('Content intact: yes | Signature valid: yes');

  // 4. Edited content, stale hash: both checks fail and the text says both.
  await verifyJSON(JSON.stringify({ ...good, content: `${good.content} EDITED` }));
  await expect(output.locator('.badge-fail')).toHaveText(/FAILED/, { timeout: 30_000 });
  await expect(output).toContainText('content hash mismatch AND signature verification failed');
  await expect(output).toContainText('Content intact: no | Signature valid: no');

  // 5. Content and hash both rewritten: the hash agrees, the signature does not.
  const edited = `${good.content} EDITED`;
  await verifyJSON(
    JSON.stringify({
      ...good,
      content: edited,
      contentHash: createHash('sha256').update(edited, 'utf8').digest('hex'),
    }),
  );
  await expect(output.locator('.badge-fail')).toHaveText(/FAILED/, { timeout: 30_000 });
  await expect(output).toContainText('Signature verification failed');
  await expect(output).toContainText('Content intact: yes | Signature valid: no');

  // 6. One flipped signature byte, everything else untouched.
  const sig = Buffer.from(good.signature, 'base64');
  sig[10] ^= 0xff;
  await verifyJSON(JSON.stringify({ ...good, signature: sig.toString('base64') }));
  await expect(output.locator('.badge-fail')).toHaveText(/FAILED/, { timeout: 30_000 });
  await expect(output).toContainText('Content intact: yes | Signature valid: no');

  // 7. Wrong public key — a valid key, but not the signer's.
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#keygen-output')).toContainText('Generated in', { timeout: 30_000 });
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output')).toContainText('SEALED & VERIFIED', { timeout: 30_000 });
  const secondDownload = page.waitForEvent('download');
  await page.locator('#btn-export-seal').click();
  const other = JSON.parse(
    await (await import('node:fs/promises')).readFile(await (await secondDownload).path(), 'utf8'),
  );
  expect(other.publicKey).not.toBe(good.publicKey);
  await verifyJSON(JSON.stringify({ ...good, publicKey: other.publicKey }));
  await expect(output.locator('.badge-fail')).toHaveText(/FAILED/, { timeout: 30_000 });
  await expect(output).toContainText('Content intact: yes | Signature valid: no');

  // 8. Missing required fields.
  const { signature: _dropped, ...incomplete } = good;
  await verifyJSON(JSON.stringify(incomplete));
  await expect(output.locator('.badge-fail')).toHaveText(/FAILED/, { timeout: 30_000 });
  await expect(output).toContainText('missing required fields');

  // 9. Undecodable signature: the decode guard reports an abort, not an
  //    unhandled throw and not a pass.
  await verifyJSON(JSON.stringify({ ...good, signature: 'not-base64-@@@' }));
  await expect(output.locator('.badge-fail')).toHaveText(/FAILED/, { timeout: 30_000 });
  await expect(output).toContainText('Verification aborted');
  expect(errors).toEqual([]);
});

test('every seal verdict agrees with the two signals printed beneath it', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await page.locator('#btn-keygen').click();
  await expect(page.locator('#btn-seal')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#btn-seal').click();
  await expect(page.locator('#seal-output')).toContainText('SEALED & VERIFIED', { timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-seal').click();
  const good = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      await (await downloadPromise).path(),
      'utf8',
    ),
  );

  const edited = `${good.content} EDITED`;
  const rehashed = createHash('sha256').update(edited, 'utf8').digest('hex');
  const flipped = Buffer.from(good.signature, 'base64');
  flipped[10] ^= 0xff;

  const cases: { label: string; doc: Record<string, unknown> }[] = [
    { label: 'untouched export', doc: good },
    { label: 'edited content, stale hash', doc: { ...good, content: edited } },
    { label: 'edited content, rehashed', doc: { ...good, content: edited, contentHash: rehashed } },
    { label: 'flipped signature byte', doc: { ...good, signature: flipped.toString('base64') } },
    { label: 'hash alone corrupted', doc: { ...good, contentHash: 'ff'.repeat(32) } },
  ];

  const output = page.locator('#seal-verify-output');
  for (const { label, doc } of cases) {
    await page.locator('#seal-json-input').fill(JSON.stringify(doc));
    await page.locator('#btn-verify-seal').click();
    await expect(output.locator('.badge')).toHaveCount(1, { timeout: 30_000 });

    const text = await output.innerText();
    const signals = text.match(/Content intact: (yes|no) \| Signature valid: (yes|no)/)!;
    const contentIntact = signals[1] === 'yes';
    const signatureValid = signals[2] === 'yes';
    const passed = (await output.locator('.badge-pass').count()) === 1;

    // The headline badge is exactly the conjunction of the two signals it sits
    // above — a VERIFIED badge over a "Signature valid: no" would be the page
    // contradicting itself.
    expect(passed, `${label}: badge must be the AND of its own two signals`).toBe(
      contentIntact && signatureValid,
    );
    // ...and the prose must name whichever check actually failed.
    if (!contentIntact && !signatureValid) {
      expect(text, label).toContain('content hash mismatch AND signature verification failed');
    } else if (!contentIntact) {
      expect(text, label).toContain('Content integrity check failed');
    } else if (!signatureValid) {
      expect(text, label).toContain('Signature verification failed');
    } else {
      expect(text, label).toContain('Document integrity verified');
    }
  }
  expect(errors).toEqual([]);
});

test('the FIPS 204 parameter table is internally consistent with its own parameters', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('.');
  const table = await readTable1(page);

  const expectedQ = 2 ** 23 - 2 ** 13 + 1;
  await expect(page.locator('#tab-content')).toContainText('q = 2²³ − 2¹³ + 1');

  for (const variant of VARIANTS) {
    const row = table[variant];
    expect(row.q, `${variant} modulus q`).toBe(expectedQ);
    expect(row.n, `${variant} ring dimension`).toBe(256);
    expect(row.d, `${variant} dropped bits d`).toBe(13);

    // Each of these makes one printed value follow from others in the same
    // column, so a single mistyped parameter breaks at least one of them.

    // FIPS 204: pk = 32-byte seed ρ + k packed t₁ polynomials of 32·(bitlen(q−1)−d) bytes.
    expect(row.publicKey, `${variant} pk = 32 + 32·k·(bitlen(q−1) − d)`).toBe(
      32 + 32 * row.k * (row.q.toString(2).length - row.d),
    );
    // sk = ρ + K + tr + packed s₁, s₂ and t₀.
    const bitlen = (x: number): number => x.toString(2).length;
    expect(row.privateKey, `${variant} sk from its own η, k and ℓ`).toBe(
      32 + 32 + 64 + 32 * ((row.l + row.k) * bitlen(2 * row.eta) + row.d * row.k),
    );
    // σ = c̃ (λ/4 bytes) + packed z + hint (ω + k bytes).
    expect(row.signature, `${variant} σ from its own λ, ℓ, γ₁, ω and k`).toBe(
      row.lambda / 4 + row.l * 32 * (1 + bitlen(row.gamma1 - 1)) + row.omega + row.k,
    );
    // β is defined as τ·η, and the rejection bound as γ₁ − β.
    expect(row.beta, `${variant}: β must equal τ·η`).toBe(row.tau * row.eta);
    expect(row.rejectBound, `${variant}: the printed bound must be γ₁ − β`).toBe(
      row.gamma1 - row.beta,
    );
    // γ₂ is a stated fraction of q−1: (q−1)/88 for ML-DSA-44, (q−1)/32 otherwise.
    expect(row.gamma2, `${variant} γ₂ divides q−1`).toBe(
      (row.q - 1) / (variant === 'ML-DSA-44' ? 88 : 32),
    );

    // The repetitions row must show BOTH the published figure and the pending
    // erratum — either alone misleads in one direction.
    expect(row.repetitions, `${variant} repetitions`).toMatch(/^[\d.]+ \(errata: [\d.]+\)$/);
  }

  // Sizes and security categories rise together across the three sets — the
  // page's whole "parameter-set tradeoff" story.
  for (const [smaller, larger] of [
    ['ML-DSA-44', 'ML-DSA-65'],
    ['ML-DSA-65', 'ML-DSA-87'],
  ] as const) {
    for (const field of ['category', 'publicKey', 'privateKey', 'signature', 'k', 'l'] as const) {
      expect(
        table[larger][field],
        `${field} must increase from ${smaller} to ${larger}`,
      ).toBeGreaterThan(table[smaller][field]);
    }
  }

  // λ, the collision strength of c̃, is what fixes |c̃| and rises with the category.
  expect(table['ML-DSA-44'].lambda).toBe(128);
  expect(table['ML-DSA-65'].lambda).toBe(192);
  expect(table['ML-DSA-87'].lambda).toBe(256);
});

for (const variant of VARIANTS) {
  test(`${variant}: the exported seal is bound to the selected parameter set`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForPageErrors(page);
    await page.goto('.');
    const table1 = await readTable1(page);
    await page.locator('#tab-btn-sign-verify').click();
    await selectVariant(page, variant);

    await page.locator('#btn-keygen').click();
    await expect(page.locator('#btn-seal')).toBeEnabled({ timeout: 30_000 });
    await page.locator('#btn-seal').click();
    await expect(page.locator('#seal-output')).toContainText('SEALED & VERIFIED', {
      timeout: 30_000,
    });
    await expect(page.locator('#seal-output')).toContainText(`${variant} signature is valid`);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-seal').click();
    const download = await downloadPromise;
    const slug = variant.toLowerCase();
    expect(download.suggestedFilename()).toBe(`sealed-document-${slug}.json`);

    const doc = JSON.parse(
      await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
    );
    expect(doc.variant).toBe(slug);
    // The artifact sizes must be this parameter set's, not the default's.
    expect(Buffer.from(doc.signature, 'base64').length).toBe(table1[variant].signature);
    expect(Buffer.from(doc.publicKey, 'base64').length).toBe(table1[variant].publicKey);
    expect(doc.contentHash).toBe(createHash('sha256').update(doc.content, 'utf8').digest('hex'));

    // Round-trip it through the page's own verifier.
    await page.locator('#seal-json-input').fill(JSON.stringify(doc));
    await page.locator('#btn-verify-seal').click();
    await expect(page.locator('#seal-verify-output').locator('.badge-pass')).toHaveText(/VERIFIED/, {
      timeout: 30_000,
    });
    await expect(page.locator('#seal-verify-output')).toContainText(
      'Content intact: yes | Signature valid: yes',
    );
    expect(errors).toEqual([]);
  });
}

// ───────────────────────────── compare / benchmark ─────────────────────────

test('the size bar charts encode the same numbers as the comparison table', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('.');
  await page.locator('#tab-btn-compare').click();

  const table = await page
    .locator('#tab-content .comparison-table tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => ({
        name: (tr.querySelector('th') as HTMLElement).innerText.trim(),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
      })),
    );

  for (const [chartId, column] of [
    ['#pk-bars', 0],
    ['#sig-bars', 1],
  ] as const) {
    const bars = await page.locator(`${chartId} .bar-row`).evaluateAll((rows) =>
      rows.map((row) => ({
        label: row.getAttribute('aria-label') ?? '',
        width: (row.querySelector('.bar-fill') as HTMLElement).style.width,
        value: (row.querySelector('.bar-value') as HTMLElement).textContent ?? '',
      })),
    );
    expect(bars).toHaveLength(table.length);
    const values = bars.map((bar) => num(bar.value));
    const max = Math.max(...values);
    expect(max).toBeGreaterThan(0);

    bars.forEach((bar, i) => {
      const scheme = table[i];
      expect(bar.label.startsWith(`${scheme.name}: `), `${chartId} row ${i} label`).toBe(true);
      // Bar label, bar value and table cell must all be the same number.
      // (Split on the colon first: scheme names contain digits of their own.)
      expect(num(bar.label.split(': ')[1])).toBe(num(scheme.cells[column]));
      expect(values[i]).toBe(num(scheme.cells[column]));
      // Width is proportional to the value, with a 3% floor so tiny bars stay visible.
      const expected = Math.max((values[i] / max) * 100, 3);
      expect(num(bar.width), `${chartId} ${scheme.name} width`).toBeCloseTo(expected, 3);
    });
    // Exactly one bar is full width, and it is the largest value.
    const full = bars.filter((bar) => num(bar.width) === 100);
    expect(full).toHaveLength(1);
    expect(num(full[0].value)).toBe(max);
  }
});

test('every derived benchmark figure follows from the measurements printed beside it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await page.locator('#tab-btn-compare').click();
  await page.locator('#btn-benchmark').click();
  await expect(page.locator('#bench-results')).toBeVisible({ timeout: 240_000 });
  await expect(page.locator('#btn-benchmark')).toBeEnabled({ timeout: 240_000 });

  // The medians the page printed, keyed "ML-DSA-65 sign".
  const medians = new Map(
    (
      await page.locator('#bench-results tbody tr').evaluateAll((trs) =>
        trs.map((tr) => {
          const cells = Array.from(tr.querySelectorAll('td')).map((td) =>
            (td as HTMLElement).innerText.trim(),
          );
          return { set: (tr.querySelector('th') as HTMLElement).innerText.trim(), cells };
        }),
      )
    ).map((row) => [`${row.set} ${row.cells[0]}`, Number(row.cells[1])]),
  );
  expect(medians.size).toBe(9);

  const baselineMissing = await page.locator('#bench-baseline-unavailable').count();
  if (baselineMissing > 0) {
    // The page must say it did not measure, rather than print a ratio anyway.
    await expect(page.locator('#bench-baseline-unavailable')).toContainText('No comparison');
    expect(await page.locator('#bench-baseline').count()).toBe(0);
    expect(errors).toEqual([]);
    return;
  }

  // Ed25519's own median, from the same run — or the page's statement that the
  // clock could not resolve it. Both are acceptable; silently printing 0.000
  // and dividing by it is not.
  const summary = await page.locator('#bench-baseline-summary').innerText();
  const exact = summary.match(/median sign ([\d.]+) ms/);
  const unresolvable = /faster than this browser's clock can resolve/i.test(summary);
  expect(
    Boolean(exact) || unresolvable,
    `baseline summary must state a median or say why it cannot: ${summary}`,
  ).toBe(true);

  // Every ratio cell must be the quotient of two medians the page printed.
  const ratios = await page.locator('#bench-baseline tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({
      set: (tr.querySelector('th') as HTMLElement).innerText.trim(),
      cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
    })),
  );
  expect(ratios.map((r) => r.set)).toEqual([...VARIANTS]);

  for (const row of ratios) {
    const sizes = await page.locator('#bench-sizes tbody tr').evaluateAll((trs) =>
      Object.fromEntries(
        trs.map((tr) => [
          (tr.querySelector('th') as HTMLElement).innerText.trim(),
          Array.from(tr.querySelectorAll('td')).map((td) =>
            Number((td as HTMLElement).innerText.replace(/,/g, '')),
          ),
        ]),
      ),
    );
    // Size ratios are exact arithmetic on numbers printed in the same panel.
    expect(Number(row.cells[3].replace(/[×>\s]/g, ''))).toBe(Math.round(sizes[row.set][0] / 32));
    expect(Number(row.cells[4].replace(/[×>\s]/g, ''))).toBe(Math.round(sizes[row.set][2] / 64));

    const signCell = row.cells[1];
    if (unresolvable) {
      // A lower bound, marked as one. Never a bare number derived from zero.
      expect(signCell, `${row.set} sign ratio`).toMatch(/^>\s*\d+×$/);
    } else {
      const signRatio = Number(signCell.replace('×', ''));
      const derived = medians.get(`${row.set} sign`)! / Number(exact![1]);
      expect(
        Math.abs(signRatio - derived),
        `${row.set} sign ratio ${signCell} vs medians-implied ${derived.toFixed(2)}×`,
      ).toBeLessThanOrEqual(0.05 + derived * 0.01);
    }
  }
  expect(errors).toEqual([]);
});

test('the Compare tab never states an unmeasured speed ratio', async ({ page }) => {
  await page.goto('.');
  await page.locator('#tab-btn-compare').click();
  const content = page.locator('#tab-content');

  // This page once carried the fixed claim "typically 10-50x faster", which is
  // an assertion about hardware it cannot see. The standing copy defers to the
  // benchmark the reader can run on this page instead, and this is the guard
  // that keeps it that way. (Moved here from the a11y spec, which had no
  // business holding a claims assertion.)
  await expect(content).toContainText('measured Ed25519-to-ML-DSA comparison');
  await expect(content).not.toContainText('typically 10–50× faster');
  await expect(content).not.toContainText(/\d+\s*[–-]\s*\d+×\s*faster/);
});
