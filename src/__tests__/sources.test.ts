/**
 * The citation registry has to be true, not merely present.
 *
 * A source list is the easiest thing in a project like this to let rot: a URL
 * that 404s, a "reviewed" date from two years ago, a claim whose source was
 * edited out, a draft quietly listed as final. None of that fails a build on
 * its own, so it is asserted here.
 *
 * Two assertions are worth calling out because they encode the finding this
 * work started from:
 *
 *   - `round3CoreSvp` must stay attributed to the round-3 submission. The page
 *     previously stated "approximately 165-bit post-quantum security" for
 *     ML-DSA-65 as though FIPS 204 said it. FIPS 204 says the opposite — that
 *     security strength here "is not described by a single number".
 *   - The lineage table must keep matching BOTH specifications and the sizes
 *     the running implementation actually emits, so "Dilithium and ML-DSA are
 *     not interchangeable" is demonstrated rather than asserted.
 */

import { describe, expect, it } from 'vitest';
import {
  CLAIMS,
  FIPS_204_EDITION,
  LINEAGE_DIFFERENCES,
  SOURCES,
  STANDARDS_REVIEWED,
  claim,
  datePrecisionOf,
  formatDate,
  source,
} from '../data/sources';
import { ML_DSA_PARAMS, generateKeyPair, sign } from '../crypto/mldsa';
import { cite, renderStandardsStatus } from '../ui/provenance';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The two forms `Source.published` may take, and nothing else. */
const DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DATE = /^\d{4}-\d{2}$/;

describe('sources', () => {
  it('each carry a resolvable https URL, a publisher and an edition date', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const s of SOURCES) {
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.publisher.length, s.id).toBeGreaterThan(0);
      // Day precision OR month precision, ISO either way, and parseable once
      // the month form is anchored to its first day for the parse alone.
      const parseable = s.datePrecision === 'day' ? s.published : `${s.published}-01`;
      expect(s.published, s.id).toMatch(s.datePrecision === 'day' ? DAY_DATE : MONTH_DATE);
      expect(Number.isNaN(Date.parse(parseable)), s.id).toBe(false);
    }
  });

  it('declare the precision of every date, and the declaration must match the date', () => {
    // THE POINT OF THIS TEST. The registry accepts two date forms because NIST
    // publishes both: FIPS 204 is dated 13 August 2024, and NIST IR 8240 is
    // dated "January 2019" with no day in the document at all. Allowing the
    // month form is what made IR 8240 registrable without inventing 2019-01-01.
    //
    // The risk the marker removes is a date entered sloppily in EITHER
    // direction: a month-precision date slipped in without saying so, or a
    // day-precision date truncated to its month. Inferring the precision from
    // the string cannot catch either, because the string would be its own
    // witness. So both halves are asserted, for every source:
    //   - the marker is present and is one of the two legal values;
    //   - the shape of the string agrees with the marker, and vice versa.
    for (const s of SOURCES) {
      expect(['day', 'month'], `${s.id}: datePrecision must be declared`).toContain(
        s.datePrecision
      );
      expect(datePrecisionOf(s.published), `${s.id}: ${s.published} is not an ISO date`).not.toBeNull();
      expect(
        datePrecisionOf(s.published),
        `${s.id}: declares ${s.datePrecision} precision but ${s.published} is not that shape`
      ).toBe(s.datePrecision);
      if (s.datePrecision === 'month') {
        expect(s.published, `${s.id} must not carry an invented day`).not.toMatch(DAY_DATE);
      }
    }
    // Both kinds are actually present, so neither branch above is vacuous.
    expect(SOURCES.some((s) => s.datePrecision === 'day')).toBe(true);
    expect(SOURCES.some((s) => s.datePrecision === 'month')).toBe(true);
  });

  it('refuse to render a date whose declared precision disagrees with it', () => {
    // A mismatch is a bug in the registry, not something to paper over at the
    // point of rendering: `formatDate` throws rather than quietly printing a day
    // the source never stated, or dropping one it did.
    expect(formatDate('2024-08-13', 'day')).toBe('13 August 2024');
    expect(formatDate('2019-01', 'month')).toBe('January 2019');
    expect(() => formatDate('2019-01', 'day')).toThrow(/month precision but declares day/);
    expect(() => formatDate('2024-08-13', 'month')).toThrow(/day precision but declares month/);
    expect(() => formatDate('2019', 'month')).toThrow(/not an ISO date/);
    expect(() => formatDate('January 2019')).toThrow(/not an ISO date/);
    // A month-precision date is rendered as a month, never padded to the 1st.
    expect(formatDate('2019-01', 'month')).not.toContain('1 January');
  });

  it('register NIST IR 8240 at the precision the report itself carries', () => {
    // Verified against the report: "January 2019" on the cover page of
    // NIST.IR.8240.pdf and "Date Published: January 2019" on its CSRC record.
    // No day appears in either, so none is recorded here.
    const s = source('nistir8240');
    expect(s.title).toContain(
      'Status Report on the First Round of the NIST Post-Quantum Cryptography Standardization Process'
    );
    expect(s.publisher).toBe('NIST');
    expect(s.url).toBe('https://nvlpubs.nist.gov/nistpubs/ir/2019/NIST.IR.8240.pdf');
    expect(s.published).toBe('2019-01');
    expect(s.datePrecision).toBe('month');
    expect(s.identifier).toContain('10.6028/NIST.IR.8240');
    // A final report: nothing to flag as draft or superseded.
    expect(s.status).toBeUndefined();
    expect(formatDate(s.published, s.datePrecision)).toBe('January 2019');
  });

  it('have unique ids', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
  });

  it('mark every non-final document as such', () => {
    // A draft or a competition submission presented as final is exactly the
    // failure Priority 4 exists to prevent.
    expect(source('nistir8547').status).toBeUndefined();
    expect(source('nistir8547').url).toBe('https://csrc.nist.gov/pubs/ir/8547/final');
    expect(source('nistir8547').published).toBe('2026-10-27');
    expect(source('dilithium-r3').status).toMatch(/submission|superseded/i);
    expect(source('fips204-errata').status).toMatch(/not official changes/i);
    // ...and every FIPS standard as final.
    for (const id of ['fips203', 'fips204', 'fips205']) {
      expect(source(id).status, id).toBeUndefined();
    }
  });

  it('name the NIST documents by their real identifiers', () => {
    expect(source('fips204').url).toContain('csrc.nist.gov/pubs/fips/204/final');
    expect(source('fips204').identifier).toBe('doi:10.6028/NIST.FIPS.204');
    expect(source('fips204').published).toBe('2024-08-13');
    // The ACVP pin must be a full 40-character commit, not a branch.
    expect(source('acvp').identifier).toMatch(/commit [0-9a-f]{40}/);
  });
});

