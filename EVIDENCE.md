# Evidence table

Every factual claim this project makes, the primary source it comes from, the
automated test that keeps it true, and what it still does **not** prove.

A claim with no test in the third column is not maintained by this project, and
none appear below. A claim with nothing in the fourth column would be a claim
with no limits, and none appear below either.

Counts as of this commit: **285 unit tests** in 11 files and **123 browser
tests** in 9 files, plus two build-time policy gates that fail `npm run build`
rather than a test — CSP integrity (`build/csp.ts`) and bundle purity
(`build/purity.ts`) — and two CI scripts that fail the pipeline
(`check-action-pins.mjs`, `generate-sbom.mjs`).

**Scope note, up front:** this project is **not** NIST-validated, **not**
CMVP-validated and **not** FIPS-certified, and a browser test asserts it never
says otherwise. Reproducing NIST ACVP vectors is interoperability evidence. It
is not a validation.

---

## 1. Cryptographic operation

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 1.1 | The signing path executes **final FIPS 204 ML-DSA**, not round-3 CRYSTALS-Dilithium and not a simulation | FIPS 204 §5–§7 | `acvp-conformance.test.ts` — 156 NIST ACVP cases across 39 test groups reproduce NIST's answers byte-for-byte | Interoperability only. Says nothing about side channels or code paths a vector file never reaches |
| 1.2 | Public-key, private-key and signature sizes per parameter set | FIPS 204 Table 2 | `parameters.test.ts` recomputes all nine from Table 1 parameters using the standard's own formulas, then checks them against bytes the implementation emits; `claims.spec.ts` checks the rendered table | — |
| 1.3 | Full parameter set: n, q, ζ, d, (k,ℓ), η, τ, λ, γ₁, γ₂, β, ω | FIPS 204 Table 1, §2.3 | `parameters.test.ts` — β = τ·η, γ₂ as a fraction of q−1, q = 2²³−2¹³+1, and ζ verified by modular exponentiation to be a real 512th root of unity | Transcribed from the PDF; the three independent checks make an undetected error unlikely, not impossible |
| 1.4 | NIST security strength categories 2 / 3 / 5 | FIPS 204 §4 and Table 1 | `parameters.test.ts`, `resilience.spec.ts` (selector updates category) | A *claimed* category, as FIPS 204 words it — not a proof |
| 1.5 | Security strength is **not** expressible as a single bit count | FIPS 204 §4, quoted | `provenance.spec.ts` — the page must quote it and must not present the round-3 Core-SVP figure as an ML-DSA property | — |
| 1.6 | A context string over 255 bytes is an error | FIPS 204 Algorithms 2–3, line 1 | `malformed-inputs.test.ts` — refused in both sign and verify, per parameter set | The UI itself only ever signs with the empty context |
| 1.7 | A wrong-length σ or pk returns **false**, never throws | FIPS 204 §3.6.2 | `malformed-inputs.test.ts` — every wrong length including other parameter sets'; the library's own throwing behaviour is pinned separately | The wrapper supplies this; `@noble/post-quantum` throws for pk |
| 1.8 | Pre-hash digests must give ≥ λ bits of collision strength | FIPS 204 §5.4 fn. 6 | `acvp-conformance.test.ts` — compliant pairings must match NIST exactly; **67** non-compliant ones must be refused, every one predicted by the rule | The library's strict reading differs from ACVP's; an application needing weaker pairings needs a different library |
| 1.9 | Every malformed input fails safe | FIPS 204 §3.6.2 | `malformed-inputs.test.ts` — single flipped **bits** across c̃/z/h, truncation, extension, wrong key, invalid hint encodings, `z` outside γ₁−β, all-zero and all-ones signatures | Coverage is a sample of bit positions, not exhaustive |

## 2. Browser security boundary

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 2.1 | A deny-by-default CSP is **enforced**, not merely present | CSP Level 3 | `csp.spec.ts` injects a remote script and an inline script and requires the browser to refuse both. Removing the meta fails 5 of 5 policy tests | Delivered by `<meta>`: `frame-ancestors`, reporting and `sandbox` are ignored |
| 2.2 | No `'unsafe-inline'`, `'unsafe-eval'` or `'unsafe-hashes'`; no remote origin | — | `build/csp.ts` **fails the build**; `csp-build.test.ts` covers each failure mode | — |
| 2.3 | No third-party runtime request of any kind | — | `csp.spec.ts` drives all five tabs, every parameter set, the benchmark and the exports with off-origin requests **aborted**, and asserts none was attempted | — |
| 2.4 | Pure JavaScript — no WebAssembly, no native addon | — | `build/purity.ts` inspects the emitted bundle and **fails the build**; the rule is unit-tested, including that the page's own "no WebAssembly" sentence must not trip it | — |
| 2.5 | Injected markup cannot execute | — | `csp.spec.ts` | The UI uses `innerHTML`, so **Trusted Types cannot be enforced**. Content is escaped and the policy blocks code loading, but this is a real residual risk |
| 2.6 | A browser extension cannot be defended against | — | *(none — stated, not defended)* | Documented in THREAT-MODEL T6 and on the page. Unfixable in a web page |

