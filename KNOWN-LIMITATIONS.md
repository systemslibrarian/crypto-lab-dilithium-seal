# Known limitations

Everything here is true, deliberate and, in most cases, unfixable in a browser
page. It is written down because a demonstration that hides its limits teaches
something false about cryptography even when every line of code is correct.

Six of these are also rendered **on the page itself**, on the About tab, and a
browser test asserts they render. This file is the longer version.

---

## Cryptographic

### 1. JavaScript execution is not guaranteed to be constant-time

`@noble/post-quantum` states it plainly: it "does not claim constant-time
execution". JIT compilation, garbage collection and engine-level optimisation
give no such guarantee, and ML-DSA signing in particular uses a rejection loop
and early-exit norm checks whose execution depends on secret-key state. Hedged
signing is the default and helps; it does not make the implementation
constant-time.

**Matters when** an attacker can measure your signing closely: hostile
co-tenancy, shared hardware, a high-resolution local timing oracle.
**Instead:** a reviewed native constant-time implementation in an isolated
environment.

### 2. Secrets cannot be reliably erased

FIPS 204 §3.6.3 requires implementations to ensure "that any potentially
sensitive intermediate data is destroyed as soon as it is no longer needed". A
JavaScript runtime cannot honour that: the engine may copy a `Uint8Array`
during garbage collection or optimisation, and nothing in the language can
reach those copies. **Treat any private key generated here as disclosed to the
browser process for the lifetime of the tab.**

### 3. A valid signature does not establish identity

Verification proves that whoever holds the private key matching **this** public
key signed **these exact bytes**. It does not tell you whose key it is. FIPS 204
§3.5: "binding a public key to an identity requires proof of possession".

On this page specifically, a sealed document carries the public key *in the same
JSON as the signature*. Replace the content, re-sign with your own key, replace
the public key too, and the result verifies perfectly and means nothing. The
`signerLabel` field is free text with no cryptographic force.

### 4. Passing known-answer vectors is not an audit or a validation

The suite reproduces NIST ACVP answers byte-for-byte for all three parameter
sets across key generation, signing and verification. That is **interoperability
evidence**: the arithmetic agrees. It says nothing about side channels, memory
handling, or code paths a vector file never reaches.

This project is **not** NIST-validated, **not** CMVP-validated and **not**
FIPS-certified, and must never say it is.

### 5. The library has not been independently audited

Its own README says so. It was self-audited at **v0.6.1 (April 2026)**; the
version shipped here is **later than that**, so even the self-audit does not
cover this build. The exact version is displayed on the page, derived from the
lockfile so it cannot drift.

### 6. Randomness is only as good as the browser's

Key generation and hedged signing draw from `crypto.getRandomValues`. There is
no fallback: if it is missing, throws, or returns zeros, operations **stop**.
But if the browser's RBG is itself weak or backdoored, keys generated here are
weak and **the page cannot detect that**.

### 7. Only the empty context string is exercised by the UI

The demo signs pure ML-DSA with an empty context. Context strings, HashML-DSA
pre-hash signing, deterministic signing and the internal interface are all
exercised **by the conformance suite** against NIST's vectors, but not by any
control on the page.

### 8. One pre-hash reading differs from ACVP's

FIPS 204 §5.4 (footnote 6) requires a pre-hash digest of at least 2λ bits.
ACVP also generates pairings *below* that bound, because Algorithm 4 "may be
used with other hash functions or XOFs". `@noble/post-quantum` takes the strict
reading and **refuses** them. The suite tests both halves — compliant pairings
must match NIST exactly, non-compliant ones must be refused — but an application
needing those weaker pairings would need a different library.

---

## Browser and delivery

### 9. The Content-Security-Policy is delivered by `<meta>`, not a header

GitHub Pages serves this site with a fixed set of response headers and offers no
way to add one. A meta-delivered policy is strictly weaker:

- **`frame-ancestors` is ignored** — this page cannot prevent being framed, and
  `X-Frame-Options` is equally unavailable. The directive is written anyway so
  it starts working if this is ever served from somewhere that can set headers.
  Chromium logs a notice; the e2e gate asserts that notice appears, so the
  limitation cannot quietly lapse in either direction.
- **`report-uri` / `report-to` are ignored** — no violation telemetry.
- **`sandbox` is ignored.**
- **The policy applies only from the point the parser reaches it.** The meta is
  placed immediately after `<title>`, ahead of every script and stylesheet.

### 10. Trusted Types cannot be enforced

The UI is built with `innerHTML`, so `require-trusted-types-for 'script'` would
require rewriting the rendering layer. The CSP stops injected content from
*loading code*; it does not stop injected markup from being written into the
page. All interpolated content is HTML-escaped, and the policy has no
`'unsafe-inline'`, but this is a real residual risk and not a formality.

### 11. Browser extensions are outside the trust boundary

Anything that can run script in this page can read the private key while it
exists. CSP does not constrain extension content scripts. This is not fixable.

### 12. There is no reproducible-build attestation

The published bundle is not signed and cannot be independently reproduced
byte-for-byte from source. Dependencies are pinned by integrity hash, Actions by
commit SHA, and an SBOM is produced — all of which raise the cost of a
supply-chain attack without eliminating it.

### 13. `robots.txt` cannot be fixed from this repository

Lighthouse reports an invalid `robots.txt`, costing a fraction of the SEO score.
This is a **project** Pages site served under a path; `/robots.txt` belongs to
the user-level Pages site, which this repository does not control. The SEO
budget passes regardless.

---

## Scope of the demonstration

### 14. Two panels are reduced teaching models, not ML-DSA

The Fiat-Shamir animator works over 8 coefficients modulo 257 with a single
polynomial; the Module-LWE panel is a 3×3 system modulo 97 with a hand-picked
secret. Both are labelled on the page, both show their toy parameters beside the
real ones, and the Fiat-Shamir panel states that it samples the challenge rather
than hashing μ ‖ w₁ — which makes it the interactive proof that Fiat-Shamir
converts, not Fiat-Shamir itself.

### 15. Benchmarks are comparative, not guarantees

They measure this build of this library in one browser on one device at one
moment, under whatever else that machine was doing. They are not a performance
property of ML-DSA. Compare parameter sets **against each other within one run**,
not across runs or devices.

Related: `performance.now()` is coarsened to 0.1 ms in a page that is not
cross-origin isolated, and Ed25519 signs faster than that. The panel reports
sub-resolution timings as `< 0.100` and turns the affected ratios into explicit
lower bounds rather than dividing by a rounded zero.

### 16. There is no in-page theme control

The shared Crypto Lab header hides in-page theme toggles across the fleet, so
the only control is the operating system's `prefers-color-scheme`, which the
page honours. A visitor who wants a light page in a dark-set OS cannot get one
here.

---

## Where these are enforced

Every limitation above that *can* be tested is. See the table in
[SECURITY.md](SECURITY.md), and [THREAT-MODEL.md](THREAT-MODEL.md) for the
adversary each one corresponds to.
