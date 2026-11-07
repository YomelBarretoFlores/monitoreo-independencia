// Vercel entry: the same HTTP handler as `npm start`, as a Node function. Vercel functions are
// stateless and stop between requests, so there is no scheduler here:
//   - each /api/panel read refreshes the overdue sources after answering (waitUntil);
//   - a daily Vercel cron calls /api/cron/collect (vercel.json) for days without visits.
// Needs DATABASE_URL (Postgres, e.g. Neon) and CRON_SECRET in the project's environment variables.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import { createHandler } from './app.ts';
import { COLLECTORS } from './collectors/index.ts';
import { migrate, openDb } from './db.ts';
import { refreshDue } from './refresh.ts';
import { loadStaticData } from './static-data.ts';

type Handler = ReturnType<typeof createHandler>;

/** Built once per function instance and reused by later requests on the same instance. */
let ready: Promise<Handler> | null = null;

async function build(env: NodeJS.ProcessEnv): Promise<Handler> {
  if (!env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL (Postgres) en Vercel.');
  const db = await openDb({ databaseUrl: env.DATABASE_URL });
  await migrate(db);
  const logFailure = (e: unknown) => console.error('refresh', e);
  return createHandler({
    db,
    collectors: COLLECTORS,
    staticData: loadStaticData(),
    onPanelRead: (snaps) => waitUntil(refreshDue(db, COLLECTORS, snaps).catch(logFailure)),
    cron: env.CRON_SECRET ? { secret: env.CRON_SECRET, run: () => refreshDue(db, COLLECTORS) } : undefined,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= build(process.env);
  let handle: Handler;
  try {
    handle = await ready;
  } catch (e) {
    ready = null; // try again on the next request (e.g. after the variable is added)
    console.error(e);
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'El servidor no está configurado todavía.' }));
    return;
  }
  await handle(req, res);
}
