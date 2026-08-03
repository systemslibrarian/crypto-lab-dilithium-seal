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
  /** The (k, ℓ) module dimensions column. */
  k: number;
  l: number;
  q: number;
}

/** FIPS 204 Table 1 as the About tab renders it: {'ML-DSA-65': {publicKey, ...}}. */
async function readTable1(page: Page): Promise<Record<Variant, Table1Row>> {
  await page.locator('#tab-btn-about').click();
  await expect(page.locator('#tab-content')).toContainText('FIPS 204 Table 1');
  const rows = await page
    .locator('#tab-content table tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => ({
        name: (tr.querySelector('th') as HTMLElement).innerText.trim(),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
      })),
    );
  const table = {} as Record<Variant, Table1Row>;
  for (const row of rows) {
    // "(6, 5)" → k = 6, ℓ = 5.
    const dims = row.cells[4].match(/-?\d+/g)!.map(Number);
    table[row.name as Variant] = {
      category: num(row.cells[0]),
      publicKey: num(row.cells[1]),
      privateKey: num(row.cells[2]),
      signature: num(row.cells[3]),
      k: dims[0],
      l: dims[1],
      q: num(row.cells[5]),
    };
  }
  for (const variant of VARIANTS) expect(table[variant], `Table 1 row for ${variant}`).toBeTruthy();
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

test('FIPS 204 Table 1 is internally consistent with its own dimensions column', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('.');
  const table1 = await readTable1(page);

  // The About tab prints "q = 2²³ − 2¹³ + 1" beneath the table; the q column
  // must be that number.
  const expectedQ = 2 ** 23 - 2 ** 13 + 1;
  await expect(page.locator('#tab-content')).toContainText('q = 2²³ − 2¹³ + 1');
  for (const variant of VARIANTS) {
    expect(table1[variant].q, `${variant} modulus q`).toBe(expectedQ);
    // FIPS 204: pk = 32-byte seed ρ + k packed t₁ polynomials at 320 B each.
    // The public key column must follow from the (k, ℓ) column in the same row.
    expect(
      table1[variant].publicKey,
      `${variant}: public key must be 32 + k·320 for the k its own row prints`,
    ).toBe(32 + table1[variant].k * 320);
  }

  // Sizes and security categories must rise together across the three sets —
  // the page's whole "parameter-set tradeoff" story.
  for (const [smaller, larger] of [
    ['ML-DSA-44', 'ML-DSA-65'],
    ['ML-DSA-65', 'ML-DSA-87'],
  ] as const) {
    for (const field of ['category', 'publicKey', 'privateKey', 'signature', 'k', 'l'] as const) {
      expect(
        table1[larger][field],
        `${field} must increase from ${smaller} to ${larger}`,
      ).toBeGreaterThan(table1[smaller][field]);
    }
  }
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

test('benchmark results are internally consistent: relative column and Ed25519 ratios', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');
  await page.locator('#tab-btn-compare').click();
  await page.locator('#btn-benchmark').click();
  await expect(page.locator('#bench-output table')).toBeVisible({ timeout: 240_000 });
  await expect(page.locator('#btn-benchmark')).toBeEnabled({ timeout: 240_000 });

  const rows = await page.locator('#bench-output tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({
      name: (tr.querySelector('th') as HTMLElement).innerText.trim(),
      ops: (tr.querySelectorAll('td')[0] as HTMLElement).innerText.trim(),
      relative: (tr.querySelectorAll('td')[1] as HTMLElement).innerText.trim(),
    })),
  );
  expect(rows.map((row) => row.name)).toEqual([...VARIANTS, 'Ed25519']);

  const measured = rows.filter((row) => !row.ops.startsWith('N/A'));
  // All three ML-DSA variants must have produced a real measurement.
  expect(measured.length).toBeGreaterThanOrEqual(3);
  const opsByName = new Map(measured.map((row) => [row.name, num(row.ops)]));
  for (const value of opsByName.values()) expect(value).toBeGreaterThan(0);

  const max = Math.max(...opsByName.values());
  for (const row of measured) {
    const expected = `${((num(row.ops) / max) * 100).toFixed(0)}%`;
    expect(row.relative, `${row.name} relative column`).toBe(expected);
  }
  expect(measured.filter((row) => row.relative === '100%')).toHaveLength(1);
  for (const row of rows) {
    if (row.ops.startsWith('N/A')) expect(row.relative).toBe('—');
  }

  const summary = await page.locator('#bench-output p').innerText();
  const ed25519 = opsByName.get('Ed25519');
  if (ed25519 === undefined) {
    expect(summary).toContain('did not provide Ed25519 signing');
  } else {
    expect(summary).toContain('Measured Ed25519 throughput ratio');
    for (const variant of VARIANTS) {
      const stated = num(summary.match(new RegExp(`${variant}: ([\\d.]+)×`))![1]);
      const derived = ed25519 / opsByName.get(variant)!;
      // Within 1% of the ratio implied by the two ops/sec cells the page printed
      // (the cells are rounded to one decimal, the ratio is not).
      expect(
        Math.abs(stated - derived) / derived,
        `${variant} ratio ${stated}× vs ops/sec-implied ${derived.toFixed(2)}×`,
      ).toBeLessThan(0.01);
    }
  }
  expect(errors).toEqual([]);
});

