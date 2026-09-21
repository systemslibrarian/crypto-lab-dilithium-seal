/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { csp } from './build/csp.ts';
import { readRuntimeFacts } from './build/runtime-facts.ts';

export default defineConfig({
  base: '/crypto-lab-dilithium-seal/',
  plugins: [csp()],
  // Derived from package-lock.json, so the version the page prints is the
  // version npm ci installed. See build/runtime-facts.ts. Applies to vitest
  // too, which is what lets src/__tests__/runtime.test.ts re-read the lockfile
  // and assert the two have not drifted apart.
  define: {
    __RUNTIME_FACTS__: JSON.stringify(readRuntimeFacts()),
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
