/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/crypto-lab-dilithium-seal/',
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
