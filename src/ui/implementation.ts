/**
 * "What is actually running" — the implementation identity panel and the
 * limitations panel.
 *
 * The version here comes from the lockfile at build time, so it cannot drift
 * away from what `npm ci` installed. The audit and validation rows say "no"
 * where the answer is no, in the same visual weight as everything else: a
 * limitations panel that has to be hunted for is a limitations panel nobody
 * reads, which is why these render on the About tab as full cards and the most
 * consequential of them is repeated on the tab where signatures are made.
 */

import { LIMITATIONS, RUNTIME_FACTS } from '../data/runtime';
import { escapeHTML } from './helpers';
import { cite } from './provenance';

const { library, dependencies, audit, validation } = RUNTIME_FACTS;

/** Where the assurance documents live. */
const REPO = 'https://github.com/systemslibrarian/crypto-lab-dilithium-seal';

function yesNo(value: boolean, yes: string, no: string): string {
  // Never colour alone (WCAG 1.4.1): the glyph and the words carry it.
  return value
    ? `<span class="text-green">✓ ${escapeHTML(yes)}</span>`
    : `<span class="text-red">✗ ${escapeHTML(no)}</span>`;
}

/** A short line naming the exact build, for the tab where keys are made. */
export function renderImplementationBadge(): string {
  return `
    <p class="text-sm text-muted impl-badge">
      Running <strong>${escapeHTML(library.name)} ${escapeHTML(library.version)}</strong> —
      pure JavaScript, no WebAssembly or native code. Randomness:
      <span class="mono">crypto.getRandomValues</span>. Not independently audited; no CMVP
      validation. <a href="#implementation-identity">What this means</a>
    </p>
  `;
}

function dependencyRows(): string {
  return [library, ...dependencies]
    .map(
      (p) => `
      <tr>
        <th scope="row"><span class="mono">${escapeHTML(p.name)}</span></th>
        <td><span class="mono">${escapeHTML(p.version)}</span></td>
        <td class="impl-integrity"><span class="mono">${escapeHTML(p.integrity)}</span></td>
      </tr>`
    )
    .join('');
}

function limitationCards(): string {
  return LIMITATIONS.map(
    (l) => `
      <div class="limitation" id="limitation-${escapeHTML(l.id)}">
        <h3 class="limitation-title">${escapeHTML(l.title)}</h3>
        <p class="text-sm text-muted">${escapeHTML(l.body)}${l.claimId ? ` ${cite(l.claimId)}` : ''}</p>
      </div>`
  ).join('');
}

