// Builds the Vercel deployment with the Build Output API (https://vercel.com/docs/build-output-api):
//   .vercel/output/static/                  the UI from dist/ (run `npm run build` first)
//   .vercel/output/functions/api/<x>.func/  server/vercel.ts bundled by Vite (SSR) + data/
//   .vercel/output/config.json              routes, asset caching and the daily cron
// Vercel's own TypeScript step can't compile this project (TypeScript 7 has no JS API), so the
// function is bundled here and Vercel deploys the output as is.
//   node scripts/build-vercel.ts            (npm run build:vercel)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}.vercel/output`;

/** API paths, one function each so every function sees its own URL (the handler routes by it). */
export const FUNCTIONS = ['api/panel', 'api/health', 'api/cron/collect'];
/** 06:00 in Lima (UTC−5). Hobby plans allow one run per day. */
export const CRON = { path: '/api/cron/collect', schedule: '0 11 * * *' };
export const REGION = 'gru1'; // São Paulo, the closest Vercel region to Huaraz

export const vcConfig = {
  runtime: 'nodejs22.x',
  handler: 'server/vercel.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  supportsResponseStreaming: true,
  maxDuration: 300,
  regions: [REGION],
};

export const outputConfig = {
  version: 3,
  routes: [
    {
      src: '^/assets/(.*)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    { handle: 'filesystem' },
  ],
  crons: [CRON],
};

async function main() {
  if (!existsSync(`${root}dist/index.html`)) throw new Error('Falta dist/: ejecute npm run build antes.');
  rmSync(out, { recursive: true, force: true });
  cpSync(`${root}dist`, `${out}/static`, { recursive: true });

  const bundle = `${root}.vercel/bundle`;
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: `${root}server/vercel.ts`,
      outDir: bundle,
      emptyOutDir: true,
      target: 'node22',
      minify: false,
      rollupOptions: {
        // PGlite is only for local runs (no DATABASE_URL); pg-native is an optional pg add-on
        external: ['@electric-sql/pglite', 'pg-native'],
        output: { format: 'es', entryFileNames: 'vercel.mjs' },
      },
    },
  });

  for (const fn of FUNCTIONS) {
    const dir = `${out}/functions/${fn}.func`;
    // same layout as the repo: server/vercel.mjs reads ../data/ like server/static-data.ts does
    mkdirSync(`${dir}/server`, { recursive: true });
    cpSync(bundle, `${dir}/server`, { recursive: true });
    cpSync(`${root}data`, `${dir}/data`, { recursive: true });
    writeFileSync(`${dir}/package.json`, JSON.stringify({ type: 'module' }));
    writeFileSync(`${dir}/.vc-config.json`, JSON.stringify(vcConfig, null, 2));
  }
  writeFileSync(`${out}/config.json`, JSON.stringify(outputConfig, null, 2));
  rmSync(bundle, { recursive: true, force: true });
  console.log(
    `.vercel/output listo: ${FUNCTIONS.length} funciones, cron ${CRON.schedule} (UTC), región ${REGION}.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