## 3. Randomness

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 3.1 | Key generation and hedged signing use `crypto.getRandomValues` and **stop** if it is unavailable | FIPS 204 §3.6.1 | `runtime.test.ts` — missing, throwing and zero-returning RBGs; `runtime.spec.ts` asserts the browser shows the refusal and no key material appears | If the browser's RBG is weak or backdoored, keys are weak and the page cannot detect it |
| 3.2 | Verification still works without an RBG | — | `runtime.spec.ts` verifies a previously-exported seal with `getRandomValues` removed | — |
| 3.3 | `Math.random` appears nowhere in the cryptographic path | — | `runtime.test.ts` scans every source file with comments and string literals stripped, allows only the teaching model by name, and asserts that allowance is not dead | — |

## 4. Provenance, freshness and terminology

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 4.1 | FIPS 204, initial public version, 13 August 2024; **no errata update incorporated** | FIPS 204 publication page | `sources.test.ts`; `provenance.spec.ts` asserts it renders on every tab | — |
| 4.2 | NIST's errata spreadsheet (31 July 2026) records Table 1's repetition counts as *"not quite accurate"*, to become 4.36 / 5.14 / 3.91 | FIPS 204 potential-updates spreadsheet | `sources.test.ts`, `fidelity.spec.ts` — published **and** pending values must both render, with the fact that the correction is not yet official | A pending correction, not a change to the standard |
| 4.3 | Standards last reviewed 2026-09-20 | — | `sources.test.ts` (real, non-future date); `provenance.spec.ts` (renders) | A date a human asserts. It will go stale without anyone noticing |
| 4.4 | "CRYSTALS-Dilithium" and "ML-DSA" are not interchangeable | Round-3 spec vs FIPS 204 | `sources.test.ts` and `provenance.spec.ts` — the page signs and asserts the FIPS 204 size (3309/4627) and **not** the round-3 size (3293/4595) | — |
| 4.5 | The "165-bit" figure is a **round-3 Core-SVP estimate**, not a FIPS 204 property | Round-3 spec Table 1 | `provenance.spec.ts` forbids the affirmative ML-DSA framing and requires the round-3 attribution wherever the number appears | — |
| 4.6 | Drafts are labelled as drafts | NIST IR 8547 status page | `sources.test.ts`, `provenance.spec.ts` | NIST IR 8547 remains an Initial Public Draft; its dates are proposed |
| 4.7 | Every important claim links to its primary source | — | `sources.test.ts` (no claim without a source, no source nothing cites); `provenance.spec.ts` (every citation resolves, with a WCAG 2.5.3-compliant name) | Source URLs are not checked at run time; a NIST reorganisation would break them silently |

## 5. Implementation identity

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 5.1 | The version shown is the version installed | `package-lock.json` | `runtime.test.ts` re-reads the lockfile and requires the injected value to match; `runtime.spec.ts` compares two independent renderings | — |
| 5.2 | The library has **not** been independently audited | Library README, quoted | `runtime.test.ts` reads that README — an eventual audit **fails the suite** so a human updates the claim | — |
| 5.3 | The self-audit (v0.6.1) predates the shipped version | Library README | `runtime.test.ts` | — |
| 5.4 | No CMVP certificate, no FIPS 140 validation | — | `runtime.spec.ts` asserts no page ever says NIST-validated, CMVP-validated or FIPS-certified | — |

## 6. Limitations that hold regardless

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 6.1 | Execution is **not** guaranteed constant-time | Library README, quoted | `runtime.spec.ts` — the limitation must render; no page may assert the property | No mitigation exists here. Use a native constant-time implementation if this is your threat model |
| 6.2 | Secrets cannot be reliably erased from GC'd memory | FIPS 204 §3.6.3 | `runtime.spec.ts` | Unfixable in JavaScript |
| 6.3 | A valid signature does not establish **identity** | FIPS 204 §3.5 | `runtime.spec.ts` | The demo's sealed document carries the public key beside the signature, so a wholesale re-sign verifies and means nothing. This is the demo's nature, stated |
| 6.4 | Passing vectors is not an audit or a validation | — | `runtime.spec.ts` | — |

## 7. Real operation versus teaching model

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 7.1 | Every panel carries one of four fidelity labels | — | `fidelity.spec.ts` — every tab has at least one, and the label precedes what it labels in DOM order | — |
| 7.2 | The Fiat-Shamir panel is a **reduced model**, not the signer | — | `fidelity.spec.ts` — must say "not the signer", show toy parameters beside real ones, and admit it samples the challenge rather than hashing μ ‖ w₁ | It is not Fiat-Shamir; it is the interactive proof Fiat-Shamir converts |
| 7.3 | The Module-LWE panel's numbers are **invented** | — | `fidelity.spec.ts` — must state it, give the real scale, and say nothing in it is evidence about real hardness | — |
| 7.4 | No visualization claims constant-time, leakage resistance or side-channel safety | — | `fidelity.spec.ts` | — |

