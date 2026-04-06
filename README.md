# dilithium-seal

**ML-DSA (CRYSTALS-Dilithium)** — Browser-based post-quantum digital signature demo  
Part of the [crypto-compare](https://github.com/systemslibrarian/crypto-compare) portfolio

---

## What This Demo Shows

- **Sign & Verify** — Generate ML-DSA keypairs, sign messages, verify signatures, and test tamper detection across all three parameter sets (ML-DSA-44, ML-DSA-65, ML-DSA-87)
- **Document Sealing** — Sign a document, export a sealed JSON package, verify it, and detect tampering
- **Comparison** — Accurate size and speed comparison of ML-DSA vs Ed25519, ECDSA, RSA-PSS, and SLH-DSA with live benchmarks
- **How ML-DSA Works** — Five-step interactive stepper explaining the Module-LWE + Module-SIS mathematical foundation
- **NIST PQC Trio** — How ML-KEM (FIPS 203), ML-DSA (FIPS 204), and SLH-DSA (FIPS 205) work together in a complete post-quantum system

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## ML-DSA Implementation

ML-DSA operations are provided by [`@noble/post-quantum`](https://www.npmjs.com/package/@noble/post-quantum) by Paul Miller — a pure JavaScript implementation with no native dependencies.

## ML-DSA Parameter Sizes (FIPS 204 Table 1)

| Parameter Set | Security Category | Public Key | Private Key | Signature |
|---|---|---|---|---|
| ML-DSA-44 | 2 | 1,312 B | 2,560 B | 2,420 B |
| ML-DSA-65 | 3 | 1,952 B | 4,032 B | 3,309 B |
| ML-DSA-87 | 5 | 2,592 B | 4,896 B | 4,627 B |

Source: [NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final), Table 1.

## Distinction from SLH-DSA (sphincs-ledger)

| | ML-DSA (this demo) | SLH-DSA (sphincs-ledger) |
|---|---|---|
| Hardness assumption | Module-LWE + Module-SIS (lattice) | Hash functions only |
| Signature speed | Fast | Slow |
| Signature size | Moderate (2.4–4.6 KB) | Large (7.8–49 KB) |
| Best for | TLS, code signing, real-time protocols | Long-lived archives, maximum conservatism |
| Standard | FIPS 204 | FIPS 205 |

NIST recommends ML-DSA as the primary post-quantum signature scheme and SLH-DSA as a conservative backup.

## References

- [NIST FIPS 204 — ML-DSA](https://csrc.nist.gov/pubs/fips/204/final)
- [NIST FIPS 203 — ML-KEM](https://csrc.nist.gov/pubs/fips/203/final)
- [NIST FIPS 205 — SLH-DSA](https://csrc.nist.gov/pubs/fips/205/final)
- [CRYSTALS-Dilithium](https://pq-crystals.org/dilithium/)

## Related Demos

- **[kyber-vault](https://github.com/systemslibrarian/crypto-compare)** — ML-KEM (FIPS 203): ML-KEM + ML-DSA = complete post-quantum public-key cryptography (encrypt + sign)
- **[sphincs-ledger](https://github.com/systemslibrarian/crypto-compare)** — SLH-DSA (FIPS 205): ML-DSA (lattice, faster) vs SLH-DSA (hash-only, more conservative)
- **[ratchet-wire](https://github.com/systemslibrarian/crypto-compare)** — Signal's PQXDH combines X25519 + ML-KEM for key exchange — a future upgrade would add ML-DSA for post-quantum authentication
- **[iron-serpent](https://github.com/systemslibrarian/crypto-compare)** — ML-DSA signs the key, Serpent-256 encrypts the data — a complete post-quantum hybrid system

---

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*