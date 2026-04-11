# dilithium-seal

## 1. What It Is

This project is a browser demo for ML-DSA (CRYSTALS-Dilithium), including ML-DSA-44, ML-DSA-65, and ML-DSA-87 parameter sets from NIST FIPS 204. It demonstrates digital signature creation and verification, plus document sealing and tamper checks using the same primitive. The algorithm solves the problem of authenticating messages and proving integrity in a way intended to remain secure against quantum adversaries. ML-DSA is an asymmetric, post-quantum digital signature scheme based on lattice assumptions (Module-LWE and Module-SIS).

## 2. When to Use It

- Use it for certificate and identity-signing workflows that need post-quantum migration planning. It fits because ML-DSA is standardized (FIPS 204) and designed for public-key authentication.
- Use it for software and artifact signing where verifiable integrity and signer authenticity are required. It fits because the signature can be checked by anyone with the public key.
- Use it for browser-based training or proof-of-concept work that compares classical and post-quantum signatures. It fits because the demo exposes parameter-set tradeoffs and benchmark behavior.
- Do not use this demo implementation as a production key-management system. It is educational and does not provide hardened storage, policy controls, or operational safeguards.

## 3. Live Demo

Live demo: https://systemslibrarian.github.io/crypto-lab-dilithium-seal/

The demo lets you generate keys, sign and verify messages, seal documents, and compare ML-DSA against classical and other PQ signature schemes. You can interact with parameter-set controls (ML-DSA-44, ML-DSA-65, ML-DSA-87), message/document inputs, and a benchmark runner that executes fixed signing iterations. It also includes educational tabs explaining the construction and where ML-DSA fits in the NIST PQC trio.

## 4. How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-dilithium-seal.git
cd crypto-lab-dilithium-seal
npm install
npm run dev
```

No environment variables are required.

## 5. Part of the Crypto-Lab Suite

This demo is one module in the broader Crypto-Lab collection at https://systemslibrarian.github.io/crypto-lab/.

---

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*