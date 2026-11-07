// Server entry: npm start (node server/index.ts)
//   PORT          port (8787; production sets 80)
//   DATABASE_URL  Postgres for the source snapshots. Without it, PGlite stored in DATA_DIR (./.datos)
//   DIST_DIR      built UI to serve (./dist)
//   COLLECT=0     do not run the collectors (serve whatever is stored; handy while working on the UI)
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createHandler } from './app.ts';
import { COLLECTORS } from './collectors/index.ts';
import { migrate, openDb, readDbConfig } from './db.ts';
import { startScheduler } from './scheduler.ts';
import { loadStaticData } from './static-data.ts';

const port = Number(process.env.PORT ?? 8787);
const dist = resolve(process.env.DIST_DIR ?? 'dist');

const db = await openDb(readDbConfig(process.env));
await migrate(db);
const handler = createHandler({ db, collectors: COLLECTORS, staticData: loadStaticData(), dist });

const server = createServer((req, res) => void handler(req, res)).listen(port, () =>
  console.log(`Monitoreo Independencia en http://localhost:${port}`),
);

const scheduler = process.env.COLLECT === '0' ? null : await startScheduler(db, COLLECTORS);

// Docker sends SIGTERM on redeploy: stop the timers and close the database cleanly (PGlite needs it)
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    scheduler?.stop();
    server.close();
    server.closeAllConnections();
    void db.close().finally(() => process.exit(0));
  });
