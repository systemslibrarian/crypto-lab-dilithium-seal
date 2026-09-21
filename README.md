# crypto-lab-dilithium-seal

## What It Is

This project is a browser demo for **ML-DSA**, including the ML-DSA-44, ML-DSA-65, and ML-DSA-87 parameter sets from NIST FIPS 204. ML-DSA is the standard; **CRYSTALS-Dilithium** is the competition submission it was standardized from, and the two are not interchangeable — see *Provenance and terminology* below. It demonstrates digital signature creation and verification, plus document sealing and tamper checks using the same primitive. The algorithm solves the problem of authenticating messages and proving integrity in a way intended to remain secure against quantum adversaries. ML-DSA is an asymmetric, post-quantum digital signature scheme based on lattice assumptions (Module-LWE and Module-SIS).

The "How It Works" tab now opens with a plain-language "prove you know a secret without revealing it" scaffold, then lets you drive the concepts yourself: an **interactive Fiat-Shamir-with-aborts animation** where pressing *Sign* runs the real reject-and-retry loop — rejecting oversized responses `z = y + c·s₁` that would leak the secret and showing the reject count — and an **interactive Module-LWE panel** with an error slider that flips the problem between trivially solvable (`e = 0`) and quantum-hard. These visualizations compute real modular lattice arithmetic in the browser at an illustrative small scale; the spec-accurate, KAT-backed signing/verification path is unchanged (`@noble/post-quantum`, FIPS 204). The seal demo's tamper flow now separates the two lessons explicitly — the ML-DSA signature alone catches an edit even when the SHA-256 hash is recomputed to agree — so learners see that authenticity comes from the signature, not the hash.

## When to Use It

- Use it for certificate and identity-signing workflows that need post-quantum migration planning. It fits because ML-DSA is standardized (FIPS 204) and designed for public-key authentication.
- Use it for software and artifact signing where verifiable integrity and signer authenticity are required. It fits because the signature can be checked by anyone with the public key.
- Use it for browser-based training or proof-of-concept work that compares classical and post-quantum signatures. It fits because the demo exposes parameter-set tradeoffs and benchmark behavior.
- Do not use this demo implementation as a production key-management system. It is educational and does not provide hardened storage, policy controls, or operational safeguards.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/)**

The demo lets you generate keys, sign and verify messages, seal documents, and compare ML-DSA against classical and other PQ signature schemes. You can interact with parameter-set controls (ML-DSA-44, ML-DSA-65, ML-DSA-87), message/document inputs, and a benchmark runner that executes fixed signing iterations. It also includes educational tabs explaining the construction and where ML-DSA fits in the NIST PQC trio.

## Provenance and Terminology

Every factual claim the demo makes about ML-DSA is registered in
`src/data/sources.ts` against the primary document it comes from, with the
locator inside that document, and rendered next to the claim as a link. A
standards-status strip sits between the hero and the tab bar on **every** tab,
so the edition, the errata state and the review date are readable without
opening this file.

| | |
|---|---|
| Edition implemented | FIPS 204, initial public version, 13 August 2024 |
| Errata incorporated | **None** — no errata update or revision has been issued |
| Errata spreadsheet reviewed | 31 July 2026 |
| Standards reviewed | 2026-09-20 |

NIST maintains a *potential updates (errata)* spreadsheet for FIPS 204 whose own
header says the entries "ARE NOT official changes, but may be corrected in a
future errata update." One entry matters here: it records that Table 1's
expected repetition counts (4.25, 5.1, 3.85) "are not quite accurate" and will
become **4.36, 5.14, 3.91**. The demo shows the published figures, the pending
ones, and the fact that the correction is not yet official.

### Two claims that were wrong

- **"ML-DSA-65 … approximately 165-bit post-quantum security."** That number
  appears nowhere in FIPS 204. It is the *Quantum Core-SVP* estimate from
  Table 1 of the round-3 CRYSTALS-Dilithium submission — a competition-era
  figure — and FIPS 204 §4 says in terms that security strength here "is not
  described by a single number, such as '128 bits of security.'" The page now
  states the security *category*, quotes FIPS 204's refusal, and attributes the
  Core-SVP figure to the submission where it belongs.
- **"the Dilithium specification's expected repetition counts are 4.25, 5.1 and
  3.85."** Those are FIPS 204 Table 1's numbers, not the submission's, and NIST
  has since recorded them as inaccurate.

### CRYSTALS-Dilithium is not a synonym for ML-DSA