## 8. Benchmarks

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 8.1 | ≥10 warm-up, ≥50 measured iterations, each timed individually | — | `benchmark.test.ts` — the runner **refuses** smaller counts; `benchmark.spec.ts` checks 50 samples per row | — |
| 8.2 | Median and p95 by a stated estimator (R type-7) | — | `benchmark.test.ts` against hand-computed values | A percentile from 50 samples is itself an estimate |
| 8.3 | Every result carries browser, OS, cores, timer source and **measured resolution**, library version, counts and timestamp | — | `benchmark.spec.ts`; no code path renders or exports a timing without them | — |
| 8.4 | Raw samples preserved in order and exported | — | `benchmark.test.ts` recomputes the summary from the exported samples | — |
| 8.5 | Timings are **comparative**, not guarantees | — | `benchmark.spec.ts` requires the caveat with or without a run | — |
| 8.6 | Sub-resolution timings are reported as such, not as zero | — | `claims.spec.ts` accepts an exact ratio or an explicit lower bound, never a bare number derived from zero | Ed25519 is genuinely faster than this clock; its ratios are lower bounds |
| 8.7 | The interface does not freeze | — | `benchmark.spec.ts` counts animation frames through a full ~600-operation run and fails if any gap exceeds 750 ms; a second test switches tabs mid-run | Yielding, not a worker — chosen to keep `default-src 'none'` with no `worker-src` |

## 9. Supply chain and quality gates

| # | Claim | Primary source | Automated test | Remaining limitation |
|---|---|---|---|---|
| 9.1 | Zero moderate/high/critical advisories, and CI **fails closed** | `npm audit` | Its own CI job, in `needs:` for deploy and auto-merge; `supply-chain.test.ts` asserts the wiring | Only covers advisories that have been *published* |
| 9.2 | Every GitHub Action pinned to an immutable commit SHA | — | `check-action-pins.mjs` in CI; `supply-chain-scripts.test.ts` tests each rejection case and that the rule is not vacuous | The checker validates format, not that the SHA is the release it claims |
| 9.3 | A CycloneDX 1.6 SBOM is produced for every build | CycloneDX spec | `supply-chain-scripts.test.ts` — structure, scopes, hashes, purls, determinism | Describes the npm tree, not the Actions or runner image |
| 9.4 | `npm ci` is clean and reproducible | — | Every CI job; `supply-chain.test.ts` requires an integrity hash on every resolved entry | No reproducible-build attestation; the published bundle is unsigned |
| 9.5 | Node 22 and `ubuntu-24.04`, from single sources | — | `supply-chain-scripts.test.ts` — no literal `node-version:`, no `-latest` runner | — |
| 9.6 | Lighthouse: performance ≥ 0.90, **accessibility 1.00**, best-practices ≥ 0.90, SEO ≥ 0.90 over three runs | — | `scripts/lighthouse.mjs` in CI, median for timing categories and **worst run** for accessibility | **Performance sits exactly at its budget on CI hardware** (0.84/0.90/0.90). A slower runner would fail it |
| 9.7 | No WCAG A/AA violations in either theme at either width | WCAG 2.1 | `a11y.spec.ts` drives every state through axe in 4 combinations, plus arithmetic contrast, reflow and keyboard-reachability oracles | axe finds a subset of WCAG issues; `label-content-name-mismatch` had to be enabled by hand after Lighthouse found a real 2.5.3 failure |
| 9.8 | The layout holds at 320 / 768 / 1440 px, in forced-colors and reduced-motion | WCAG 1.4.10, 1.4.1 | `resilience.spec.ts`, 37 tests | — |
| 9.9 | The selector is one shared value; every dependent figure follows it | — | `resilience.spec.ts` — persistence across tabs, benchmark marking, and the selection recorded in both exports | — |
| 9.10 | The security policy, threat model, limitations, sources and implementation identity are **discoverable from the page** | — | `resilience.spec.ts` | — |

---

## What this project still does not have

1. **No independent audit** of the cryptographic implementation, and none of this repository's code.
2. **No CMVP or FIPS 140 validation.**
3. **No reproducible-build attestation** and no signature on the published bundle.
4. **No constant-time guarantee**, and no way to obtain one in JavaScript.
5. **No protection against a compromised host page or extension.**
6. **No identity binding** — by design, and stated wherever it could mislead.
7. **A thin performance margin** against the Lighthouse budget on CI hardware.
8. **Vector coverage is a subset** — 156 of 615 upstream ACVP cases, keeping every test *group* so no mode is dropped, but not every case.
