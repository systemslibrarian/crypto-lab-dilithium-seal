/**
 * Primary-source registry.
 *
 * Every factual claim this demo makes about ML-DSA — a size, a parameter, a
 * security category, a rule, a date — is registered here against the document
 * it comes from, with the locator inside that document. Nothing in `src/ui`
 * states a parameter or a standards fact without going through `cite()`, and
 * `src/__tests__/sources.test.ts` fails if a claim exists with no source, or a
 * source exists that nothing cites.
 *
 * The point is not decoration. Before this registry the page asserted that
 * ML-DSA-65 provides "approximately 165-bit post-quantum security" — a number
 * that appears nowhere in FIPS 204. It is the Quantum Core-SVP estimate from
 * Table 1 of the round-3 CRYSTALS-Dilithium submission, a competition-era
 * figure for a scheme whose signature encoding differs from the standard's, and
 * FIPS 204 §4 says in terms that security strength here "is not described by a
 * single number, such as '128 bits of security.'" A citation requirement is what
 * makes that kind of claim impossible to write down casually.
 */

export type SourceKind =
  | 'standard'
  | 'errata'
  | 'vectors'
  | 'submission'
  | 'guidance'
  | 'report'
  | 'library'
  | 'research';

/**
 * How precise a source's publication date is, stated explicitly.
 *
 * NIST dates some documents to the day (FIPS 204: 13 August 2024) and others
 * only to the month. NIST IR 8240 is one of the latter: "January 2019" on its
 * cover page and "Date Published: January 2019" on its CSRC record, with no day
 * anywhere in the document. A registry that accepts only `YYYY-MM-DD` forces a
 * choice between fabricating a day and leaving the document unregistered, and
 * this demo took the second option -- the first-round submission counts sat on
 * the page with no citation because their source could not be entered.
 *
 * WHY THIS IS A DECLARED FIELD AND NOT A STRING-LENGTH CHECK. Inferring the
 * precision from the string would make the data its own witness: `'2019-01'`
 * would be month-precision by definition, so a truncation that dropped the day
 * from a day-precise document would be indistinguishable from a date that is
 * genuinely only known to the month. Declared separately, the two have to
 * agree, and `src/__tests__/sources.test.ts` checks that agreement in both
 * directions -- a month-precision date without the marker fails, and so does a
 * day-precision one.
 */
export type DatePrecision = 'day' | 'month';

export interface Source {
  id: string;
  /** Short label rendered next to a claim, e.g. "FIPS 204 Tbl 1". */
  short: string;
  title: string;
  publisher: string;
  url: string;
  kind: SourceKind;
  /**
   * Edition or publication date of the exact document version cited, ISO 8601
   * and no more precise than the document itself: `YYYY-MM-DD` where the
   * document carries a day, `YYYY-MM` where it carries only a month. A day is
   * never invented to satisfy the format.
   */
  published: string;
  /** Which of the two forms `published` is in. Always stated, never inferred. */
  datePrecision: DatePrecision;
  /** Set when the document is not a final publication. */
  status?: string;
  /** Anything a reader needs to identify the exact artifact. */
  identifier?: string;
}

/**
 * The date a human last read these sources end-to-end and confirmed every
 * claim below still matches them. Rendered on the page; asserted by tests to be
 * a real, non-future date.
 */
export const STANDARDS_REVIEWED = '2026-09-20';

/**
 * The exact edition of FIPS 204 this demo implements and describes, and the
 * errata state at the review date.
 *
 * FIPS 204 has had NO errata update and NO revision: the published PDF of
 * 13 August 2024 is still the current text. What NIST maintains is a "potential
 * updates (errata)" spreadsheet of issues found since publication, which it
 * says "ARE NOT official changes, but may be corrected in a future errata
 * update of the publication." One of those entries changes a number this demo
 * displays, so the distinction is load-bearing rather than pedantic — see
 * `CLAIMS.repetitions`.
 */