// ───────────────────── how it works: live visualizations ───────────────────

test.describe('interactive visualizations', () => {
  // Reduced motion makes the Fiat-Shamir reveal synchronous, so the assertions
  // see the full run instead of racing a 650 ms-per-attempt animation.
  //
  // This MUST be page.emulateMedia, not test.use({ reducedMotion: 'reduce' }).
  // On Playwright 1.61.1 the test.use form silently never reaches the page —
  // matchMedia('(prefers-reduced-motion: reduce)') still reports false — so the
  // animation kept running at full speed and these assertions were racing it,
  // passing only on the generous timeouts below. emulateMedia persists across
  // navigation, so setting it here covers each test's own goto.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  // Guards the mechanism itself: an emulation that quietly no-ops is worse than
  // none, because the comment above reads as if it were handled.
  test('reduced-motion emulation actually reaches the page', async ({ page }) => {
    await page.goto('.');
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'reduced-motion emulation did not reach the page',
    ).toBe(true);
  });

  test('the Fiat-Shamir loop rejects exactly the responses its own rule rejects', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchForPageErrors(page);
    await page.goto('.');
    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-2').click();

    const scale = await page.locator('.fs-scale').innerText();
    const bound = num(scale.match(/reject bound γ₁−β=(\d+)/)![1]);
    const gamma1 = num(scale.match(/γ₁=(\d+)/)![1]);
    const beta = num(scale.match(/β=(\d+)/)![1]);
    const coeffs = num(scale.match(/N=(\d+) coeffs/)![1]);
    const tau = num(scale.match(/τ=(\d+)/)![1]);
    const eta = num(scale.match(/η=(\d+)/)![1]);
    // The bound the page prints must be the bound its own parameters imply.
    expect(bound).toBe(gamma1 - beta);
    // The source defines β as "τ·η worst-case shift from c·s₁" — the printed
    // parameters must satisfy that relation, or the reject bound is arbitrary.
    expect(beta, 'β must equal τ·η, the worst-case shift the page claims it bounds').toBe(
      tau * eta,
    );

    await page.locator('#fs-run').click();
    await expect(page.locator('#fs-run')).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator('#fs-stats')).not.toBeEmpty();

    const attempts = await page.locator('.fs-attempt').evaluateAll((cards) =>
      cards.map((card) => ({
        head: (card.querySelector('.fs-attempt-head') as HTMLElement).innerText,
        cells: Array.from(card.querySelectorAll('.fs-cell')).map((cell) =>
          Array.from(cell.querySelectorAll('.coeff-val')).map((v) => Number(v.textContent)),
        ),
        overBars: card.querySelectorAll('.fs-cell:nth-child(3) .coeff-bar.over').length,
      })),
    );
    expect(attempts.length).toBeGreaterThan(0);

    attempts.forEach((attempt, i) => {
      const [y, cs1, z] = attempt.cells;
      expect(y).toHaveLength(coeffs);
      expect(cs1).toHaveLength(coeffs);
      expect(z).toHaveLength(coeffs);
      // The equation the card claims: z = y + c·s₁, coefficient by coefficient.
      expect(z, `attempt ${i + 1}: z = y + c·s₁`).toEqual(y.map((yi, k) => yi + cs1[k]));

      const infNorm = Math.max(...z.map(Math.abs));
      const stated = num(attempt.head.match(/‖z‖∞ = (-?\d+)/)![1]);
      expect(stated, `attempt ${i + 1}: stated ‖z‖∞`).toBe(infNorm);

      const accepted = attempt.head.includes('ACCEPT');
      // Verdict must follow from the number the card just printed.
      expect(accepted, `attempt ${i + 1}: verdict vs ‖z‖∞=${infNorm} and bound ${bound}`).toBe(
        infNorm < bound,
      );
      if (accepted) {
        expect(attempt.head).toContain(`${infNorm} < ${bound}`);
        expect(i, 'only the final attempt may be accepted').toBe(attempts.length - 1);
      } else {
        expect(attempt.head).toContain(`${infNorm} ≥ ${bound}`);
        expect(attempt.head).toContain('would leak s₁');
      }
      // Red "over" bars mark exactly the coefficients at or past the bound.
      expect(attempt.overBars, `attempt ${i + 1}: flagged coefficients`).toBe(
        z.filter((v) => Math.abs(v) >= bound).length,
      );
      // The mask must respect its own stated bound ‖y‖∞ ≤ γ₁.
      expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(gamma1);
      // c has τ entries of ±1 and ‖s₁‖∞ ≤ η, so the secret's contribution can
      // never exceed β = τ·η. If it did, the reject bound γ₁−β would not
      // actually be enough to keep an accepted z from leaking s₁.
      expect(
        Math.max(...cs1.map(Math.abs)),
        `attempt ${i + 1}: ‖c·s₁‖∞ must stay within β=${beta}`,
      ).toBeLessThanOrEqual(beta);
    });

    // The summary's counters must sum to the attempts actually shown.
    const stats = await page.locator('#fs-stats').innerText();
    const rejects = attempts.filter((a) => a.head.includes('REJECT')).length;
    const acceptedRun = attempts[attempts.length - 1].head.includes('ACCEPT');
    if (!acceptedRun) {
      expect(stats).toContain(`${rejects}`);
      expect(stats).toContain('did not produce an accepted response');
      expect(rejects).toBe(attempts.length);
    } else if (rejects === 0) {
      expect(stats).toContain('Accepted on the first try (0 rejects this run)');
      expect(attempts).toHaveLength(1);
    } else {
      expect(stats).toContain(`rejected ${rejects} oversized response`);
      expect(stats).toContain(`then accepted attempt ${attempts.length}`);
      expect(rejects).toBe(attempts.length - 1);
    }

    // A fresh secret clears the run rather than leaving stale attempts on screen.
    await page.locator('#fs-reroll').click();
    await expect(page.locator('.fs-attempt')).toHaveCount(0);
    await expect(page.locator('#fs-stats')).toContainText('Fresh secret s₁ drawn');
    expect(errors).toEqual([]);
  });

  test('the Module-LWE slider flips the verdict, and t = A·s + e holds at every setting', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = watchForPageErrors(page);
    await page.goto('.');
    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-4').click();

    const slider = page.locator('#mlwe-err');
    const readRows = () =>
      page.locator('#mlwe-eq .mlwe-row').evaluateAll((rows) =>
        rows.map((row) => ({
          t: (row.querySelector('.mlwe-t') as HTMLElement).innerText,
          as: (row.querySelector('.mlwe-as') as HTMLElement).innerText,
          e: (row.querySelector('.mlwe-e') as HTMLElement).innerText,
          eClass: (row.querySelector('.mlwe-e') as HTMLElement).className,
        })),
      );

    const q = 97; // the small illustrative modulus the panel works over
    for (const setting of ['0', '1', '2', '3']) {
      await slider.fill(setting);
      await slider.dispatchEvent('input');
      await expect(page.locator('#mlwe-err-out')).toHaveText(setting);

      const rows = await readRows();
      expect(rows).toHaveLength(3);
      rows.forEach((row, i) => {
        const t = rhs(row.t);
        const as = rhs(row.as);
        const e = rhs(row.e);
        // Error magnitude is exactly the slider setting.
        expect(Math.abs(e), `row ${i + 1} |e| at setting ${setting}`).toBe(Number(setting));
        // t is A·s + e reduced mod q — the equation the panel is teaching.
        expect(t, `row ${i + 1}: t = (A·s + e) mod ${q}`).toBe((((as + e) % q) + q) % q);
        expect(row.eClass).toContain(e === 0 ? 'zero' : 'live');
      });

      const verdict = page.locator('#mlwe-verdict');
      if (setting === '0') {
        await expect(verdict).toHaveClass(/solvable/);
        await expect(verdict.locator('.badge-fail')).toHaveText(/NO ERROR → BROKEN/);
        await expect(verdict).toContainText('Gaussian elimination recovers the secret s instantly');
        // With e = 0 every t must equal its A·s exactly — nothing hides s.
        for (const row of rows) expect(rhs(row.t)).toBe(rhs(row.as));
      } else {
        await expect(verdict).toHaveClass(/hard/);
        await expect(verdict.locator('.badge-pass')).toHaveText(/ERROR PRESENT → HARD/);
        await expect(verdict).toContainText('Module-LWE');
        for (const row of rows) expect(rhs(row.t)).not.toBe(rhs(row.as));
      }
    }
    expect(errors).toEqual([]);
  });
});