describe('claims', () => {
  it('each point at a registered source with a locator', () => {
    for (const c of Object.values(CLAIMS)) {
      expect(() => source(c.sourceId), c.id).not.toThrow();
      expect(c.locator.length, c.id).toBeGreaterThan(0);
      expect(c.statement.length, c.id).toBeGreaterThan(20);
      if (c.qualifiedBy) {
        expect(() => source(c.qualifiedBy!.sourceId), c.id).not.toThrow();
        expect(c.qualifiedBy.note.length, c.id).toBeGreaterThan(20);
      }
    }
  });

  it('leave no source registered that nothing cites', () => {
    // A stale source is a claim that used to be made. Either something still
    // cites it or it should go.
    const cited = new Set<string>();
    for (const c of Object.values(CLAIMS)) {
      cited.add(c.sourceId);
      if (c.qualifiedBy) cited.add(c.qualifiedBy.sourceId);
    }
    const orphans = SOURCES.map((s) => s.id).filter((id) => !cited.has(id));
    // FIPS 203/205 and the library are referenced in prose rather than by a
    // registered claim; everything else must be cited.
    expect(orphans.sort()).toEqual(['fips203', 'fips205', 'noble-pq']);
  });

  it('source the first-round counts to NIST IR 8240 instead of to nothing', () => {
    // 82 received and 69 accepted were on the timeline with no citation, because
    // the only document that states them could not be registered under a
    // day-precision-only schema. NIST IR 8240 §2.1: "NIST received 82 candidate
    // algorithm submission packages by the November 30, 2017 entry deadline...
    // Of these, NIST accepted 69 first-round candidates as meeting both the
    // submission requirements and the minimum acceptability criteria for being
    // 'complete and proper submissions'."
    const c = claim('firstRoundCounts');
    expect(c.sourceId).toBe('nistir8240');
    expect(c.statement).toContain('82');
    expect(c.statement).toContain('69');
    expect(c.statement).toMatch(/complete and proper/);
    expect(c.locator).toContain('2.1');
    // The counts must not be transposed, which is the error this claim guards.
    expect(c.statement).not.toMatch(/69 candidate algorithm submission packages/);
  });

  it('attribute the Core-SVP figure to the competition submission, never to FIPS 204', () => {
    const c = claim('round3CoreSvp');
    expect(c.sourceId).toBe('dilithium-r3');
    expect(c.statement).toContain('round-3');
    expect(c.qualifiedBy?.sourceId).toBe('fips204');
    expect(c.qualifiedBy?.note).toMatch(/not a property FIPS 204 states/);
    // And the correction it points to must itself be registered.
    expect(claim('notOneNumber').statement).toMatch(/not described by a single number/);
  });

  it('sample the secret vectors uniformly by rejection, not from a binomial', () => {
    // ML-DSA draws s1 and s2 uniformly from [-eta, eta] by rejection sampling
    // (FIPS 204 Algorithm 33 -> Algorithm 31 -> Algorithm 15). The centered
    // binomial distribution belongs to ML-KEM (FIPS 203 Algorithm 8), and the
    // page said so about ML-DSA until 15 November 2026.
    const c = claim('secretSampling');
    expect(c.sourceId).toBe('fips204');
    expect(c.locator).toBe('Algorithms 15, 31 and 33');
    expect(c.statement).toContain('uniformly');
    expect(c.statement).toContain('rejection sampling');
    expect(c.statement).not.toMatch(/binomial/i);
  });

  it('cite the computational-assumptions section for the hardness claim', () => {
    // FIPS 204 section 3.2 is "Computational Assumptions"; 3.4 is hedged and
    // deterministic signing and 4 is the parameter sets.
    expect(claim('hardness').locator).toBe('§3.2');
  });

  it('record the repetitions figure as published AND the pending correction', () => {
    const c = claim('repetitions');
    expect(c.sourceId).toBe('fips204');
    expect(c.statement).toContain('4.25');
    expect(c.qualifiedBy?.sourceId).toBe('fips204-errata');
    expect(c.qualifiedBy?.note).toContain('4.36, 5.14 and 3.91');
    expect(c.qualifiedBy?.note).toMatch(/not yet an official change/);
  });
});