export const FIPS_204_EDITION = {
  publication: 'FIPS 204 (initial public version)',
  published: '2024-08-13',
  doi: 'https://doi.org/10.6028/NIST.FIPS.204',
  errataUpdateIncorporated: null as string | null,
  errataSpreadsheetUpdated: '2026-07-31',
  errataNote:
    'NIST publishes a "potential updates (errata)" spreadsheet for FIPS 204, last updated ' +
    '31 July 2026. Its own header states these "ARE NOT official changes, but may be corrected ' +
    'in a future errata update of the publication." No errata update or revision to FIPS 204 has ' +
    'been issued: the text of 13 August 2024 remains current.',
} as const;

export const SOURCES: Source[] = [
  {
    id: 'msis-2026',
    short: 'MSIS research, 16 Oct 2026',
    title: 'Refined Approx-SVP Rank Reduction Conditions and Adaptive Lattice Reduction for MSIS Security Estimation',
    publisher: 'Zhang, Zhou and Qu — IACR ePrint / TCHES',
    url: 'https://eprint.iacr.org/2026/607',
    kind: 'research',
    published: '2026-10-16',
    datePrecision: 'day',
    status: 'Revision of TCHES 2026 research; model-dependent estimates, not a standards change',
    identifier: 'ePrint 2026/607, revision 16 October 2026; doi:10.46586/tches.v2026.i4.397-422',
  },
  {
    id: 'fips204',
    short: 'FIPS 204',
    title: 'FIPS 204: Module-Lattice-Based Digital Signature Standard',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/fips/204/final',
    kind: 'standard',
    published: '2024-08-13',
    datePrecision: 'day',
    identifier: 'doi:10.6028/NIST.FIPS.204',
  },
  {
    id: 'fips204-errata',
    short: 'FIPS 204 errata',
    title: 'FIPS 204 potential updates (errata) spreadsheet',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/files/pubs/fips/204/final/docs/fips-204-potential-updates.xlsx',
    kind: 'errata',
    published: '2026-07-31',
    datePrecision: 'day',
    status: 'Potential corrections — not official changes to the standard',
    identifier: 'fips-204-potential-updates.xlsx',
  },
  {
    id: 'fips203',
    short: 'FIPS 203',
    title: 'FIPS 203: Module-Lattice-Based Key-Encapsulation Mechanism Standard',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/fips/203/final',
    kind: 'standard',
    published: '2024-08-13',
    datePrecision: 'day',
  },
  {
    id: 'fips205',
    short: 'FIPS 205',
    title: 'FIPS 205: Stateless Hash-Based Digital Signature Standard',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/fips/205/final',
    kind: 'standard',
    published: '2024-08-13',
    datePrecision: 'day',
  },
  {
    id: 'nist-pqc-release',
    short: 'NIST announcement',
    title: 'NIST Releases First 3 Finalized Post-Quantum Encryption Standards',
    publisher: 'NIST',
    url: 'https://www.nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-encryption-standards',
    kind: 'guidance',
    published: '2024-08-13',
    datePrecision: 'day',
  },
  {
    id: 'acvp',
    short: 'NIST ACVP',
    title: 'ACVP-Server — ML-DSA FIPS 204 validation vectors',
    publisher: 'NIST',
    url: 'https://github.com/usnistgov/ACVP-Server/tree/975de31eb83d87039ec88934fdc47d8c312b892d/gen-val/json-files',
    kind: 'vectors',
    published: '2026-08-12',
    datePrecision: 'day',
    identifier: 'release v1.1.0.43, commit 975de31eb83d87039ec88934fdc47d8c312b892d',
  },
  {
    id: 'dilithium-r3',
    short: 'Dilithium round 3',
    title: 'CRYSTALS-Dilithium — Algorithm Specifications and Supporting Documentation (v3.1)',
    publisher: 'pq-crystals.org (NIST PQC round-3 submission)',
    url: 'https://pq-crystals.org/dilithium/data/dilithium-specification-round3-20210208.pdf',
    kind: 'submission',
    published: '2021-02-08',
    datePrecision: 'day',
    status: 'Competition submission — superseded by FIPS 204, not the standard',
  },
  {
    id: 'nistir8547',
    short: 'NIST IR 8547 (final)',
    title: 'NIST IR 8547: Transition to Post-Quantum Cryptography Standards',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/ir/8547/final',
    kind: 'guidance',
    published: '2026-10-27',
    datePrecision: 'day',
    identifier: 'doi:10.6028/NIST.IR.8547',
  },
  {
    id: 'nistir8240',
    short: 'NIST IR 8240',
    title:
      'NIST IR 8240: Status Report on the First Round of the NIST Post-Quantum ' +
      'Cryptography Standardization Process',
    publisher: 'NIST',
    url: 'https://nvlpubs.nist.gov/nistpubs/ir/2019/NIST.IR.8240.pdf',
    kind: 'report',
    // The document is dated "January 2019" and nothing finer -- on its cover
    // page, in its CSRC record and in the DOI landing data. There is no day to
    // record, so none is recorded.
    published: '2019-01',
    datePrecision: 'month',
    identifier: 'NISTIR 8240, doi:10.6028/NIST.IR.8240',
  },
  {
    id: 'noble-pq',
    short: '@noble/post-quantum',
    title: '@noble/post-quantum — auditable JS implementation of FIPS 203/204/205',
    publisher: 'Paul Miller',
    url: 'https://github.com/paulmillr/noble-post-quantum',
    kind: 'library',
    published: '2026-09-20',
    datePrecision: 'day',
    identifier: 'version read from package-lock.json at build time',
  },
];

