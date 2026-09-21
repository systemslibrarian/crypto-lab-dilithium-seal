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
  formatDate,
  source,
} from '../data/sources';
import { ML_DSA_PARAMS, generateKeyPair, sign } from '../crypto/mldsa';
import { cite, renderStandardsStatus } from '../ui/provenance';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('sources', () => {
  it('each carry a resolvable https URL, a publisher and an edition date', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const s of SOURCES) {
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.publisher.length, s.id).toBeGreaterThan(0);
      expect(s.published, s.id).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(s.published)), s.id).toBe(false);
    }
  });

  it('have unique ids', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
  });

  it('mark every non-final document as such', () => {
    // A draft or a competition submission presented as final is exactly the
    // failure Priority 4 exists to prevent.
    expect(source('nistir8547').status).toMatch(/Draft/i);
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

  it('attribute the Core-SVP figure to the competition submission, never to FIPS 204', () => {
    const c = claim('round3CoreSvp');
    expect(c.sourceId).toBe('dilithium-r3');
    expect(c.statement).toContain('round-3');
    expect(c.qualifiedBy?.sourceId).toBe('fips204');
    expect(c.qualifiedBy?.note).toMatch(/not a property FIPS 204 states/);
    // And the correction it points to must itself be registered.
    expect(claim('notOneNumber').statement).toMatch(/not described by a single number/);
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
    expect(html).toContain('aria-label="Source: FIPS 204');
    expect(html).toContain('Table 2');
  });

  it('marks a qualified claim visibly and in its accessible name', () => {
    const html = cite('repetitions');
    expect(html).toContain('cite-qualified');
    expect(html).toContain('⚠');
    expect(html).toContain('recorded qualification');
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
      expect(html, s.id).toContain(formatDate(s.published));
    }
  });

  it('shows the reviewed date and the errata state in the panel', () => {
    const html = renderStandardsStatus();
    expect(html).toContain(formatDate(STANDARDS_REVIEWED));
    expect(html).toContain('Errata incorporated');
    expect(html).toContain('>None<');
  });
});