// ─────────────────────── navigation & educational tabs ─────────────────────

test('the five tabs each render their own panel, one selected at a time', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchForPageErrors(page);
  await page.goto('.');

  const expected: [string, string][] = [
    ['sign-verify', 'ML-DSA Digital Signatures'],
    ['compare', 'ML-DSA vs Classical Signatures'],
    ['how-it-works', 'How ML-DSA Works'],
    ['pqc-trio', 'The NIST Post-Quantum Cryptography Trio'],
    ['about', 'About dilithium-seal'],
  ];
  await expect(page.locator('#tabs [role="tab"]')).toHaveCount(expected.length);

  for (const [id, heading] of expected) {
    await page.locator(`#tab-btn-${id}`).click();
    await expect(page.locator('#tab-content')).toContainText(heading);
    // Exactly one tab is selected, and it is this one.
    await expect(page.locator('#tabs [aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator(`#tab-btn-${id}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-content')).toHaveAttribute('aria-labelledby', `tab-btn-${id}`);
  }
  expect(errors).toEqual([]);
});

test('the How It Works stepper expands exactly one step at a time', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('.');
  await page.locator('#tab-btn-how-it-works').click();

  const titles = [
    'The Two Hard Problems',
    'Key Generation',
    'Signing (Fiat-Shamir with Aborts)',
    'Verification',
    'Why Quantum Computers Fail',
  ];
  await expect(page.locator('.step')).toHaveCount(titles.length);
  // Step 1 is open on arrival so the tab is never a wall of collapsed headers.
  await expect(page.locator('.step.active')).toHaveCount(1);
  await expect(page.locator('#step-btn-0')).toHaveAttribute('aria-expanded', 'true');

  for (const [i, title] of titles.entries()) {
    await page.locator(`#step-btn-${i}`).click();
    await expect(page.locator(`#step-btn-${i}`)).toHaveText(title);
    // The open step, its aria-expanded, and the visible body all agree, and
    // nothing else is left open behind it.
    await expect(page.locator('.step.active')).toHaveCount(1);
    await expect(page.locator('#tabs ~ #tab-content .step[aria-expanded="true"]')).toHaveCount(0);
    await expect(page.locator('[aria-expanded="true"].step-title')).toHaveCount(1);
    await expect(page.locator(`#step-btn-${i}`)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#step-body-${i}`)).toBeVisible();
  }
  // The two interactive steps really do carry their visualizations.
  await page.locator('#step-btn-2').click();
  await expect(page.locator('#mount-fiat-shamir #fs-run')).toBeVisible();
  await page.locator('#step-btn-4').click();
  await expect(page.locator('#mount-module-lwe #mlwe-err')).toBeVisible();
});