export interface Claim {
  id: string;
  /** What the demo asserts, in one sentence. */
  statement: string;
  sourceId: string;
  /** Where inside the source, e.g. "Table 2" or "§3.6.2". */
  locator: string;
  /** Set when a second source qualifies or corrects the first. */
  qualifiedBy?: { sourceId: string; locator: string; note: string };
}

export const CLAIMS: Record<string, Claim> = {
  refinedMsis: {
    id: 'refinedMsis',
    statement: 'The 16 October 2026 revision reports Dilithium attack-cost estimates 3.65–6.09 bits below its conservative Core-SVP baseline; these are model-dependent estimates, not production-key recovery.',
    sourceId: 'msis-2026',
    locator: 'Abstract and revised MSIS security-estimation analysis',
  },
  sizes: {
    id: 'sizes',
    statement:
      'Public-key, private-key and signature sizes in bytes for ML-DSA-44, ML-DSA-65 and ML-DSA-87.',
    sourceId: 'fips204',
    locator: 'Table 2',
  },
  parameters: {
    id: 'parameters',
    statement:
      'q, ζ, d, τ, λ, γ₁, γ₂, (k, ℓ), η, β and ω for each ML-DSA parameter set.',
    sourceId: 'fips204',
    locator: 'Table 1',
  },
  categories: {
    id: 'categories',
    statement:
      'ML-DSA-44 is claimed to be in NIST security strength category 2, ML-DSA-65 in category 3 and ML-DSA-87 in category 5.',
    sourceId: 'fips204',
    locator: '§4 and Table 1',
  },
  notOneNumber: {
    id: 'notOneNumber',
    statement:
      'FIPS 204 describes security strength by category, not by a single bit count: “security strength is not described by a single number, such as ‘128 bits of security.’”',
    sourceId: 'fips204',
    locator: '§4',
  },
  secretSampling: {
    id: 'secretSampling',
    statement:
      'The coefficients of s₁ and s₂ are drawn uniformly from the interval [−η, η] by rejection sampling.',
    sourceId: 'fips204',
    locator: 'Algorithms 15, 31 and 33',
  },
  repetitions: {
    id: 'repetitions',
    statement:
      'Expected repetitions of the signing loop are 4.25, 5.1 and 3.85 for ML-DSA-44, -65 and -87.',
    sourceId: 'fips204',
    locator: 'Table 1',
    qualifiedBy: {
      sourceId: 'fips204-errata',
      locator: 'entry dated 2026-07-31, “Sec. 4 and App. C”',
      note:
        'NIST records that these numbers "are not quite accurate" because line 28 of Algorithm 7 ' +
        'had not been accounted for, and that Table 1 will be updated to 4.36, 5.14 and 3.91. ' +
        'This is a potential correction, not yet an official change to the standard.',
    },
  },
  contextLimit: {
    id: 'contextLimit',
    statement: 'A context string longer than 255 bytes is an error; signing and verification return ⊥.',
    sourceId: 'fips204',
    locator: 'Algorithms 2 and 3, line 1',
  },
  lengthChecks: {
    id: 'lengthChecks',
    statement:
      'An implementation that can accept a σ or pk of another length shall return false whenever the length differs from the standard’s.',
    sourceId: 'fips204',
    locator: '§3.6.2',
  },
  prehashStrength: {
    id: 'prehashStrength',
    statement:
      'A pre-hash digest must provide at least λ bits of classical collision strength, which requires a digest of at least 2λ bits.',
    sourceId: 'fips204',
    locator: '§5.4 and footnote 6',
  },
  randomness: {
    id: 'randomness',
    statement:
      'The 256-bit key-generation seed ξ shall be fresh and generated by an approved RBG; rnd in the default hedged signing variant is generated by an RBG as a side-channel and fault countermeasure.',
    sourceId: 'fips204',
    locator: '§3.6.1',
  },
  intermediateValues: {
    id: 'intermediateValues',
    statement:
      'Implementations shall ensure that potentially sensitive intermediate data is destroyed as soon as it is no longer needed.',
    sourceId: 'fips204',
    locator: '§3.6.3',
  },
  identityBinding: {
    id: 'identityBinding',
    statement:
      'A signature is bound to an identity only through separate assurances: binding a public key to an identity requires proof of possession, and in a PKI that means certificate issuance.',
    sourceId: 'fips204',
    locator: '§3.5',
  },
  hardness: {
    id: 'hardness',
    statement: 'ML-DSA security rests on the Module-LWE and Module-SIS lattice problems.',
    sourceId: 'fips204',
    locator: '§3.2',
  },
  primaryStandard: {
    id: 'primaryStandard',
    statement:
      'FIPS 204 is intended as the primary standard for protecting digital signatures; FIPS 205 is intended as a backup in case ML-DSA proves vulnerable.',
    sourceId: 'nist-pqc-release',
    locator: '13 Aug 2024',
  },
  lineage: {
    id: 'lineage',
    statement:
      'ML-DSA was standardized from the CRYSTALS-Dilithium submission, whose round-3 specification is a different document with different encodings.',
    sourceId: 'dilithium-r3',
    locator: 'Fig. 4 (Sign/Verify) and Table 1',
  },
  round3Sizes: {
    id: 'round3Sizes',
    statement:
      'Round-3 CRYSTALS-Dilithium signature sizes are 2420, 3293 and 4595 bytes — the last two differ from final ML-DSA.',
    sourceId: 'dilithium-r3',
    locator: 'Table 1',
  },
  round3CoreSvp: {
    id: 'round3CoreSvp',
    statement:
      'The Quantum Core-SVP estimates in the round-3 submission are 112, 165 and 229 bits for NIST levels 2, 3 and 5.',
    sourceId: 'dilithium-r3',
    locator: 'Table 1',
    qualifiedBy: {
      sourceId: 'fips204',
      locator: '§4',
      note:
        'These are competition-era Core-SVP estimates for CRYSTALS-Dilithium, not a property FIPS 204 ' +
        'states about ML-DSA. FIPS 204 expresses security strength as a category and says explicitly ' +
        'that it "is not described by a single number".',
    },
  },
  transition: {
    id: 'transition',
    statement:
      'NIST’s final transition report deprecates quantum-vulnerable public-key algorithms after 2030 and disallows their use under NIST standards and guidelines after 2035.',
    sourceId: 'nistir8547',
    locator: '§4, Tables 2 and 4',
    qualifiedBy: {
      sourceId: 'nistir8547',
      locator: '§4',
      note: 'Final report published 27 October 2026. Earlier targets remain for prioritized federal systems: key establishment by 31 December 2030 and signatures by 31 December 2031. This is not a universal private-sector deadline.',
    },
  },
  firstRoundCounts: {
    id: 'firstRoundCounts',
    statement:
      'NIST received 82 candidate algorithm submission packages by the 30 November 2017 deadline and accepted 69 of them as complete and proper first-round candidates.',
    sourceId: 'nistir8240',
    locator: '§2.1 Acceptance of the First Round Candidates',
  },
  interop: {
    id: 'interop',
    statement:
      'This build reproduces NIST’s ACVP answers byte-for-byte for all three parameter sets across key generation, signing and verification.',
    sourceId: 'acvp',
    locator: 'ML-DSA-keyGen / sigGen / sigVer FIPS204',
  },
};

