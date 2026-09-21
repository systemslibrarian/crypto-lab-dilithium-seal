/**
 * Claim-level citations and the standards-status panel.
 *
 * `cite()` renders the marker that follows a factual claim. It is a real link
 * to the primary source, not a superscript number pointing at a bibliography
 * further down a page the reader may never scroll to — this demo is a tab
 * interface, so a numbered reference could land on a panel that is not even
 * rendered. Each marker carries the document's short name and the locator
 * inside it, so "which table?" is answered without a round trip.
 */

import {
  CLAIMS,
  FIPS_204_EDITION,
  LINEAGE_DIFFERENCES,
  SOURCES,
  STANDARDS_REVIEWED,
  claim,
  formatDate,
  source,
} from '../data/sources';
import { escapeHTML } from './helpers';

/**
 * A citation marker for one registered claim.
 *
 * The accessible name spells out the source and locator, because "FIPS 204
 * Tbl 2" read aloud in a list of links is not a destination anyone can choose
 * between. `rel="noopener"` on every external link; `target="_blank"` matches
 * the rest of the lab.
 */
export function cite(claimId: string): string {
  const c = claim(claimId);
  const s = source(c.sourceId);
  const label = `${s.short} ${c.locator}`;
  const qualified = c.qualifiedBy ? ' ⚠' : '';
  return (
    `<a class="cite${c.qualifiedBy ? ' cite-qualified' : ''}" href="${escapeHTML(s.url)}" ` +
    `target="_blank" rel="noopener" ` +
    `aria-label="Source: ${escapeHTML(s.title)}, ${escapeHTML(c.locator)}` +
    `${c.qualifiedBy ? ' — see the standards-status panel for a recorded qualification' : ''}">` +
    `${escapeHTML(label)}${qualified}</a>`
  );
}

/**
 * The compact status strip, rendered once beneath the tab bar so it is on
 * screen whatever the reader is looking at.
 *
 * Priority 4 asks for a provenance panel "readable without opening the README".
 * A card inside the About tab would not be: four of the five tabs never show
 * it. This strip carries the three facts that decide whether anything else on
 * the page can be trusted — which edition of FIPS 204, what the errata state
 * is, and when a human last checked — and links to the full panel.
 */
export function renderStandardsStrip(host: HTMLElement): void {
  host.innerHTML = `
    <p class="std-strip-line">
      <strong>ML-DSA</strong> as standardized in
      <a href="${escapeHTML(source('fips204').url)}" target="_blank" rel="noopener">FIPS 204</a>,
      ${escapeHTML(formatDate(FIPS_204_EDITION.published))} — no errata update issued.
      <span class="std-strip-sep" aria-hidden="true">·</span>
      Errata spreadsheet reviewed ${escapeHTML(formatDate(FIPS_204_EDITION.errataSpreadsheetUpdated))}.
      <span class="std-strip-sep" aria-hidden="true">·</span>
      <strong>Standards reviewed ${escapeHTML(formatDate(STANDARDS_REVIEWED))}.</strong>
      <span class="std-strip-sep" aria-hidden="true">·</span>
      <a href="#standards-status">Sources &amp; standards status</a>
    </p>
  `;
}

function sourceRows(): string {
  return SOURCES.map(
    (s) => `
      <tr>
        <th scope="row"><a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.short)}</a></th>
        <td>${escapeHTML(s.title)}</td>
        <td>${escapeHTML(s.publisher)}</td>
        <td>${escapeHTML(formatDate(s.published))}</td>
        <td>${s.status ? `<span class="text-yellow">${escapeHTML(s.status)}</span>` : 'Final'}</td>
      </tr>`
  ).join('');
}

function claimRows(): string {
  return Object.values(CLAIMS)
    .map((c) => {
      const s = source(c.sourceId);
      const q = c.qualifiedBy;
      return `
      <tr>
        <td>${escapeHTML(c.statement)}</td>
        <td><a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.short)}</a>, ${escapeHTML(c.locator)}</td>
        <td>${
          q
            ? `<span class="text-yellow">⚠ ${escapeHTML(q.note)}</span>`
            : '<span class="text-muted">—</span>'
        }</td>
      </tr>`;
    })
    .join('');
}

