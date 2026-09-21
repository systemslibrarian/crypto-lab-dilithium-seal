#!/usr/bin/env node
/**
 * Verify the LIVE site, after it has been published.
 *
 * Every other gate in this repository tests a build. None of them tested the
 * deployment. That gap is not theoretical: a publish can partially succeed, a
 * CDN can serve a stale asset, Pages can 404 a path that worked locally, and an
 * artifact can be uploaded from a directory that was not the one just built.
 * Each of those leaves the whole suite green and the site broken.
 *
 * Two questions, both answered against the real URL:
 *
 *   1. IS WHAT IS LIVE WHAT WE BUILT? The page and every asset it references
 *      are fetched and hashed, then compared against a fresh local build of the
 *      same commit. This only means anything because the build is reproducible
 *      — which the pipeline separately enforces.
 *
 *   2. DOES IT ACTUALLY WORK? A real key is generated, a real message signed
 *      and verified, and a tampered signature refused, in a real browser
 *      against the deployed bytes. No fixtures, no preview server.
 *
 * Usage:  node scripts/verify-deployment.mjs <url>
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { manifestFor } from './hash-dist.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Pages serves from a CDN that can lag a successful deploy by a few seconds.
 * Retrying a handful of times is the difference between a gate and a coin toss.
 */
async function fetchWithRetry(url, attempts = 10) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`${url}: ${lastError?.message ?? 'unreachable'} after ${attempts} attempts`);
}

async function checkBytesMatchBuild(baseUrl) {
  const local = new Map(
    manifestFor(DIST)
      .split('\n')
      .map((line) => {
        const [digest, path] = line.split('  ');
        return [path, digest];
      })
  );

  const html = await fetchWithRetry(baseUrl);
  const problems = [];

  if (sha256(html) !== local.get('index.html')) {
    problems.push(
      `index.html: live ${sha256(html).slice(0, 16)}… != built ${(local.get('index.html') ?? '?').slice(0, 16)}…`
    );
  }

  // Every asset the live page actually references, not every asset we built —
  // a stale file left in the bucket is not what visitors load.
  const referenced = [...String(html).matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(
    (m) => m[1]
  );
  if (referenced.length === 0) problems.push('the live page references no bundled assets at all');

  for (const path of new Set(referenced)) {
    const name = `assets/${path.split('/assets/')[1]}`;
    const expected = local.get(name);
    if (!expected) {
      problems.push(`${name}: live page references an asset this build did not produce`);
      continue;
    }
    const bytes = await fetchWithRetry(new URL(path, baseUrl).href);
    if (sha256(bytes) !== expected) {
      problems.push(`${name}: live bytes differ from the build`);
    }
  }

  return { problems, checked: new Set(referenced).size + 1 };
}

async function checkItWorks(baseUrl) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const offOrigin = [];
  const errors = [];
  const origin = new URL(baseUrl).origin;
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) offOrigin.push(u);
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    const problems = [];
    if ((await page.locator('meta[http-equiv="Content-Security-Policy"]').count()) !== 1) {
      problems.push('no Content-Security-Policy meta element on the live page');
    }

    // A real signature, over a real key, against the deployed bytes.
    await page.locator('#btn-keygen').click();
    await page.locator('#keygen-output').getByText('Generated in').waitFor({ timeout: 60_000 });
    await page.locator('#btn-sign').click();
    await page.locator('#sign-output').getByText('Signed in').waitFor({ timeout: 60_000 });
    await page.locator('#btn-verify').click();
    if ((await page.locator('#verify-output .badge-pass').count()) !== 1) {
      problems.push('a freshly signed message did not verify on the live site');
    }

    // ...and a tampered one must still be refused.
    await page.locator('#btn-tamper-sig').click();
    await page.locator('#btn-verify').click();
    if ((await page.locator('#verify-output .badge-fail').count()) !== 1) {
      problems.push('a tampered signature was NOT refused on the live site');
    }

    if (offOrigin.length > 0) problems.push(`off-origin requests: ${offOrigin.join(', ')}`);
    if (errors.length > 0) problems.push(`page errors: ${errors.join(' | ')}`);
    return problems;
  } finally {
    await browser.close();
  }
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    process.stderr.write('usage: node scripts/verify-deployment.mjs <url>\n');
    process.exit(1);
  }
  const baseUrl = url.endsWith('/') ? url : `${url}/`;
  process.stderr.write(`verify-deployment: ${baseUrl}\n`);

  const bytes = await checkBytesMatchBuild(baseUrl);
  process.stderr.write(`  ${bytes.checked} file(s) compared against a fresh build of this commit\n`);

  const behaviour = await checkItWorks(baseUrl);
  process.stderr.write('  keygen, sign, verify and tamper-rejection driven in a real browser\n');

  const problems = [...bytes.problems, ...behaviour];
  if (problems.length > 0) {
    process.stderr.write('\nThe deployed site does not match this build, or does not work:\n');
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    process.exit(1);
  }
  process.stderr.write('\nverify-deployment: live bytes match this build, and the demo works.\n');
}

await main();