/**
 * Differences between round-3 CRYSTALS-Dilithium and final FIPS 204 ML-DSA that
 * are visible in bytes this demo actually produces.
 *
 * These exist so the naming distinction is demonstrable rather than asserted.
 * Every row is checked against the two specifications by
 * `src/__tests__/sources.test.ts`, and the ML-DSA column is checked against the
 * sizes the running implementation emits.
 */
export interface LineageDifference {
  aspect: string;
  round3: string;
  mldsa: string;
  consequence: string;
}

export const LINEAGE_DIFFERENCES: LineageDifference[] = [
  {
    aspect: 'Message formatting',
    round3: 'µ = H(tr ‖ M) — the message is hashed directly',
    mldsa: 'µ = H(tr ‖ M′) where M′ = 0x00 ‖ |ctx| ‖ ctx ‖ M',
    consequence:
      'ML-DSA has a domain separator and an application context string; round-3 Dilithium has neither.',
  },
  {
    aspect: 'Public-key hash tr',
    round3: '256 bits (32 bytes)',
    mldsa: '512 bits (64 bytes)',
    consequence: 'Every ML-DSA private key is 32 bytes larger than its round-3 counterpart.',
  },
  {
    aspect: 'Commitment hash c̃',
    round3: '32 bytes for every parameter set',
    mldsa: 'λ/4 bytes — 32, 48, 64',
    consequence:
      'ML-DSA-65 and ML-DSA-87 signatures are 16 and 32 bytes longer than Dilithium3 and Dilithium5.',
  },
  {
    aspect: 'Signature size',
    round3: '2420 / 3293 / 4595 bytes',
    mldsa: '2420 / 3309 / 4627 bytes',
    consequence:
      'Two of the three differ, so a round-3 signature is not an ML-DSA signature — the names are not interchangeable.',
  },
];

