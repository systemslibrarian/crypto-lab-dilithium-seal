/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { csp } from './build/csp.ts';

export default defineConfig({
  base: '/crypto-lab-dilithium-seal/',
  plugins: [csp()],
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
