import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // npm run dev:server serves the API on 8787
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
