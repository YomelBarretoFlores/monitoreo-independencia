// Serverless hooks of the HTTP handler: refresh-on-read and the protected cron endpoint.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../../server/app.ts';
import { COLLECTORS } from '../../server/collectors/index.ts';
import { type Db, migrate, openDb, type Snapshot } from '../../server/db.ts';
import { loadStaticData } from '../../server/static-data.ts';

let db: Db;
let server: Server;
let base: string;
const reads: Map<string, Snapshot>[] = [];
let cronRuns = 0;

beforeAll(async () => {
  db = await openDb();
  await migrate(db);
  const handler = createHandler({
    db,
    collectors: COLLECTORS,
    staticData: loadStaticData(),
    onPanelRead: (snaps) => reads.push(snaps),
    cron: {
      secret: 's3cret',
      run: async () => {
        cronRuns++;
        return [{ key: 'noticias', ok: true, count: 3 }];
      },
    },
  });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe('refresh-on-read', () => {
  it('GET /api/panel answers with the stored data and hands the snapshots to onPanelRead', async () => {
    const res = await fetch(`${base}/api/panel`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('generatedAt');
    expect(reads).toHaveLength(1);
    expect(reads[0]).toBeInstanceOf(Map);
  });
});

describe('cron endpoint', () => {
  it('rejects a request without the bearer secret', async () => {
    const res = await fetch(`${base}/api/cron/collect`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'No autorizado.' });
    expect(cronRuns).toBe(0);
  });

  it('rejects a wrong secret', async () => {
    const res = await fetch(`${base}/api/cron/collect`, { headers: { authorization: 'Bearer otro' } });
    expect(res.status).toBe(401);
    expect(cronRuns).toBe(0);
  });

  it('runs the due collectors with the right secret and reports each result', async () => {
    const res = await fetch(`${base}/api/cron/collect`, { headers: { authorization: 'Bearer s3cret' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: [{ key: 'noticias', ok: true, count: 3 }] });
    expect(cronRuns).toBe(1);
  });

  it('does not exist when no cron secret is configured', async () => {
    const plain = createHandler({ db, collectors: [], staticData: loadStaticData() });
    const s = createServer((req, res) => void plain(req, res));
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/cron/collect`, {
      headers: { authorization: 'Bearer s3cret' },
    });
    expect(res.status).toBe(404);
    await new Promise((r) => s.close(r));
  });
});