function lineageRows(): string {
  return LINEAGE_DIFFERENCES.map(
    (d) => `
      <tr>
        <th scope="row">${escapeHTML(d.aspect)}</th>
        <td>${escapeHTML(d.round3)}</td>
        <td>${escapeHTML(d.mldsa)}</td>
        <td class="text-muted">${escapeHTML(d.consequence)}</td>
      </tr>`
  ).join('');
}

/** The full standards-status panel, rendered in the About tab. */
export function renderStandardsStatus(): string {
  return `
    <div class="card" id="standards-status">
      <h2>Standards status &amp; provenance</h2>

      <div class="info-grid" role="group" aria-label="Standards status summary">
        <div class="info-item info-item-left">
          <div class="label">Standard implemented</div>
          <div class="value">FIPS 204</div>
          <p class="text-sm text-muted mt-1">${escapeHTML(FIPS_204_EDITION.publication)},
          published ${escapeHTML(formatDate(FIPS_204_EDITION.published))}.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Errata incorporated</div>
          <div class="value">None</div>
          <p class="text-sm text-muted mt-1">No errata update or revision has been issued; the
          text of ${escapeHTML(formatDate(FIPS_204_EDITION.published))} is current.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Standards reviewed</div>
          <div class="value">${escapeHTML(formatDate(STANDARDS_REVIEWED))}</div>
          <p class="text-sm text-muted mt-1">Date a human last checked every claim below against
          its source.</p>
        </div>
      </div>

      <p class="text-sm text-muted mt-2">${escapeHTML(FIPS_204_EDITION.errataNote)}
      ${cite('repetitions')}</p>
    </div>

    <div class="card">
      <h2>“CRYSTALS-Dilithium” and “ML-DSA” are not the same name for the same thing</h2>
      <p class="text-sm text-muted">
        <strong>CRYSTALS-Dilithium</strong> is the scheme submitted to the NIST Post-Quantum
        Cryptography process in 2017 and revised through round 3.
        <strong>ML-DSA</strong> is the standard NIST published from it in FIPS 204. This demo runs
        ML-DSA; it does not implement round-3 Dilithium anywhere, and the differences are visible
        in the bytes on screen. ${cite('lineage')}
      </p>
      <table class="comparison-table table-prose" tabindex="0">
          <caption class="sr-only">Differences between round-3 CRYSTALS-Dilithium and final FIPS 204 ML-DSA.</caption>
          <thead>
            <tr>
              <th scope="col">Aspect</th>
              <th scope="col">CRYSTALS-Dilithium (round 3, 2021)</th>
              <th scope="col">ML-DSA (FIPS 204, 2024)</th>
              <th scope="col">Consequence</th>
            </tr>
          </thead>
          <tbody>${lineageRows()}</tbody>
      </table>
      <p class="text-sm text-muted mt-1">
        Round-3 sizes ${cite('round3Sizes')}; final sizes ${cite('sizes')}. The signature lengths
        this page prints after you press <strong>Sign</strong> are the FIPS 204 ones.
      </p>
    </div>

    <div class="card">
      <h2>Every claim, and where it comes from</h2>
      <p class="text-sm text-muted mb-1">
        Each row is a factual statement this demo makes and the primary source it is taken from.
        A ⚠ marks a claim that a second source qualifies or corrects.
      </p>
      <table class="comparison-table table-prose" tabindex="0">
          <caption class="sr-only">Factual claims made by this demo, their primary source, and any recorded qualification.</caption>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Source</th>
              <th scope="col">Qualification</th>
            </tr>
          </thead>
          <tbody>${claimRows()}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Sources</h2>
      <table class="comparison-table table-prose" tabindex="0">
          <caption class="sr-only">Primary sources cited by this demo, with publisher, edition date and publication status.</caption>
          <thead>
            <tr>
              <th scope="col">Short name</th>
              <th scope="col">Document</th>
              <th scope="col">Publisher</th>
              <th scope="col">Edition</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>${sourceRows()}</tbody>
      </table>
      <p class="text-sm text-muted mt-1">
        Documents marked other than “Final” are drafts or competition-era submissions. Nothing on
        this page presents a draft or a round-3 parameter as final FIPS 204.
      </p>
    </div>
  `;
}
