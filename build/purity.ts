/**
 * Enforce "pure JavaScript — no WebAssembly, no native code" at build time.
 *
 * The page states this about itself, so it has to be checked rather than
 * asserted. It was checked first by a unit test that read `dist/assets` — which
 * passed locally off a stale build and failed in CI, where `npm test` runs
 * before `npm run build` and `dist/` does not exist yet. A test that depends on
 * an artifact it does not produce is not a check; it is a coin toss about
 * whether someone built recently.
 *
 * So the assertion moved here, into the build that produces the artifact. It
 * cannot be skipped, cannot run against the wrong bundle, and fails the build
 * rather than reporting after the fact. `findWasmEvidence` is exported and
 * pure, so the rule itself is unit-testable without a build.
 */

import type { Plugin } from 'vite';

/**
 * WebAssembly instantiation, as it survives minification.
 *
 * Only the API calls that actually run wasm — a page can mention the word (this
 * project's own "no WebAssembly" sentence does) without executing any.
 */
const WASM_CALLS =
  /\bWebAssembly\s*\.\s*(instantiate|instantiateStreaming|compile|compileStreaming|Module|Instance)\b/;

/** Node-native addon loading, which has no business in a browser bundle. */
const NATIVE_CALLS = /\b(process\s*\.\s*dlopen|require\s*\(\s*['"]node:module['"]\s*\))/;

export interface EmittedFile {
  name: string;
  source: string;
}

/**
 * Names of files that contradict the purity claim, with what was found.
 * Empty array means the claim holds for this bundle.
 */
export function findWasmEvidence(files: EmittedFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (file.name.endsWith('.wasm')) {
      problems.push(`${file.name}: a WebAssembly module is emitted`);
      continue;
    }
    const wasm = file.source.match(WASM_CALLS);
    if (wasm) problems.push(`${file.name}: calls ${wasm[0]}`);
    const native = file.source.match(NATIVE_CALLS);
    if (native) problems.push(`${file.name}: calls ${native[0]}`);
  }
  return problems;
}

export function purity(): Plugin {
  return {
    name: 'dilithium-seal:purity',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files: EmittedFile[] = Object.values(bundle).map((asset) =>
        asset.type === 'chunk'
          ? { name: asset.fileName, source: asset.code }
          : { name: asset.fileName, source: String(asset.source) }
      );
      const problems = findWasmEvidence(files);
      if (problems.length > 0) {
        throw new Error(
          'purity: this build claims to be pure JavaScript with no WebAssembly or native ' +
            'code, and the bundle contradicts it:\n  ' +
            problems.join('\n  ') +
            '\nEither remove the dependency or change the claim in build/runtime-facts.ts ' +
            'and src/ui/implementation.ts. Do not delete this check.'
        );
      }
    },
  };
}
