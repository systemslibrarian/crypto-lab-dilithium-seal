# Threat model

## What this system is

A static, single-page educational demonstration of ML-DSA (NIST FIPS 204),
served from GitHub Pages. It generates real key pairs, produces real signatures
and verifies them, entirely in the visitor's browser. There is no server, no
account, no database and no network request after the page loads.

**It is a teaching tool, not a key-management system.** The whole point of this
document is to be specific about what that sentence costs.

## Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Private signing key | A `Uint8Array` in the page's JavaScript heap, for as long as the tab is open | Whoever holds it can forge signatures that verify against the matching public key |
| Key-generation seed ξ | Transient, 32 bytes from the browser RBG | Determines the key entirely; a predictable ξ is a predictable key |
| Per-signature randomness `rnd` | Transient, 32 bytes per signature | FIPS 204 §3.6.1 describes it as a countermeasure to side-channel and fault attacks on deterministic signing |
| The integrity of what the page *says* | The published bundle | A demo that teaches something false about ML-DSA has failed even if no key leaks |
| The published artifact itself | `dist/` on GitHub Pages | A tampered bundle can exfiltrate keys from every visitor |

## Trust boundary

**Inside:** the published bundle's own code, the pinned `@noble/post-quantum`
build it ships, the browser's Web Crypto RBG.

**Outside:** everything else — the visitor's browser extensions, other tabs, the
operating system, the network path, GitHub's infrastructure, the npm registry,
anyone with commit access to this repository, and any person or document that
hands the visitor a public key.

The application **cannot** defend the inside from the outside. What follows is
what it does about each threat, and where it simply stops.

---

## T1 — Private signing keys

**Threat.** An attacker recovers a private key generated on this page and forges
signatures with it.

**Reality.** The key lives in the JavaScript heap of a browser tab. Any code
running in that page — an extension with host permissions, a devtools session, a
compromised dependency, a bookmarklet — can read it. This is not a defect that
can be fixed in a web page; it is what a web page is.

**What is done.**
- Keys are generated in the browser and never transmitted. There is no
  `connect-src` in the Content-Security-Policy, so the page cannot make a
  network request at all — a browser test drives the entire demo with
  off-origin requests blocked and asserts none was attempted.
- Keys are not persisted. Nothing writes key material to `localStorage`,
  `sessionStorage`, IndexedDB or a cookie.
- Switching parameter set discards the key pair rather than leaving a stale one
  live.

**What is not done, and cannot be.** Memory protection, secure enclaves, key
escrow, or erasure (see T7). **Do not generate a key here that you intend to
rely on.**

---

## T2 — Browser randomness

**Threat.** Key generation or signing draws from a weak, predictable or
subverted random source, producing guessable keys or leaking the private key
through signature randomness.

**What is done.**
- `crypto.getRandomValues` is the only source, in `src/crypto/random.ts`. There
  is **no fallback path**, by construction.
- If it is missing, throws, or returns all zeros — a stub that silently no-ops
  would otherwise hand key generation a 32-byte seed of zeros it would accept —
  the operation **stops** with a visible error. It does not degrade, retry or
  substitute.
- `Math.random` appears exactly once in the repository, in the reduced
  Fiat-Shamir teaching model. A test scans every source file (with comments and
  string literals stripped, so the rule does not fire on its own documentation),
  allows that one file by name, and asserts the allowance is not dead.
- Signing uses the **hedged** variant, which FIPS 204 §3.6.1 describes as a
  countermeasure against side-channel and fault attacks on deterministic
  signing. If randomness is unavailable, signing stops rather than silently
  falling back to the deterministic variant — a different security posture the
  reader was never told about.

**Residual risk.** If the browser's RBG is itself weak or backdoored, keys
generated here are weak, and **the page cannot detect that**.

---

## T3 — Untrusted messages and signatures

**Threat.** A visitor pastes a sealed document from an untrusted source and the
page misleads them about what verification proved.

**What is done.**
- Verification is the real FIPS 204 algorithm; a modified message or signature
  fails, and browser tests drive both cases for every parameter set.
- All rendered content from a pasted document is HTML-escaped.
- The Content-Security-Policy is `default-src 'none'` with no `'unsafe-inline'`,
  so even if escaping were bypassed, injected markup cannot load or execute
  code. A test injects a remote script and an inline script and requires the
  browser to refuse both.

**The important residual risk is not technical.** See T8: a signature that
verifies proves the holder of *that* public key signed *those* bytes. It does
not tell you whose key it is.

---

## T4 — Malformed keys and signatures

**Threat.** A malformed input causes an exception that escapes into an async
handler, leaving the page stuck, or — worse — causes an invalid signature to be
accepted.

**What is done.**
- FIPS 204 §3.6.2 requires an implementation that can accept a σ or pk of
  another length to "return false whenever the lengths … differ".
  `@noble/post-quantum` does this for σ but **throws** for pk, so
  `src/crypto/mldsa.ts` carries its own length checks and returns `false` for
  both. The library's throwing behaviour is pinned by a test so a future change
  is noticed.
- The sealed-document verifier catches decode and verification failures and
  returns a verdict rather than throwing. A test feeds it nine malformed
  packages — null, missing fields, non-base64, truncated, wrong parameter set —
  and requires a verdict from every one.
- Negative tests per parameter set cover single flipped bits across c̃, z and h;
  truncated and extended signatures; wrong public keys; invalid hint encodings;
  a `z` outside the γ₁ − β norm bound; all-zero and all-ones signatures of the
  exact right length; and context strings over the 255-byte limit.