describe('freshness', () => {
  it('has a standards-reviewed date that is real and not in the future', () => {
    expect(STANDARDS_REVIEWED).toMatch(ISO_DATE);
    const reviewed = Date.parse(`${STANDARDS_REVIEWED}T00:00:00Z`);
    expect(Number.isNaN(reviewed)).toBe(false);
    expect(reviewed).toBeLessThanOrEqual(Date.now());
  });

  it('records the FIPS 204 edition and that no errata update has been incorporated', () => {
    expect(FIPS_204_EDITION.published).toBe('2024-08-13');
    // `null` is the honest value: NIST has published a list of potential
    // corrections, but no errata update and no revision.
    expect(FIPS_204_EDITION.errataUpdateIncorporated).toBeNull();
    expect(FIPS_204_EDITION.errataSpreadsheetUpdated).toMatch(ISO_DATE);
    expect(FIPS_204_EDITION.errataNote).toMatch(/ARE NOT official changes/);
    // The spreadsheet's header ends "...in a future errata update of the
    // publication."; quoting it three words short was a misquotation.
    expect(FIPS_204_EDITION.errataNote).toContain(
      'in a future errata update of the publication."'
    );
  });

  it('reviewed the errata spreadsheet no earlier than the standard was published', () => {
    expect(Date.parse(FIPS_204_EDITION.errataSpreadsheetUpdated)).toBeGreaterThan(
      Date.parse(FIPS_204_EDITION.published)
    );
    expect(Date.parse(STANDARDS_REVIEWED)).toBeGreaterThanOrEqual(
      Date.parse(FIPS_204_EDITION.errataSpreadsheetUpdated)
    );
  });
});

