# Security policy

## What this project is

An educational, browser-only demonstration of ML-DSA (NIST FIPS 204), served as
static files from GitHub Pages. It has no server, no accounts, no database and
no user data. It performs **real** cryptography — real keys, real signatures —
so security reports about it are welcome and taken seriously.

**It is not a key-management system.** Do not generate a key here that you
intend to rely on. See [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) and
[THREAT-MODEL.md](THREAT-MODEL.md).

## Reporting a vulnerability

Please report privately, not in a public issue:

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/systemslibrarian/crypto-lab-dilithium-seal/security/advisories/new)
- Otherwise, open an issue saying only that you have a security report and
  asking for a contact route. Do not include details.

**What to expect.** This is a personal educational project maintained in spare
time, not a product with an on-call rotation. Acknowledgement within 7 days,
and an assessment within 30. If a report is valid and a fix is possible, it
will be fixed and credited unless you ask otherwise.

## What is in scope

| | |
|---|---|
| ✅ | A flaw in `src/crypto/` — the ML-DSA wrapper, the seal format, the randomness path |
| ✅ | A cryptographic claim on the page that is **wrong** (this project treats a false teaching claim as a defect) |
| ✅ | A CSP bypass, or injected content executing |
| ✅ | A supply-chain weakness in the build or release pipeline |
| ✅ | A way to make the page accept an invalid signature, or report a valid one as invalid |
| ✅ | Key material leaving the page by any route |

## What is out of scope

| | |
|---|---|
| ❌ | "A browser extension can read the private key." True, documented, and unfixable in a web page — see THREAT-MODEL T6 |
| ❌ | "JavaScript is not constant-time." True, documented — see THREAT-MODEL T7 |
| ❌ | "A tampered sealed document with a swapped public key verifies." True, documented, and the point of the identity-binding limitation — see THREAT-MODEL T8 |
| ❌ | Missing HTTP security headers. GitHub Pages does not let this repository set any; the CSP is delivered by `<meta>` and its limits are documented |
| ❌ | Denial of service against a static page |
| ❌ | Findings in the upstream `@noble/post-quantum` library — report those to [its maintainer](https://github.com/paulmillr/noble-post-quantum/security), and tell us so the pin can be moved |

## Supported versions

Only the currently deployed `main` is supported. There are no release branches
and no backports; the site is whatever `main` last published.

## Security properties this project maintains

These are enforced by CI, not by intention. Each has a test that fails the build:

| Property | Enforced by |
|---|---|
| No moderate-or-higher dependency advisory | `npm audit --audit-level=moderate`, its own CI job, in `needs:` for deploy and auto-merge |
| Every GitHub Action pinned to an immutable commit SHA | `scripts/check-action-pins.mjs` |
| A CycloneDX SBOM for every build | `scripts/generate-sbom.mjs` |
| No `'unsafe-inline'`, `'unsafe-eval'` or `'unsafe-hashes'` in the CSP | `build/csp.ts` fails the build |
| No remote origin in the CSP | `build/csp.ts` fails the build |
| No third-party runtime request | `e2e/csp.spec.ts` drives the whole demo with off-origin requests aborted |
| No WebAssembly or native addon in the bundle | `build/purity.ts` fails the build |
| No `Math.random` in the cryptographic path | `src/__tests__/runtime.test.ts` |
| Key generation and signing stop if the RBG is unavailable | `src/crypto/random.ts`, tested in both unit and browser suites |
| Malformed keys and signatures are rejected, never accepted | `src/__tests__/malformed-inputs.test.ts` |
| Interoperability with NIST's own ACVP vectors | `src/__tests__/acvp-conformance.test.ts` |

## What this project does not claim

It is **not** NIST-validated, **not** CMVP-validated and **not** FIPS-certified.
It reproduces NIST ACVP known-answer vectors, which is interoperability
evidence and not a validation. The library it runs states that it has not been
independently audited. A browser test asserts the site never claims otherwise.