test('the PQC Trio tab names all three FIPS standards and marks this one as ML-DSA', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('.');
  await page.locator('#tab-btn-pqc-trio').click();

  const cards = page.locator('.trio-card');
  await expect(cards).toHaveCount(3);
  const trio = await cards.evaluateAll((els) =>
    els.map((el) => ({
      name: (el.querySelector('h3') as HTMLElement).innerText.trim(),
      fips: (el.querySelector('.fips') as HTMLElement).innerText.trim(),
      current: el.classList.contains('current'),
    })),
  );
  expect(trio.map((c) => c.name)).toEqual(['ML-KEM', 'ML-DSA', 'SLH-DSA']);
  expect(trio[0].fips).toContain('FIPS 203');
  expect(trio[1].fips).toContain('FIPS 204');
  expect(trio[2].fips).toContain('FIPS 205');

  // Exactly one card is flagged as "this demo", and it is the ML-DSA one —
  // this lab implements FIPS 204.
  expect(trio.filter((c) => c.current)).toHaveLength(1);
  expect(trio.find((c) => c.current)!.name).toBe('ML-DSA');
  expect(trio.find((c) => c.current)!.fips).toContain('this demo');

  // The About tab's own framing must agree about which standard this is.
  await page.locator('#tab-btn-about').click();
  await expect(page.locator('#tab-content')).toContainText('NIST FIPS 204');
});
