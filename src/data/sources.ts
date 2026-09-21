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

export type SourceKind = 'standard' | 'errata' | 'vectors' | 'submission' | 'guidance' | 'library';

export interface Source {
  id: string;
  /** Short label rendered next to a claim, e.g. "FIPS 204 Tbl 1". */
  short: string;
  title: string;
  publisher: string;
  url: string;
  kind: SourceKind;
  /** Edition or publication date of the exact document version cited (ISO). */
  published: string;
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
 * update." One of those entries changes a number this demo displays, so the
 * distinction is load-bearing rather than pedantic — see `CLAIMS.repetitions`.
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
    id: 'fips204',
    short: 'FIPS 204',
    title: 'FIPS 204: Module-Lattice-Based Digital Signature Standard',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/fips/204/final',
    kind: 'standard',
    published: '2024-08-13',
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
  },
  {
    id: 'fips205',
    short: 'FIPS 205',
    title: 'FIPS 205: Stateless Hash-Based Digital Signature Standard',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/fips/205/final',
    kind: 'standard',
    published: '2024-08-13',
  },
  {
    id: 'nist-pqc-release',
    short: 'NIST announcement',
    title: 'NIST Releases First 3 Finalized Post-Quantum Encryption Standards',
    publisher: 'NIST',
    url: 'https://www.nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-encryption-standards',
    kind: 'guidance',
    published: '2024-08-13',
  },
  {
    id: 'acvp',
    short: 'NIST ACVP',
    title: 'ACVP-Server — ML-DSA FIPS 204 validation vectors',
    publisher: 'NIST',
    url: 'https://github.com/usnistgov/ACVP-Server/tree/975de31eb83d87039ec88934fdc47d8c312b892d/gen-val/json-files',
    kind: 'vectors',
    published: '2026-08-12',
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
    status: 'Competition submission — superseded by FIPS 204, not the standard',
  },
  {
    id: 'nistir8547',
    short: 'NIST IR 8547 (draft)',
    title: 'NIST IR 8547: Transition to Post-Quantum Cryptography Standards',
    publisher: 'NIST',
    url: 'https://csrc.nist.gov/pubs/ir/8547/ipd',
    kind: 'guidance',
    published: '2024-11-12',
    status: 'Initial Public Draft — not final guidance',
  },
  {
    id: 'noble-pq',
    short: '@noble/post-quantum',
    title: '@noble/post-quantum — auditable JS implementation of FIPS 203/204/205',
    publisher: 'Paul Miller',
    url: 'https://github.com/paulmillr/noble-post-quantum',
    kind: 'library',
    published: '2026-09-20',
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
    locator: '§3.4 and §4',
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
      'NIST’s expected transition timeline deprecates 112-bit-strength classical algorithms after 2030 and disallows them after 2035.',
    sourceId: 'nistir8547',
    locator: 'Tables 1 and 2',
    qualifiedBy: {
      sourceId: 'nistir8547',
      locator: 'status',
      note: 'NIST IR 8547 is an Initial Public Draft. These dates are proposed, not final guidance.',
    },
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

/** Human-readable date for rendering, e.g. "13 August 2024". */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
