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

## Project Assurance and Quality Gates

| Document | What it is for |
|---|---|
| [SECURITY.md](SECURITY.md) | How to report a vulnerability, what is in and out of scope, and the table of security properties CI enforces |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Assets, trust boundary, and eight named threats with what is done about each and where it stops |
| [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) | Sixteen limitations in full, including the ones that cannot be fixed in a browser page |
| [.github/CODEOWNERS](.github/CODEOWNERS) | Review required on the crypto path, the claim data, the build gates and the supply chain |
| [EVIDENCE.md](EVIDENCE.md) | Every claim, its primary source, the automated test that keeps it true, and what it still does not prove |

All four are linked from the About tab, and a browser test asserts those links
render and point at this repository.

### Supply chain

- **Every GitHub Action is pinned to an immutable full-commit SHA**, with a
  `# vX.Y.Z` comment so a human can read it and Dependabot can update it.
  `scripts/check-action-pins.mjs` fails CI on a tag pin, a branch pin, a short
  SHA, or a pin with no version comment — each case unit-tested against input
  that must fail.
- **A CycloneDX 1.6 SBOM** is generated from the lockfile in CI and published as
  a build artifact. Written directly rather than adding `@cyclonedx/cyclonedx-npm`:
  a tool to describe the dependency tree would add ~40 packages *to* the
  dependency tree, all of them inside the audit gate.
- **Node and runner are exact.** Node 22 from a single `.nvmrc` via
  `node-version-file`; `ubuntu-24.04`, never `ubuntu-latest`. Tests assert no
  literal `node-version:` and no `-latest` runner survives anywhere.

### Lighthouse budgets

Three runs per CI job:

| Category | Minimum | Combined by |
|---|---|---|
| Performance | 0.90 | median |
| Accessibility | **1.00** | **worst run** |
| Best practices | 0.90 | median |
| SEO | 0.90 | median |

Median for the timing-sensitive categories, because a single run on a shared
runner is noisy enough to fail at random — which trains everyone to re-run CI
until it passes, at which point the gate has stopped being one. Accessibility
is scored from deterministic audits and its threshold is 1.00, so the **worst**
run is the one that matters.

Getting accessibility to 1.00 required fixing two real defects Lighthouse found
that the repo's own axe gate had been blind to:

- **The document had no `main` landmark.** `role="tabpanel"` on `<main>`
  *overrode* its implicit landmark role. The axe gate missed it because
  `landmark-one-main` is a best-practice rule, not a WCAG-tagged one.
- **WCAG 2.5.3 (Label in Name, level A).** The citation links added in
  Priority 4 had visible text "FIPS 204 Table 2" and an accessible name of
  "Source: FIPS 204: Module-Lattice-Based…, Table 2" — the colon breaks the
  substring, so a voice-control user could not activate what they could see.
  The rule is tagged `experimental` in axe-core and off by default; it is now
  explicitly enabled in the gate.

### Browser resilience

`e2e/resilience.spec.ts`, 34 tests:

- **320px, 768px and 1440px** — every tab, plus the signing chain, with a
  horizontal-overflow check at each. This found a real 320px reflow failure the
  380px gate never saw: the two-column info grid cannot hold an unbreakable
  mono value at that width.
- **Forced-colors mode** — the demo still works, verdicts stay distinguishable
  by text rather than colour, fidelity labels still say what they mean, and no
  content is hidden by the forced palette.
- **Reduced motion** — the preference reaches the page, and the Fiat-Shamir
  cards render visibly rather than being left at an animation's start state.
- **Keyboard only** — both skip links, the tablist in both directions including
  wrap plus Home/End, the parameter radiogroup's roving tabindex, the whole
  signing chain driven by Enter, and a visible focus indicator on every control.
- **The complete selector** — all three sets, each updating security category,
  sizes and guidance; real KeyGen → Sign → Verify at that set's own byte counts;
  modified-message and modified-signature rejection for every set.
- **Discoverability** — the security policy, threat model, limitations, sources
  and implementation identity are all reachable from the page.

### Dark and light themes

The stylesheet always carried a complete light palette that **no visitor could
reach** — the page pinned dark unconditionally. Since the shared Crypto Lab
header hides in-page theme toggles fleet-wide, `prefers-color-scheme` is the
only control a visitor has, and it was being ignored. It is now honoured, and
the axe gate runs both themes at both widths — which immediately found the
light-theme amber failing 1.4.3 at 4.27:1 on a small bold label.

## Reproducible Benchmark Evidence

The old panel ran 50 signatures per parameter set in one blocking loop, divided
the total by the elapsed time, and printed an ops/sec figure. No warm-up, so the
first measurements included JIT compilation. No distribution, so one
rejection-heavy outlier moved the answer invisibly. No key-generation or
verification timing at all, no sizes, and **no record of the browser, machine or
clock** — which made the number incomparable with anything, including a second
run on the same laptop.

### Methodology

| | |
|---|---|
| Operations | key generation, signing, verification — for **all three** parameter sets |
| Warm-up | 10 iterations, discarded |
| Measured | 50 iterations, **each timed individually** |
| Reported | median, p95, mean, min, max, n |
| Raw samples | preserved in order, exported in full |
| Percentile method | linear interpolation between closest ranks (R type-7 / NumPy default) |
| Baseline | Ed25519 via Web Crypto, same methodology, **measured in the same run** |

