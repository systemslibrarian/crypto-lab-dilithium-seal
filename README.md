# crypto-lab-dilithium-seal

## What It Is

This project is a browser demo for ML-DSA (CRYSTALS-Dilithium), including ML-DSA-44, ML-DSA-65, and ML-DSA-87 parameter sets from NIST FIPS 204. It demonstrates digital signature creation and verification, plus document sealing and tamper checks using the same primitive. The algorithm solves the problem of authenticating messages and proving integrity in a way intended to remain secure against quantum adversaries. ML-DSA is an asymmetric, post-quantum digital signature scheme based on lattice assumptions (Module-LWE and Module-SIS).

## When to Use It

- Use it for certificate and identity-signing workflows that need post-quantum migration planning. It fits because ML-DSA is standardized (FIPS 204) and designed for public-key authentication.
- Use it for software and artifact signing where verifiable integrity and signer authenticity are required. It fits because the signature can be checked by anyone with the public key.
- Use it for browser-based training or proof-of-concept work that compares classical and post-quantum signatures. It fits because the demo exposes parameter-set tradeoffs and benchmark behavior.
- Do not use this demo implementation as a production key-management system. It is educational and does not provide hardened storage, policy controls, or operational safeguards.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/)**

The demo lets you generate keys, sign and verify messages, seal documents, and compare ML-DSA against classical and other PQ signature schemes. You can interact with parameter-set controls (ML-DSA-44, ML-DSA-65, ML-DSA-87), message/document inputs, and a benchmark runner that executes fixed signing iterations. It also includes educational tabs explaining the construction and where ML-DSA fits in the NIST PQC trio.

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

*One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