describe('CRYSTALS-Dilithium vs ML-DSA', () => {
  it('lists differences that are concrete, not rhetorical', () => {
    expect(LINEAGE_DIFFERENCES.length).toBeGreaterThanOrEqual(4);
    for (const d of LINEAGE_DIFFERENCES) {
      expect(d.round3, d.aspect).not.toBe(d.mldsa);
      expect(d.consequence.length, d.aspect).toBeGreaterThan(20);
    }
  });

  it('states the round-3 signature sizes that differ from the standard, correctly', () => {
    // Round 3: 2420 / 3293 / 4595 (submission Table 1).
    // FIPS 204: 2420 / 3309 / 4627 (Table 2). Only ML-DSA-44 matches.
    const row = LINEAGE_DIFFERENCES.find((d) => d.aspect === 'Signature size')!;
    expect(row.round3).toContain('2420');
    expect(row.round3).toContain('3293');
    expect(row.round3).toContain('4595');
    expect(row.mldsa).toContain(String(ML_DSA_PARAMS['ml-dsa-44'].signature));
    expect(row.mldsa).toContain(String(ML_DSA_PARAMS['ml-dsa-65'].signature));
    expect(row.mldsa).toContain(String(ML_DSA_PARAMS['ml-dsa-87'].signature));
  });

  it('matches what the implementation actually emits, not just the table', async () => {
    // The claim "a round-3 signature is not an ML-DSA signature" is only worth
    // making if the bytes agree with it. 3309 and 4627 are produced here; 3293
    // and 4595 are the round-3 numbers and must not appear.
    const round3 = { 'ml-dsa-44': 2420, 'ml-dsa-65': 3293, 'ml-dsa-87': 4595 } as const;
    for (const variant of ['ml-dsa-44', 'ml-dsa-65', 'ml-dsa-87'] as const) {
      const kp = await generateKeyPair(variant);
      const { signature } = await sign(kp.privateKey, new TextEncoder().encode('lineage'), variant);
      expect(signature.length, variant).toBe(ML_DSA_PARAMS[variant].signature);
      if (variant !== 'ml-dsa-44') {
        expect(signature.length, `${variant} must not be the round-3 size`).not.toBe(round3[variant]);
      }
    }
  });

  it('records the two encoding changes that explain the size differences', () => {
    const tr = LINEAGE_DIFFERENCES.find((d) => d.aspect === 'Public-key hash tr')!;
    expect(tr.round3).toContain('32 bytes');
    expect(tr.mldsa).toContain('64 bytes');
    // sk grows by exactly the tr delta: 2528 -> 2560, 4000 -> 4032, 4864 -> 4896.
    expect(ML_DSA_PARAMS['ml-dsa-44'].privateKey - 2528).toBe(32);
    expect(ML_DSA_PARAMS['ml-dsa-65'].privateKey - 4000).toBe(32);
    expect(ML_DSA_PARAMS['ml-dsa-87'].privateKey - 4864).toBe(32);

    const ctilde = LINEAGE_DIFFERENCES.find((d) => d.aspect === 'Commitment hash c̃')!;
    expect(ctilde.round3).toContain('32 bytes for every parameter set');
    // sig grows by exactly the c-tilde delta: +0, +16, +32.
    expect(ML_DSA_PARAMS['ml-dsa-44'].signature - 2420).toBe(0);
    expect(ML_DSA_PARAMS['ml-dsa-65'].signature - 3293).toBe(16);
    expect(ML_DSA_PARAMS['ml-dsa-87'].signature - 4595).toBe(32);
  });
});

describe('rendering', () => {
  it('renders a citation as a link to the source with a descriptive accessible name', () => {
    const html = cite('sizes');
    expect(html).toContain('href="https://csrc.nist.gov/pubs/fips/204/final"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('Table 2');
    // The name must still NAME the document — "FIPS 204 Tbl 2" read aloud in a
    // list of links is not a destination anyone can choose between.
    expect(html).toContain('Module-Lattice-Based Digital Signature Standard');
  });

  /** The visible text of a rendered `cite()`, and its accessible name. */
  const parts = (html: string): { visible: string; name: string } => ({
    visible: html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    name: html.match(/aria-label="([^"]*)"/)![1].replace(/\s+/g, ' ').trim(),
  });

  it('satisfies WCAG 2.5.3: the accessible name contains the visible text', () => {
    // Level A. A voice-control user says what they can see; if the name does
    // not contain it, the link cannot be activated by voice. The first version
    // of this marker read "Source: FIPS 204: Module-Lattice-Based…, Table 2",
    // which does NOT contain the visible "FIPS 204 Table 2" — the colon after
    // "FIPS 204" breaks the substring. Lighthouse caught it.
    for (const id of Object.keys(CLAIMS)) {
      const { visible, name } = parts(cite(id));
      // The ⚠ is decorative and not part of the label to be matched.
      const label = visible.replace(/\s*⚠$/, '');
      expect(name.toLowerCase(), `${id}: "${name}" must contain "${label}"`).toContain(
        label.toLowerCase()
      );
    }
  });

  it('marks a qualified claim visibly and in its accessible name', () => {
    const html = cite('repetitions');
    expect(html).toContain('cite-qualified');
    expect(html).toContain('⚠');
    expect(html).toContain('qualified; see the standards-status panel');
  });

  it('refuses to render a citation for an unregistered claim', () => {
    expect(() => cite('no-such-claim')).toThrow(/unknown claim/);
  });

  it('puts every claim and every source into the standards-status panel', () => {
    const html = renderStandardsStatus();
    for (const c of Object.values(CLAIMS)) {
      // Statements are escaped into the table, so compare on an escaped-safe
      // fragment rather than the whole sentence.
      expect(html, c.id).toContain(c.locator);
    }
    for (const s of SOURCES) {
      expect(html, s.id).toContain(s.url);
      expect(html, s.id).toContain(formatDate(s.published, s.datePrecision));
    }
  });

  it('shows the reviewed date and the errata state in the panel', () => {
    const html = renderStandardsStatus();
    expect(html).toContain(formatDate(STANDARDS_REVIEWED));
    expect(html).toContain('Errata incorporated');
    expect(html).toContain('>None<');
  });
});