Median and p95 rather than a mean alone because ML-DSA signing is a rejection
loop: the distribution has a long right tail and the mean sits where no
signature actually lands. A typical run shows ML-DSA-44 signing at a 2.2 ms
median against a 5.7 ms p95.

### Every result carries its environment

Browser and version, operating system, logical processors, timer source,
**measured timer resolution**, cross-origin-isolation status, library name and
version, warm-up and sample counts, and a UTC timestamp. There is no code path
that renders or exports a timing without them.

### When the clock is not good enough, it says so

`performance.now()` is deliberately coarsened to 0.1 ms in a page that is not
cross-origin isolated. Ed25519 signs in roughly 50 µs — *below that*. Rather
than print `0.000 ms` and divide by it, the panel reports timings under the
resolution as `< 0.100`, converts the affected speed ratios into explicit
**lower bounds** (`> 30×`), and explains why. Size ratios stay exact.

### Exports

- **JSON** — environment, methodology, summaries and **every raw sample in the
  order taken**. The archival artifact: the summary can be recomputed from the
  samples it claims to describe.
- **CSV** — one row per raw measurement, with the environment repeated on every
  row. Deliberate denormalisation: a metadata header block is lost the moment
  someone sorts the file in a spreadsheet, and a timing separated from the
  machine it came from is not a measurement.

### The interface does not freeze

Control returns to the event loop between iterations, outside the timed bracket.
This is measured rather than argued: a browser test counts animation frames
throughout a full run (~600 operations) and fails if the longest gap between
them exceeds 750 ms, and a second test switches tabs mid-run.

## Real ML-DSA vs the Teaching Models

Every panel carries one of four labels, stated in words next to the panel:

| Label | Meaning |
|---|---|
| **Real FIPS 204 operation** | Runs the actual algorithm on real key material |
| **Real values, visualized** | Numbers measured from a real operation or transcribed from FIPS 204 |
| **Reduced educational model — not the real signer** | Toy parameters, simplified structure |
| **Conceptual — executes no ML-DSA internals** | A diagram or walkthrough |

The label is rendered **before** the panel it labels, so it is seen and read
first; a browser test asserts that DOM ordering.

### What the audit found

- **The Module-LWE panel carried no caveat at all.** It opened *"ML-DSA's public
  key is t = A·s + e"* and then showed a 3×3 integer system modulo 97 with a
  hand-picked secret and a fixed error pattern. It now states that its numbers
  are invented for legibility and gives the real scale — a 6×5 module of
  256-coefficient polynomials modulo 8,380,417, roughly **7,680 secret
  coefficients rather than three** — and says plainly that nothing in it is
  evidence about the real problem's hardness.
- **The Fiat-Shamir panel's caveat was one grey line below its controls.** It now
  carries a model label above it and a **toy-vs-real parameter table** beside it,
  so the gap is a number rather than the word "illustrative".
- **The panel is not actually Fiat-Shamir.** It samples the challenge at random
  instead of hashing μ ‖ w₁, which makes it the *interactive* proof that
  Fiat-Shamir converts. The page now says so, and the comparison table lists what
  the model does not represent at all (hint, public key t, verification).

### The complete parameter table

The About tab previously showed seven columns — the three sizes, the category,
(k, ℓ) and q. Enough to look authoritative; not enough to check anything. It now
carries all nineteen rows of FIPS 204 Table 1 and Table 2: ring dimension,
modulus, ζ, d, (k, ℓ), η, τ, λ, γ₁, γ₂, β, the rejection bound, ω, challenge
entropy, repetitions, security category and all three sizes.

The values are verified **three independent ways**, because re-reading a
transcription makes the same mistake twice:

1. **Internally** — β must equal τ·η, γ₂ must be the stated fraction of q−1, q
   must be 2²³ − 2¹³ + 1, and ζ must really be a 512th root of unity mod q.
2. **Against the standard's own formulas** — FIPS 204 gives the byte lengths
   algebraically in the Input/Output lines of Algorithms 1–3, so all nine sizes
   are *recomputed* from the parameters. A single mistyped parameter breaks at
   least one size.
3. **Against the running implementation**, which must emit exactly those byte
   counts.

## Runtime and Implementation Assurances

The page states exactly what is executing, and every value is derived from
`package-lock.json` at build time — so it cannot drift from what `npm ci`
installed, and it is never the `^0.7.1` range from `package.json`, which is not
a fact about anything that shipped.

| | |
|---|---|
| Library | `@noble/post-quantum`, exact version + npm integrity hash |
| Implementation | Pure JavaScript — no WebAssembly, no native module (**enforced at build time**) |
| Randomness | `crypto.getRandomValues` (Web Crypto API), **no fallback** |
| Hashing inside the crypto path | `@noble/hashes` (SHAKE128/256), version + integrity hash |
| Independent security audit | **None.** The library states "has not been independently audited yet" |
| Self-audit | v0.6.1 (April 2026) — **earlier than the version shipped**, so it does not cover it |
| CMVP / FIPS 140 validation | **None** |

The audit claim is pinned by a test that reads the library's own README, so if
it is ever independently audited the suite fails and a human updates the claim
rather than the page silently under- or over-stating the assurance.

The "pure JavaScript" claim is enforced by a Vite plugin (`build/purity.ts`)
that inspects the bundle it is emitting and **fails the build** if a `.wasm`
asset appears or anything calls `WebAssembly.instantiate`/`compile`/`Module` or
a native addon loader. It distinguishes the API call from the word: the page's
own sentence saying there is no WebAssembly must not trip it.

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