const byId = new Map(SOURCES.map((s) => [s.id, s]));

export function source(id: string): Source {
  const found = byId.get(id);
  if (!found) throw new Error(`unknown source: ${id}`);
  return found;
}

export function claim(id: string): Claim {
  const found = CLAIMS[id];
  if (!found) throw new Error(`unknown claim: ${id}`);
  return found;
}

const DAY_FORM = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_FORM = /^\d{4}-\d{2}$/;

/**
 * The precision the string is actually in, read from its shape alone.
 *
 * This is the half of the check that the `datePrecision` marker is compared
 * AGAINST; it is deliberately not used as a substitute for it.
 */
export function datePrecisionOf(iso: string): DatePrecision | null {
  if (DAY_FORM.test(iso)) return 'day';
  if (MONTH_FORM.test(iso)) return 'month';
  return null;
}

/**
 * Human-readable date for rendering: "13 August 2024" for a day-precision date,
 * "January 2019" for a month-precision one.
 *
 * A month-precision date is never padded to a day on the way to the screen. Pass
 * the record's `datePrecision` as the second argument and a disagreement between
 * the declared precision and the string throws here rather than rendering a date
 * the source does not state.
 */
export function formatDate(iso: string, declared?: DatePrecision): string {
  const shape = datePrecisionOf(iso);
  if (shape === null) throw new Error(`not an ISO date: ${iso}`);
  if (declared !== undefined && declared !== shape) {
    throw new Error(`date ${iso} is ${shape} precision but declares ${declared}`);
  }
  const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', month: 'long', year: 'numeric' };
  if (shape === 'day') options.day = 'numeric';
  const utcDay = shape === 'day' ? iso : `${iso}-01`;
  const parsed = new Date(`${utcDay}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`not a real date: ${iso}`);
  return parsed.toLocaleDateString('en-GB', options);
}
