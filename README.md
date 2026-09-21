# crypto-lab-dilithium-seal

## What It Is

This project is a browser demo for ML-DSA (CRYSTALS-Dilithium), including ML-DSA-44, ML-DSA-65, and ML-DSA-87 parameter sets from NIST FIPS 204. It demonstrates digital signature creation and verification, plus document sealing and tamper checks using the same primitive. The algorithm solves the problem of authenticating messages and proving integrity in a way intended to remain secure against quantum adversaries. ML-DSA is an asymmetric, post-quantum digital signature scheme based on lattice assumptions (Module-LWE and Module-SIS).

The "How It Works" tab now opens with a plain-language "prove you know a secret without revealing it" scaffold, then lets you drive the concepts yourself: an **interactive Fiat-Shamir-with-aborts animation** where pressing *Sign* runs the real reject-and-retry loop — rejecting oversized responses `z = y + c·s₁` that would leak the secret and showing the reject count — and an **interactive Module-LWE panel** with an error slider that flips the problem between trivially solvable (`e = 0`) and quantum-hard. These visualizations compute real modular lattice arithmetic in the browser at an illustrative small scale; the spec-accurate, KAT-backed signing/verification path is unchanged (`@noble/post-quantum`, FIPS 204). The seal demo's tamper flow now separates the two lessons explicitly — the ML-DSA signature alone catches an edit even when the SHA-256 hash is recomputed to agree — so learners see that authenticity comes from the signature, not the hash.

## When to Use It

- Use it for certificate and identity-signing workflows that need post-quantum migration planning. It fits because ML-DSA is standardized (FIPS 204) and designed for public-key authentication.
- Use it for software and artifact signing where verifiable integrity and signer authenticity are required. It fits because the signature can be checked by anyone with the public key.
- Use it for browser-based training or proof-of-concept work that compares classical and post-quantum signatures. It fits because the demo exposes parameter-set tradeoffs and benchmark behavior.
- Do not use this demo implementation as a production key-management system. It is educational and does not provide hardened storage, policy controls, or operational safeguards.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/)**

The demo lets you generate keys, sign and verify messages, seal documents, and compare ML-DSA against classical and other PQ signature schemes. You can interact with parameter-set controls (ML-DSA-44, ML-DSA-65, ML-DSA-87), message/document inputs, and a benchmark runner that executes fixed signing iterations. It also includes educational tabs explaining the construction and where ML-DSA fits in the NIST PQC trio.

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
