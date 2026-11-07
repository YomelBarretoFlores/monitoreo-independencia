# despliegue-vercel: run the monitoring system on Vercel

Objective: make the app deployable on Vercel (static UI + Node functions) with Postgres for snapshots, refresh-on-read and a daily cron, without breaking the Docker/`npm start` path.
Branch: `feat/vercel` (from `main`). Delivery: `ask-on-risk`; no deploy until the user links the project. Test runner: `npm test`, `npm run typecheck`, `npm run build`, local `vercel build`.

## Specs

- S1 (verbatim): "Vercel según creo que acepta dockerfile o no?, lo más probable es que opte por vercel." / "Sí, adapta." → adapt to Vercel with the scheme proposed in L1: Postgres (Neon) through `DATABASE_URL`; when `/api/panel` is requested, serve the stored snapshots and refresh the overdue sources in the background (`waitUntil`); a daily Vercel cron for when nobody visits. Every 30 minutes without visits would need Pro (not required).
- S2 (assumption) The cron endpoint only runs with `Authorization: Bearer $CRON_SECRET` (Vercel sends it when `CRON_SECRET` is set); without the secret configured the endpoint does not exist (404).
- S3 (assumption) The long-running server (`npm start`, Dockerfile) keeps working unchanged.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2, S3 | inline | done: `server/refresh.ts`, `onPanelRead` + `cron` hooks in `server/app.ts`, `server/vercel.ts`, `scripts/build-vercel.ts` (Build Output API), `vercel.json`, README; 119 tests, smoke test against Postgres wire, local `vercel build` OK | (this commit) |

## Log

- L1 (2026-11-07) Proposal accepted by the user: "Sí, adapta." Context: Vercel container images must be stateless and scale to zero after 5 min idle (no in-process scheduler, no PGlite file); Hobby cron is daily-only.
- L2 (2026-11-07) Vercel's zero-config `api/*.ts` build failed locally: it uses the project's TypeScript 7.0.2 (native compiler, no JS API) → "Cannot read properties of undefined (reading 'readFile')". Switched to the Build Output API: Vite SSR bundles `server/vercel.ts` into one function per API path with `data/` beside it. Found during the smoke test: `lakes.ts` read `data/lagunas.json` relative to its own module, which breaks once bundled → now uses `DATA_DIR` from `static-data.ts`.
- L3 (2026-11-07) Evidence: bundle without DATABASE_URL → 503 `{"error":"El servidor no está configurado todavía."}`; with a Postgres wire server (pglite-socket 0.2.14 in scratch) → /api/panel 200, cron 401 without/with wrong secret, 200 with it; after the first read the background refresh stored all 12 sources OK; local `vercel build` → "Build completed successfully" keeping 3 functions and the daily cron. Dependency: `@vercel/functions` pinned to 3.10.3 (3.11.0 published today); npm audit flags zod via `@vercel/oidc` in that range, but the `waitUntil` entry never loads the `./oidc` subpath; bump to ≥3.11.0 after 2026-11-21.

- L4 (2026-11-07) Independent verifier: no blockers; S1–S3 met (bundle probes: 503 + retry without DB, cron 404/401 variants/200, 12 sources via cron, no leaks; api.test.ts untouched). Applied advisories: close the pg pool when `migrate` fails; security headers on static files via the Build Output config. Left as known: duplicate fetch possible when cron and a panel read overlap on different instances (harmless, writes overwrite); unknown paths get Vercel's 404 page (UI uses hash routes).
