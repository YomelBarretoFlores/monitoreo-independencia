import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // npm run dev:server serves the API on 8787
    proxy: { '/api': 'http://localhost:8787' },
  },
  // the lazy map chunk (MapLibre, ~300 kB gzipped) is the only one above the default 500 kB
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