---

## T5 — Dependency and build-pipeline compromise

**Threat.** A malicious dependency, a compromised GitHub Action, or a bad commit
ships a bundle that exfiltrates keys from every visitor. **This is the most
serious threat to this project**, because it scales to everyone who loads the
page, and the visitor has no way to detect it.

**What is done.**
- One runtime dependency, `@noble/post-quantum`, with three of its own. The
  lockfile pins each to an exact version and integrity hash, and `npm ci`
  installs from it.
- `npm audit --audit-level=moderate` runs as its own CI job on every pull
  request, and both `deploy` and the Dependabot auto-merge list it in `needs:`.
  A bump that introduces a qualifying advisory cannot merge itself.
- Every GitHub Action is pinned to an **immutable full-commit SHA**, and
  `scripts/check-action-pins.mjs` fails CI if an unpinned or tag-pinned action
  appears.
- A CycloneDX SBOM is generated in CI from the lockfile and published as a build
  artifact.
- The build refuses to emit a bundle that contradicts the page's own claims: no
  WebAssembly or native-addon loading (`build/purity.ts`), and no CSP with an
  unsafe token, a remote origin, or a stale inline-script hash
  (`build/csp.ts`).
- The version the page displays is derived from the lockfile at build time, so
  it cannot drift from what was installed.

**Residual risk.** Anyone with commit access, or with the ability to publish a
malicious version of a dependency that passes `npm audit`, can compromise the
artifact. Pinning and auditing raise the cost; they do not eliminate it. There
is **no reproducible-build attestation** and no signature on the published
bundle.

---

## T6 — Host-page or extension compromise

**Threat.** Code running in the same page reads the private key, or replaces the
page's own code.

**What is done.**
- A restrictive CSP: `default-src 'none'`, no `'unsafe-inline'`,
  `'unsafe-eval'` or `'unsafe-hashes'`, `base-uri 'none'` so an injected
  `<base>` cannot re-point every relative URL, `object-src 'none'`,
  `form-action 'none'`. Inline blocks are allowed by SHA-256 hash computed from
  the emitted bytes.
- No third-party runtime JavaScript, no analytics, no CDN, no remote font.

**What is not done.**
- The CSP is delivered by `<meta>`, because GitHub Pages cannot set a response
  header. `frame-ancestors` is therefore **ignored** — this page cannot stop
  itself being framed — and there is no violation reporting.
- The UI is built with `innerHTML`, so `require-trusted-types-for 'script'`
  cannot be enforced without rewriting the rendering layer. The policy stops
  injected content from *loading code*; it does not stop injected markup from
  being written into the page.
- **A browser extension with host access is outside the trust boundary and
  always will be.** CSP does not constrain extension content scripts.

---

## T7 — Timing and memory limitations

**Threat.** An attacker who can observe execution timing or memory recovers key
material.

**What is done.** Nothing that could honestly be called a mitigation. This is
stated rather than defended:

- **The implementation does not claim constant-time execution.** The library
  says so in its own README. JIT compilation, garbage collection and
  engine-level optimisation give no such guarantee, and ML-DSA signing in
  particular uses a rejection loop and early-exit norm checks whose execution
  depends on secret-key state. Hedged signing is the default and helps; it does
  not make the implementation constant-time.
- **Secrets cannot be reliably erased.** FIPS 204 §3.6.3 requires that sensitive
  intermediate data be "destroyed as soon as it is no longer needed". A
  JavaScript runtime cannot honour that: the engine may copy a `Uint8Array`
  during garbage collection, and nothing in the language can reach those copies.
- No visualization on the page claims constant-time behaviour, leakage
  resistance or side-channel safety, and a browser test asserts that.

**When this matters:** hostile co-tenancy, shared hardware, or a
high-resolution local timing oracle. If that is your threat model, use a
reviewed native constant-time implementation in an isolated environment.

---

## T8 — Public-key trust and identity binding

**Threat.** A reader concludes from a ✓ VERIFIED badge that a named person
signed a document.

**This is the limitation most likely to mislead, and it is not a bug.**

Verification proves that whoever holds the private key matching **this** public
key signed **these exact bytes**. It says nothing about whose key it is.

FIPS 204 §3.5 is explicit: "binding a public key to an identity requires proof
of possession", and in a PKI that means certificate issuance.

**Concretely, on this page:** a sealed document carries the public key *in the
same JSON as the signature*. An attacker who replaces the content, re-signs it
with their own key, and replaces the public key too produces a document that
verifies perfectly — and means nothing. The `signerLabel` field is a free-text
string with no cryptographic force whatsoever.

**What is done.** The limitation is stated on the page, in full, next to the
other limitations rather than in a footnote — and a browser test asserts it
renders.

---

## Out of scope

- Denial of service. The page is static; a visitor can only exhaust their own
  tab.
- Confidentiality of the message. ML-DSA is a signature scheme; it provides
  authenticity and integrity, not encryption. Nothing on this page is secret
  from anyone who can see the visitor's screen.
- Quantum attacks on the *hash* used for the document's convenience integrity
  check. SHA-256 is not the security of the seal; the signature is, and the UI
  teaches that explicitly.
- Anything about how *other* deployments of ML-DSA should be built. This
  document describes this artifact.

## Reporting

See [SECURITY.md](SECURITY.md).