export function renderImplementationIdentity(): string {
  return `
    <div class="card" id="implementation-identity">
      <h2>What is actually running</h2>
      <p class="text-sm text-muted mb-1">
        Every value below is derived from <span class="mono">package-lock.json</span> at build
        time, so the version shown is the version installed — not a range, and not a sentence
        someone forgot to update.
      </p>

      <div class="info-grid" role="group" aria-label="Implementation identity">
        <div class="info-item info-item-left">
          <div class="label">Library</div>
          <div class="value mono">${escapeHTML(library.version)}</div>
          <p class="text-sm text-muted mt-1">
            <a href="${escapeHTML(RUNTIME_FACTS.repository)}" target="_blank" rel="noopener">${escapeHTML(library.name)}</a>
          </p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Implementation</div>
          <div class="value">JavaScript</div>
          <p class="text-sm text-muted mt-1">Pure JS — no WebAssembly, no native module, no
          worker-offloaded binary.</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Randomness</div>
          <div class="value mono">getRandomValues</div>
          <p class="text-sm text-muted mt-1">Web Crypto API. There is no fallback; operations
          stop if it is unavailable. ${cite('randomness')}</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Independent audit</div>
          <div class="value">${yesNo(audit.independent, 'Audited', 'None')}</div>
          <p class="text-sm text-muted mt-1">“${escapeHTML(audit.statement)}”
          Self-audited at ${escapeHTML(audit.selfAuditedVersion)} (${escapeHTML(audit.selfAuditedDate)});
          ${
            audit.shippedVersionIsAfterSelfAudit
              ? `the version shipped here (${escapeHTML(library.version)}) is <strong>later than that</strong>, so even the self-audit does not cover it.`
              : 'this is the self-audited version.'
          }</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">CMVP / FIPS 140</div>
          <div class="value">${yesNo(validation.cmvp, 'Validated', 'None')}</div>
          <p class="text-sm text-muted mt-1">${escapeHTML(validation.statement)}</p>
        </div>
        <div class="info-item info-item-left">
          <div class="label">Build</div>
          <div class="value mono">${escapeHTML(RUNTIME_FACTS.builtAt)}</div>
          <p class="text-sm text-muted mt-1">Date this bundle was produced.</p>
        </div>
      </div>

      <h3 class="mt-2">Pinned by integrity hash</h3>
      <table class="comparison-table table-prose" id="implementation-packages" tabindex="0">
        <caption class="sr-only">Cryptographic packages in this build, with the version and subresource integrity hash from package-lock.json.</caption>
        <thead>
          <tr>
            <th scope="col">Package</th>
            <th scope="col">Version</th>
            <th scope="col">Integrity (from the lockfile)</th>
          </tr>
        </thead>
        <tbody>${dependencyRows()}</tbody>
      </table>

      <h3 class="mt-2">ML-DSA modes this library exposes</h3>
      <ul class="text-sm text-muted ref-list">
        ${RUNTIME_FACTS.supportedModes.map((m) => `<li>${escapeHTML(m)}</li>`).join('')}
      </ul>
      <p class="text-sm text-muted">
        The demo itself signs with pure ML-DSA and an empty context. The other modes are exercised
        by the conformance suite against NIST's vectors. ${cite('interop')}
      </p>
    </div>

    <div class="card" id="limitations">
      <h2>Limitations that hold however correct the maths is</h2>
      <p class="text-sm text-muted mb-1">
        Each of these changes what you should conclude from a ✓ VERIFIED badge.
      </p>
      ${limitationCards()}
    </div>

    <div class="card" id="assurance-documents">
      <h2>Security policy, threat model and full limitations</h2>
      <p class="text-sm text-muted mb-1">
        The six above are the ones that change how you read this page. The
        documents below are the long form — written for someone deciding whether
        to trust this, or how to report a problem with it.
      </p>
      <ul class="text-sm ref-list" id="assurance-links">
        <li>
          <a href="${REPO}/blob/main/SECURITY.md" target="_blank" rel="noopener">Security policy</a>
          — how to report a vulnerability, what is in and out of scope, and the
          table of security properties CI enforces on every change.
        </li>
        <li>
          <a href="${REPO}/blob/main/THREAT-MODEL.md" target="_blank" rel="noopener">Threat model</a>
          — assets, trust boundary, and eight named threats from private-key
          exposure to supply-chain compromise, each with what is done and where
          it stops.
        </li>
        <li>
          <a href="${REPO}/blob/main/KNOWN-LIMITATIONS.md" target="_blank" rel="noopener">Known limitations</a>
          — sixteen, in full, including the ones that cannot be fixed in a
          browser page.
        </li>
        <li>
          <a href="${REPO}/blob/main/EVIDENCE.md" target="_blank" rel="noopener">Evidence table</a>
          — every claim this demo makes, its primary source, the automated test
          that keeps it true, and what it still does not prove.
        </li>
        <li>
          <a href="${REPO}/blob/main/vectors/acvp/SOURCE.md" target="_blank" rel="noopener">Conformance vector provenance</a>
          — which NIST ACVP vectors are pinned, at which commit, and what
          passing them does and does not prove.
        </li>
        <li>
          <a href="${REPO}" target="_blank" rel="noopener">Source code</a>
          — every claim on this page is checked by a test in this repository.
        </li>
      </ul>
    </div>
  `;
}
