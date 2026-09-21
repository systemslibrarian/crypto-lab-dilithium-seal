import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * Content-Security-Policy and network-isolation gate.
 *
 * Three separate claims are checked here, because passing any one of them alone
 * proves very little:
 *
 *  1. THE POLICY SAYS WHAT WE SAY IT SAYS. A directive list asserted exactly,
 *     not by substring — so a future `'unsafe-inline'` bolted on to make a build
 *     pass fails here as well as in `build/csp.ts`.
 *  2. THE POLICY IS ENFORCED. A policy can be present and inert: a malformed
 *     directive makes the browser drop it, and a hash that no longer matches
 *     blocks the page rather than an attacker. So the gate injects a remote
 *     script and an inline script and requires the browser to refuse both. That
 *     is the only assertion here that distinguishes "policy shipped" from
 *     "policy working".
 *  3. NOTHING THIRD-PARTY IS FETCHED. Every request the page makes while being
 *     driven through all five tabs is recorded and required to be same-origin.
 *     Cross-origin requests are also routed to `abort()` so that a leak fails
 *     loudly here rather than silently succeeding on a machine with network
 *     access and silently failing on one without.
 *
 * The one console message this page is EXPECTED to produce is asserted rather
 * than ignored: Chromium reports that `frame-ancestors` is ignored in a meta
 * element. That is the documented cost of GitHub Pages being unable to set a
 * response header, and pinning it here keeps the limitation honest — if the
 * message ever stops appearing, the directive started working and the
 * documentation needs to change.
 */

const EXPECTED_DIRECTIVES = [
  "default-src 'none'",
  'script-src', // hashes vary with the markup; checked structurally below
  'style-src',
  "img-src 'self' data:",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
];

const FRAME_ANCESTORS_NOTICE =
  /'frame-ancestors' is ignored when delivered via a <meta> element/;

async function policyOf(page: Page): Promise<string> {
  const meta = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(meta).toHaveCount(1);
  return (await meta.getAttribute('content')) ?? '';
}

/** Record every request, and hard-fail any that leaves the origin. */
function watchNetwork(page: Page, origin: string): { offOrigin: string[] } {
  const offOrigin: string[] = [];
  const isLocal = (r: Request): boolean => r.url().startsWith(origin) || r.url().startsWith('data:');
  page.on('request', (r) => {
    if (!isLocal(r)) offOrigin.push(`${r.method()} ${r.url()}`);
  });
  return { offOrigin };
}

