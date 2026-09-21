/**
 * The implementation facts the page displays, injected at build time.
 *
 * `__RUNTIME_FACTS__` is a Vite `define`, computed by `build/runtime-facts.ts`
 * from `package-lock.json`. It is a compile-time constant rather than a runtime
 * import so the 60 KB lockfile never reaches the browser, and so the version the
 * page prints is the version `npm ci` installed — not the `^0.7.1` range in
 * `package.json`, which is not a fact about anything that shipped.
 */

/*
 * The shape lives HERE, not in build/runtime-facts.ts, and the build script
 * imports it from here rather than the other way round. That direction matters:
 * `tsconfig.json` type-checks the browser bundle with `types: []` so a Node API
 * in shipped code is a compile error, and an app file importing a type out of a
 * script that reads `node:fs` drags that script into the same pass. Types flow
 * app -> build; values flow build -> app through the define below.
 */

/** One dependency, exactly as the lockfile pins it. */
export interface PinnedPackage {
  name: string;
  version: string;
  /** The registry tarball `npm ci` fetches. */
  resolved: string;
  /** Subresource integrity of that tarball. */
  integrity: string;
}

export interface RuntimeFacts {
  /** The ML-DSA implementation itself. */
  library: PinnedPackage;
  /** Its transitive dependencies that execute inside the crypto path. */
  dependencies: PinnedPackage[];
  repository: string;
  /** 'javascript' | 'webassembly' | 'native' — asserted against the bundle by a test. */
  implementationType: 'javascript';
  /** Where key-generation and hedged-signing randomness comes from. */
  randomnessSource: string;
  /** ML-DSA surfaces the library exposes and this build exercises. */
  supportedModes: string[];
  audit: {
    independent: false;
    /** The library's own statement, quoted. */
    statement: string;
    selfAuditedVersion: string;
    selfAuditedDate: string;
    /** True when the shipped version is later than the self-audited one. */
    shippedVersionIsAfterSelfAudit: boolean;
  };
  validation: {
    cmvp: false;
    fips140: false;
    statement: string;
  };
  builtAt: string;
}


declare const __RUNTIME_FACTS__: RuntimeFacts;

export const RUNTIME_FACTS: RuntimeFacts = __RUNTIME_FACTS__;

/**
 * Limitations that hold no matter how correct the implementation is.
 *
 * These are rendered on the page rather than left in a comment, because every
 * one of them changes what a reader should conclude from a green ✓ VERIFIED
 * badge. `id` exists so tests can assert each one is actually on screen.
 */
export interface Limitation {
  id: string;
  title: string;
  body: string;
  /** A claim id from src/data/sources.ts, when a standard says this directly. */
  claimId?: string;
}

export const LIMITATIONS: Limitation[] = [
  {
    id: 'not-constant-time',
    title: 'JavaScript execution is not guaranteed to be constant-time',
    body:
      'The library states plainly that it "does not claim constant-time execution": JIT ' +
      'compilation, garbage collection and engine-level optimisation give no such guarantee. ' +
      'ML-DSA signing in particular uses a rejection loop and early-exit norm checks whose ' +
      'execution depends on secret-key and per-signature state. Hedged signing is the default ' +
      'and helps, but it does not make the implementation constant-time. This matters when an ' +
      'attacker can measure your signing closely — shared hardware, hostile co-tenancy, or a ' +
      'high-resolution local timing oracle.',
  },
  {
    id: 'no-erasure',
    title: 'Secrets cannot be reliably erased from garbage-collected memory',
    body:
      'FIPS 204 §3.6.3 requires implementations to ensure "that any potentially sensitive ' +
      'intermediate data is destroyed as soon as it is no longer needed." A JavaScript runtime ' +
      'cannot honour that: the engine may copy a Uint8Array during garbage collection or ' +
      'optimisation, and nothing in the language can reach those copies. Private keys generated ' +
      'on this page should be treated as disclosed to the browser process for its lifetime.',
    claimId: 'intermediateValues',
  },
  {
    id: 'trust-boundary',
    title: 'Browser extensions and a compromised page are outside the trust boundary',
    body:
      'Anything that can run script in this page can read the private key while it exists: a ' +
      'browser extension with host access, a compromised dependency, a malicious bookmarklet, or ' +
      'a devtools session. The Content-Security-Policy narrows what injected content can load, ' +
      'but it cannot defend against code the browser itself was told to run. This is a teaching ' +
      'demo, not a key-management system.',
  },
  {
    id: 'kat-not-audit',
    title: 'Passing known-answer vectors is not an audit and not a validation',
    body:
      'This build reproduces NIST ACVP answers byte-for-byte for all three parameter sets. That ' +
      'is interoperability evidence: the arithmetic agrees. It says nothing about side channels, ' +
      'memory handling, or the code paths a vector file never reaches. It is not a CMVP ' +
      'certificate, not a FIPS 140 validation, and not an independent security audit — and the ' +
      'library this page runs states that it has not been independently audited.',
    claimId: 'interop',
  },
  {
    id: 'identity-binding',
    title: 'A valid signature does not by itself establish who signed',
    body:
      'Verification proves that whoever holds the private key matching THIS public key signed ' +
      'THESE exact bytes. It does not tell you whose key it is. FIPS 204 §3.5 puts it directly: ' +
      '"binding a public key to an identity requires proof of possession", and in a PKI that ' +
      'means certificate issuance. The public key on this page arrives in the same JSON as the ' +
      'signature, so a tamperer who replaces both together produces a document that verifies ' +
      'perfectly — and means nothing.',
    claimId: 'identityBinding',
  },
  {
    id: 'randomness-dependency',
    title: 'Key generation and signing depend on the browser’s RBG',
    body:
      'Both draw from crypto.getRandomValues. If it is unavailable this page stops rather than ' +
      'substituting anything: there is no Math.random fallback in the cryptographic path, and a ' +
      'test asserts there never will be. Weak or backdoored browser randomness would, however, ' +
      'weaken keys generated here, and the page cannot detect that.',
    claimId: 'randomness',
  },
];
