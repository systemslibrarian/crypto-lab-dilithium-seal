# Pinned NIST ACVP vectors for ML-DSA (FIPS 204)

These files are **test data, not source**. They are vendored so that conformance
runs are reproducible and so that CI never downloads test data it then treats as
authoritative.

## Upstream

| | |
|---|---|
| Repository | <https://github.com/usnistgov/ACVP-Server> |
| Release tag | `v1.1.0.43` |
| Commit | `975de31eb83d87039ec88934fdc47d8c312b892d` |
| Retrieved | 2026-09-20 |

The tag, the full commit SHA **and** a SHA-256 per file are all recorded in
`manifest.json`. Each covers a different failure mode: a tag can be moved but a
commit cannot; a commit fixes the tree but not what a mirror or proxy hands
back, and the digest does.

| File | Upstream path | Upstream SHA-256 |
|---|---|---|
| `ml-dsa-keygen.json` | `gen-val/json-files/ML-DSA-keyGen-FIPS204/internalProjection.json` | `e67ee654…3baf` |
| `ml-dsa-siggen.json` | `gen-val/json-files/ML-DSA-sigGen-FIPS204/internalProjection.json` | `72dcaf5f…af22` |
| `ml-dsa-sigver.json` | `gen-val/json-files/ML-DSA-sigVer-FIPS204/internalProjection.json` | `47cdd631…5437` |

Full digests are in `manifest.json`.

## Why these are a subset

The three upstream files total about 14 MB, almost all of it per-test key
material. Vendoring them whole would put 14 MB into every clone and every CI
checkout of a teaching repository.

The subset rule is deterministic, and **every upstream test group is kept** —
only repetitions *within* a group are dropped. The groups are the modes
(parameter set × deterministic/hedged × external/internal interface ×
pure/pre-hash × external-µ), so no mode is lost:

| File | Rule | Groups | Cases kept | Upstream cases |
|---|---|---|---|---|
| keyGen | first 5 tests of every group | 3 | 15 | 75 |
| sigGen | first 3 satisfying FIPS 204 §5.4, plus the first that does not | 24 | 78 | 360 |
| sigVer | per `reason`, the first satisfying §5.4 (else the first of that reason), plus the first non-satisfying test | 12 | 63 | 180 |

Fields that no test reads are dropped: `deferred` everywhere, and `pk` from
sigGen, where the expected signature is compared byte-for-byte and the public
key is re-derived from the secret key instead.

### The §5.4 clause in those rules

FIPS 204 §5.4 (with footnote 6) requires a pre-hash digest to provide at least
λ bits of classical collision strength — "requires that the digest to be signed
be at least 2λ bits in length". ACVP also generates pairings *below* that bound
(ML-DSA-87 with SHA2-224, for example), because Algorithm 4 "may be used with
other hash functions or XOFs": §5.4 is a security-strength requirement rather
than a constraint on the algorithm. `@noble/post-quantum` takes the strict
reading and refuses those pairings.

A naive "first N tests" rule therefore produced groups whose only vendored cases
were ones the library refuses — including two sigVer groups whose *valid
control* was unrunnable, so the suite would have asserted nothing about signing
or verifying there and still gone green. Selecting §5.4-satisfying cases first,
and deliberately keeping one non-satisfying case, gives every group both
branches: answers that must match NIST exactly, and a pairing that must be
refused.

## Regenerating

```bash
node scripts/fetch-acvp-vectors.mjs --write   # re-derive from the pinned commit
node scripts/fetch-acvp-vectors.mjs           # verify the pins without writing
```

Both forms hit the network and are for humans. **CI never runs either.** The
test suite verifies the *vendored* digests against `manifest.json` before using
a single vector, so an accidental edit to the test data fails as loudly as a
broken implementation would.

## What passing these proves

That this build of `@noble/post-quantum` computes the same ML-DSA that NIST's
reference generator computes, for all three final parameter sets and every mode
exercised above. That is **interoperability evidence**.

It is **not** a validation. It is not a CMVP certificate, not a FIPS 140
validation, not an independent security audit, and not evidence of
constant-time behaviour or side-channel resistance. A validated module is one
tested by an accredited laboratory under a defined operational environment; a
passing vector file says only that the arithmetic agrees.