test.describe('Content-Security-Policy', () => {
  test('ships a policy that denies everything it does not explicitly need', async ({ page }) => {
    await page.goto('.');
    const policy = await policyOf(page);

    const directives = policy.split(';').map((d) => d.trim());
    expect(directives.map((d) => d.split(' ')[0])).toEqual([
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'base-uri',
      'object-src',
      'frame-ancestors',
      'form-action',
    ]);
    for (const expected of EXPECTED_DIRECTIVES) {
      expect(policy).toContain(expected);
    }

    // There is no connect-src, worker-src, frame-src, media-src, font-src or
    // manifest-src: each falls through to `default-src 'none'`, which is the
    // strictest available answer and the honest one — this demo fetches nothing
    // after load.
    for (const absent of ['connect-src', 'worker-src', 'frame-src', 'media-src', 'font-src']) {
      expect(policy).not.toContain(absent);
    }
  });

  test('grants no unsafe escape hatch and names no remote origin', async ({ page }) => {
    await page.goto('.');
    const policy = await policyOf(page);
    for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'"]) {
      expect(policy, `${unsafe} must never appear in this policy`).not.toContain(unsafe);
    }
    // No CDN, no analytics host, no font host, no scheme-wide script source.
    expect(policy).not.toMatch(/https?:\/\//);
    expect(policy).not.toMatch(/script-src[^;]*\*/);
  });

  test('allows each inline block by hash, and only as many as the page has', async ({ page }) => {
    await page.goto('.');
    const policy = await policyOf(page);

    const counts = await page.evaluate(() => ({
      inlineScripts: document.querySelectorAll('script:not([src])').length,
      inlineStyles: document.querySelectorAll('style').length,
    }));
    const scriptHashes = (policy.match(/script-src[^;]*/)?.[0].match(/'sha256-[^']+'/g) ?? []).length;
    const styleHashes = (policy.match(/style-src[^;]*/)?.[0].match(/'sha256-[^']+'/g) ?? []).length;

    expect(scriptHashes).toBe(counts.inlineScripts);
    expect(styleHashes).toBe(counts.inlineStyles);
  });

  test('is actually enforced: a remote script and an inline script are both refused', async ({
    page,
  }) => {
    await page.goto('.');

    // `securitypolicyviolation` is the page's own report of a block, so this
    // does not depend on parsing console text.
    await page.evaluate(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp.push(
          `${e.effectiveDirective}|${e.blockedURI}`
        );
      });
    });

    // 1. A remote script element. The fetch must never happen.
    await page.evaluate(async () => {
      const s = document.createElement('script');
      s.src = 'https://cdn.example.invalid/analytics.js';
      document.head.appendChild(s);
      await new Promise((r) => setTimeout(r, 300));
    });

    // 2. An inline script whose hash is not in the policy. Chromium evaluates
    // an appended inline script synchronously, so if it ran, the marker is set.
    await page.evaluate(async () => {
      const s = document.createElement('script');
      s.textContent = 'window.__cspEscaped = true;';
      document.body.appendChild(s);
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(
      await page.evaluate(() => (window as unknown as { __cspEscaped?: boolean }).__cspEscaped),
      'an inline script with no matching hash must not execute'
    ).toBeUndefined();

    const reported = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(reported.some((v) => v.startsWith('script-src'))).toBe(true);
    expect(
      reported.some((v) => v.includes('cdn.example.invalid')),
      `expected the remote script to be blocked; got ${JSON.stringify(reported)}`
    ).toBe(true);
  });

  test('reports exactly one policy caveat: frame-ancestors cannot work from a meta element', async ({
    page,
  }) => {
    const messages: string[] = [];
    page.on('console', (m) => {
      const text = m.text();
      if (/Content Security Policy|Refused to/i.test(text)) messages.push(text);
    });
    await page.goto('.');
    await expect(page.locator('#tabs [role="tab"]')).toHaveCount(5);

    // Exactly one, and it is the documented one. A second message would mean the
    // page is fighting its own policy; zero would mean the caveat documented in
    // build/csp.ts and the README no longer applies.
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(FRAME_ANCESTORS_NOTICE);
  });
});

test.describe('network isolation', () => {
  test('loads and runs the entire demo without one off-origin request', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const origin = new URL(baseURL!).origin;

    // Block first, then record. An aborted request still fires `request`, so a
    // leak is both recorded and prevented — the test cannot pass because the
    // machine happened to be offline.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
        return route.continue();
      }
      return route.abort();
    });
    const net = watchNetwork(page, origin);

    await page.goto('.');

    // ── Tab 1: the full signing chain, sealing, and the pasted-seal verifier ──
    await page.locator('#btn-keygen').click();
    await expect(page.locator('#keygen-output')).toContainText('Public key');
    await page.locator('#btn-sign').click();
    await expect(page.locator('#sign-output')).toContainText('Signature');
    await page.locator('#btn-verify').click();
    await expect(page.locator('#verify-output .badge-pass')).toBeVisible();
    await page.locator('#btn-tamper-sig').click();
    await page.locator('#btn-verify').click();
    await expect(page.locator('#verify-output .badge-fail')).toBeVisible();
    await page.locator('#btn-seal').click();
    await expect(page.locator('#seal-output .badge-pass')).toBeVisible();
    await page.locator('#btn-tamper-seal').click();
    await expect(page.locator('.tamper-lesson')).toBeVisible();

    // The export writes a blob: URL and clicks it. Worth driving explicitly:
    // a download is the one navigation this page performs, and `default-src
    // 'none'` would be a plausible thing to break it.
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-export-seal').click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toContain('sealed-document');

    // Every parameter set, since each re-enters the crypto path.
    for (const label of ['ML-DSA-44', 'ML-DSA-87']) {
      await page.locator('.pill', { hasText: label }).click();
      await page.locator('#btn-keygen').click();
      await expect(page.locator('#keygen-output')).toContainText('Public key');
    }

    // ── Tab 2: charts and the in-browser benchmark ───────────────────────────
    await page.locator('#tab-btn-compare').click();
    await expect(page.locator('#pk-bars .bar-fill').first()).toBeVisible();
    await page.locator('#btn-benchmark').click();
    await expect(page.locator('#bench-results')).toBeVisible({ timeout: 300_000 });

    // ── Tab 3: both interactive visualizations ───────────────────────────────
    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-2').click();
    await page.locator('#fs-run').click();
    await expect(page.locator('.fs-attempt').first()).toBeVisible();
    await page.locator('#step-btn-4').click();
    await page.locator('#mlwe-err').fill('0');
    await expect(page.locator('.mlwe-verdict.solvable')).toBeVisible();

    // ── Tabs 4 and 5 ─────────────────────────────────────────────────────────
    await page.locator('#tab-btn-pqc-trio').click();
    await expect(page.locator('.trio-card').first()).toBeVisible();
    await page.locator('#tab-btn-about').click();
    await expect(page.locator('.comparison-table').first()).toBeVisible();

    expect(net.offOrigin, 'the demo must make no request off its own origin').toEqual([]);
  });

  test('the bars and coefficient plots are sized, not merely present', async ({ page }) => {
    // Moving these off inline style attributes is what let the policy drop
    // `'unsafe-inline'`. If the CSSOM write were ever lost, every bar would
    // render at zero and the page would still look "fine" to a test that only
    // asserted the elements exist.
    await page.goto('.');
    await page.locator('#tab-btn-compare').click();
    const widths = await page.$$eval('#pk-bars .bar-fill', (els) =>
      els.map((e) => (e as HTMLElement).style.width)
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => /^[\d.]+%$/.test(w))).toBe(true);

    await page.locator('#tab-btn-how-it-works').click();
    await page.locator('#step-btn-2').click();
    await page.locator('#fs-run').click();
    await expect(page.locator('.coeff-bar').first()).toBeVisible();
    const heights = await page.$$eval('.coeff-bar', (els) =>
      els.map((e) => (e as HTMLElement).style.height)
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((h) => /^\d+%$/.test(h))).toBe(true);
  });
});