The difference is visible in bytes this demo produces:

| Aspect | Round 3 (2021) | ML-DSA (FIPS 204) |
|---|---|---|
| Message formatting | µ = H(tr ‖ M) | µ = H(tr ‖ M′), M′ = 0x00 ‖ \|ctx\| ‖ ctx ‖ M |
| Public-key hash `tr` | 256 bits | 512 bits → every private key is 32 B larger |
| Commitment hash `c̃` | 32 B for every set | λ/4 B — 32, 48, 64 |
| Signature size | 2420 / **3293** / **4595** | 2420 / **3309** / **4627** |

Two of the three signature sizes differ, so a round-3 signature is not an ML-DSA
signature. A test signs with each parameter set and asserts the length is the
FIPS 204 one and *not* the round-3 one, so this stays demonstrated rather than
asserted.

Drafts are labelled as drafts. NIST IR 8547, the transition-timeline document,
is still an **Initial Public Draft**, and the page says so wherever its dates
appear.

## Runtime and Implementation Assurances

The page states exactly what is executing, and every value is derived from
`package-lock.json` at build time — so it cannot drift from what `npm ci`
installed, and it is never the `^0.7.1` range from `package.json`, which is not
a fact about anything that shipped.

| | |
|---|---|
| Library | `@noble/post-quantum`, exact version + npm integrity hash |
| Implementation | Pure JavaScript — no WebAssembly, no native module |
| Randomness | `crypto.getRandomValues` (Web Crypto API), **no fallback** |
| Hashing inside the crypto path | `@noble/hashes` (SHAKE128/256), version + integrity hash |
| Independent security audit | **None.** The library states "has not been independently audited yet" |
| Self-audit | v0.6.1 (April 2026) — **earlier than the version shipped**, so it does not cover it |
| CMVP / FIPS 140 validation | **None** |

The audit claim is pinned by a test that reads the library's own README, so if
it is ever independently audited the suite fails and a human updates the claim
rather than the page silently under- or over-stating the assurance.

### Fails closed on randomness

`src/crypto/random.ts` is the only source of randomness for real operations, and
it has no fallback path. If `crypto.getRandomValues` is missing, throws, or is
stubbed to return zeros, key generation and hedged signing **stop** and the page
says why. Verification keeps working, because it needs no randomness.

`Math.random` appears exactly once in this repository — in
`src/ui/fiat-shamir-viz.ts`, the reduced teaching model. A test scans every
source file (with comments and string literals stripped, so the rule does not
fire on its own documentation), allows that one file, and asserts the allowance
is not dead.

### Limitations, on the page rather than in a comment

Six, each rendered in full on the About tab, because each one changes what you
should conclude from a ✓ VERIFIED badge:

1. **JavaScript execution is not guaranteed constant-time.** Quoted from the
   library: it "does not claim constant-time execution". ML-DSA signing uses a
   rejection loop and early-exit norm checks whose execution depends on
   secret-key state.
2. **Secrets cannot be reliably erased from garbage-collected memory** — which
   is what FIPS 204 §3.6.3 requires.
3. **Browser extensions and a compromised page are outside the trust boundary.**
   The CSP narrows what injected content can load; it cannot defend against code
   the browser was told to run.
4. **Passing known-answer vectors is not an audit and not a validation.**
5. **A valid signature does not by itself establish who signed** — FIPS 204 §3.5:
   binding a public key to an identity requires proof of possession.
6. **Key generation and signing depend on the browser's RBG.**

A browser test asserts all six render with substantive text, and that no page
ever calls the demo NIST-validated, CMVP-validated or FIPS-certified.

## FIPS 204 Conformance Evidence

The signing and verification path is checked against **NIST's own ACVP vectors**
for all three final parameter sets — ML-DSA-44, ML-DSA-65 and ML-DSA-87 — pinned
to an immutable upstream:

| | |
|---|---|
| Source | [usnistgov/ACVP-Server](https://github.com/usnistgov/ACVP-Server) |
| Release | `v1.1.0.43` |
| Commit | `975de31eb83d87039ec88934fdc47d8c312b892d` |
| Integrity | SHA-256 per upstream file **and** per vendored subset, in `vectors/acvp/manifest.json` |

**CI downloads nothing.** The vendored files are digest-checked against the
manifest before a single vector is used, so editing the test data fails as
loudly as a broken implementation. See `vectors/acvp/SOURCE.md` for the
deterministic subset rule (every upstream *test group* is retained; only
repetitions within a group are dropped).

### Modes covered

| | ML-DSA-44 | ML-DSA-65 | ML-DSA-87 |
|---|---|---|---|
| KeyGen (seed → pk, sk, and pk re-derived from sk) | ✓ | ✓ | ✓ |
| Sign — deterministic | ✓ | ✓ | ✓ |
| Sign — hedged (with NIST's `rnd`) | ✓ | ✓ | ✓ |
| Sign/Verify — external interface, pure | ✓ | ✓ | ✓ |
| Sign/Verify — external interface, pre-hash (HashML-DSA) | ✓ | ✓ | ✓ |
| Sign/Verify — internal interface | ✓ | ✓ | ✓ |
| Sign/Verify — internal interface, external µ | ✓ | ✓ | ✓ |
| Context strings | ✓ | ✓ | ✓ |

### One real divergence, tested in both directions

FIPS 204 §5.4 (footnote 6) requires a pre-hash digest to give at least λ bits of
collision strength — at least 2λ bits of digest. ACVP *also* generates pairings
below that bound (ML-DSA-87 with SHA2-224, say), because Algorithm 4 "may be
used with other hash functions or XOFs". `@noble/post-quantum` takes the strict
reading and **refuses** them.

Both halves are asserted: a pairing that meets the bound must reproduce NIST's
answer byte-for-byte; one that does not must be refused rather than silently
signed. 67 of the upstream pre-hash cases fall in the second category, and every
one of them is exactly predicted by the §5.4 rule — there are no unexplained
mismatches.

### Negative tests

`src/__tests__/malformed-inputs.test.ts`, for every parameter set:

- a single flipped **bit** at sampled positions across c̃, z and h
- truncated signatures (0, 1, half, n−1 bytes) and extended ones (+1, +8, +64)
- a different public key of the correct length
- a modified message, down to one bit; plus appended, truncated and empty
- malformed public-key **lengths**, including another parameter set's
- malformed signature **lengths**, including another parameter set's
- invalid hint encodings: the region saturated, and a cumulative count above ω
- a `z` driven outside the γ₁ − β norm bound
- all-zero and all-ones signatures of exactly the right length
- context strings over the 255-byte limit, in both sign and verify
- context binding: a signature made under a context must not verify without it
- library-specific: non-byte-array inputs, a misspelled option key, a
  wrong-length secret key

**FIPS 204 §3.6.2** says an implementation "shall return false whenever the
lengths" of σ or pk differ from the standard's. `@noble/post-quantum` does that
for σ but *throws* a `RangeError` for pk. Neither is unsafe — both refuse — but
only one is the contract the standard asks for, so `src/crypto/mldsa.ts` carries
its own length checks and the wrapper returns `false` for both. The library's
throwing behaviour is pinned by a test too, so a future change is noticed rather
than silently making the wrapper redundant.

### What this proves, and what it does not

Reproducing NIST's published answers byte-for-byte is evidence of
**interoperability**. It is **not** a validation: not a CMVP certificate, not a
FIPS 140 validation, not an independent security audit, and not evidence of
constant-time behaviour. A validated module is one tested by an accredited
laboratory under a defined operational environment; a passing vector file says
only that the arithmetic agrees. This project does not describe itself as
NIST-validated, CMVP-validated or FIPS-certified, and must not.

## Browser Security Boundary

The page ships a restrictive Content-Security-Policy:

```
default-src 'none';
script-src  'self' 'sha256-…' 'sha256-…';
style-src   'self' 'sha256-…';
img-src     'self' data:;
base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'
```

`default-src 'none'` denies every fetch type not named. There is deliberately no
`connect-src`, `worker-src`, `frame-src`, `media-src` or `font-src`: each falls
through to the deny-all default, because this demo makes **no network request
after load** — no analytics, no telemetry, no CDN, no remote font. The two inline
`<script>` blocks and the one inline `<style>` block are allowed by SHA-256 hash,
computed at build time from the *emitted* bytes (`build/csp.ts`), so the policy
cannot drift from the markup. No `'unsafe-inline'`, `'unsafe-eval'` or
`'unsafe-hashes'` appears anywhere in it, and the build fails if one is added.

### What a meta-delivered CSP cannot do

GitHub Pages serves this site with a fixed set of response headers and offers no
way to add one, so the policy is delivered in a `<meta http-equiv>` element. That
is **strictly weaker** than an HTTP response header, in four specific ways:

1. **`frame-ancestors` is ignored.** Per CSP Level 3, a meta-delivered policy
   silently drops it — so this page cannot prevent being framed by another site,
   and a header-based `X-Frame-Options` is equally unavailable. The directive is
   written anyway, so that it starts working the day this is served from
   somewhere that can set headers. Chromium logs a console notice about it; the
   e2e gate asserts that notice appears, so the limitation cannot quietly lapse.
2. **`report-uri` / `report-to` are ignored.** There is no violation telemetry,
   by construction as well as by limitation — see the no-analytics rule above.
3. **`sandbox` is ignored.**
4. **The policy only applies from the point the parser reaches it.** Anything
   earlier in `<head>` is unprotected. The meta is placed immediately after
   `<title>`, ahead of every script and stylesheet on the page.

A fifth limit is not about meta delivery at all: the UI is built with
`innerHTML`, so `require-trusted-types-for 'script'` cannot be enforced without
rewriting the rendering layer. That is a real residual risk, not a formality —
the policy stops injected content from *loading code*, but it does not stop
injected markup from being written into the page in the first place.

### Tests

- `e2e/csp.spec.ts` asserts the exact directive list, that no unsafe token or
  remote origin appears, that there is exactly one hash per inline block, and —
  the part that distinguishes *shipped* from *working* — that an injected remote
  script and an injected inline script are both refused by the browser.
- The same spec drives all five tabs, every parameter set, the benchmark, both
  visualizations and the seal export while **aborting** any off-origin request,
  and fails if one is attempted.
- `src/__tests__/csp-build.test.ts` covers the build gate: unfilled placeholder,
  unsafe token, missing hardening directive, an inline block no hash covers, a
  stale hash for a deleted block, and a remote origin in the policy all fail the
  build.

## What Can Go Wrong

- **Variable-time signing leaks timing.** ML-DSA uses a rejection-sampling loop, so signing time varies; without hardening this can be a side-channel in adversarial environments.
- **Large keys and signatures.** ML-DSA public keys and signatures are far larger than Ed25519 or ECDSA, which can strain certificates, handshakes, and storage during migration.
- **Randomness and hedged signing.** Faulty randomness in the hedged variant, or fault injection during signing, can weaken security; deterministic and hedged modes carry different tradeoffs.
- **Implementation immaturity.** ML-DSA toolchains, libraries, and hardware support are still maturing relative to classical signatures, raising interoperability and side-channel risk.
- **Migration gaps.** Deploying ML-DSA alone (rather than a classical + PQC hybrid) assumes the new scheme has no undiscovered flaws; many deployments prefer composite signatures during transition.

## Real-World Usage

- **NIST standardization.** ML-DSA is the primary post-quantum digital signature standard (FIPS 204, 2024), selected from the CRYSTALS-Dilithium submission.
- **PQC migration planning.** Organizations evaluate ML-DSA for code signing, firmware signing, and document signing as part of long-horizon quantum-readiness roadmaps.
- **Certificates and PKI.** ML-DSA is being profiled for X.509 certificates and protocol authentication so identities survive a future cryptographically relevant quantum computer.
- **High-assurance and government guidance.** ML-DSA appears in transition guidance such as NSA's CNSA 2.0 suite for authentication in national-security systems.
- **Hybrid signatures.** ML-DSA is frequently paired with a classical signature (e.g., Ed25519) in composite constructions so a flaw in either scheme alone does not break authentication.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-dilithium-seal
cd crypto-lab-dilithium-seal
npm install
npm run dev
```

## Related Demos

- [crypto-lab-dilithium-reject](https://systemslibrarian.github.io/crypto-lab-dilithium-reject/) — visualizes the ML-DSA rejection-sampling loop behind this primitive.
- [crypto-lab-falcon-seal](https://systemslibrarian.github.io/crypto-lab-falcon-seal/) — Falcon (FN-DSA), the compact lattice signature alternative.
- [crypto-lab-sphincs-ledger](https://systemslibrarian.github.io/crypto-lab-sphincs-ledger/) — SLH-DSA (FIPS 205), the hash-based PQC signature.
- [crypto-lab-kyber-vault](https://systemslibrarian.github.io/crypto-lab-kyber-vault/) — ML-KEM (FIPS 203), the lattice KEM in the same NIST PQC trio.
- [crypto-lab-hybrid-sign](https://systemslibrarian.github.io/crypto-lab-hybrid-sign/) — composite Ed25519 + ML-DSA-65 signatures for migration.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
