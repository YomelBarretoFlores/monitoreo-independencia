// HTTP API on in-memory PGlite with stubbed collectors (no network).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../../server/app.ts';
import { COLLECTORS } from '../../server/collectors/index.ts';
import type { Collector } from '../../server/collectors/types.ts';
import { type Db, migrate, openDb } from '../../server/db.ts';
import type { PanelResponse } from '../../server/panel.ts';
import { runCollector } from '../../server/scheduler.ts';
import { loadStaticData } from '../../server/static-data.ts';
import type { RiverPoint, WeatherWarning } from '../../shared/types.ts';

const byKey = (k: string) => COLLECTORS.find((c) => c.key === k)!;
const stub = <T>(key: string, fetch: Collector<T>['fetch']): Collector<T> => ({ ...byKey(key), fetch });

const warning: WeatherWarning = {
  number: 456,
  title: 'Precipitaciones en la costa y sierra',
  level: 'alerta',
  levelLabel: 'Nivel 3 (naranja)',
  start: new Date(Date.now() - 3600_000).toISOString(),
  end: new Date(Date.now() + 86400_000).toISOString(),
  url: 'https://www.senamhi.gob.pe/',
};
const river: RiverPoint = {
  id: 'rio-santa',
  name: 'Río Santa',
  point: [-9.5, -77.5],
  series: [],
  referenceM3s: null,
  level: 'normal',
};

let db: Db;
let server: Server;
let base: string;
let dist: string;
let failRivers = false;

// collectors with canned data; glofas can be switched to fail
const collectors: Collector[] = COLLECTORS.map((c) => {
  if (c.key === 'senamhi-avisos') return stub('senamhi-avisos', async () => [warning]);
  if (c.key === 'glofas')
    return stub('glofas', async () => {
      if (failRivers) throw new Error('boom');
      return [river];
    });
  if (c.key === 'enfen')
    return stub('enfen', async () => ({
      status: 'Alerta de El Niño Costero',
      level: 'alerta',
      communiques: [],
    }));
  return stub(c.key, async () => {
    throw new Error('sin red en las pruebas');
  });
});

beforeAll(async () => {
  db = await openDb();
  await migrate(db);
  dist = mkdtempSync(join(tmpdir(), 'monitoreo-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Monitoreo</title>');
  writeFileSync(join(dist, 'assets', 'app-abc.js'), 'console.log(1)'.repeat(200));
  const handler = createHandler({ db, collectors, staticData: loadStaticData(), dist });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  for (const c of collectors) await runCollector(db, c);
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  rmSync(dist, { recursive: true, force: true }); // the test's own temp dir
});

const getPanel = async () => {
  const res = await fetch(`${base}/api/panel`);
  return { res, body: (await res.json()) as PanelResponse };
};

describe('GET /api/panel', () => {
  it('returns the contract shape with every section, meta and the summary', async () => {
    const { res, body } = await getPanel();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    for (const k of [
      'warnings',
      'forecast',
      'rivers',
      'lakes',
      'elNino',
      'emergencies',
      'earthquakes',
      'news',
      'legal',
      'risk',
      'management',
      'elections',
    ] as const) {
      expect(body[k]).toHaveProperty('meta');
      expect(body[k]).toHaveProperty('data');
      expect(body[k].meta).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        url: expect.stringMatching(/^https:\/\//),
      });
    }
    expect(body.district).toMatchObject({
      ubigeo: '020105',
      name: 'Independencia',
      province: 'Huaraz',
      region: 'Áncash',
    });
    expect(body.warnings).toMatchObject({
      meta: { id: 'senamhi-avisos', ok: true, everyMinutes: 60 },
      data: [warning],
    });
    expect(body.warnings.meta.updatedAt).toEqual(expect.any(String));
    expect(body.elNino.data).toMatchObject({
      enfenStatus: 'Alerta de El Niño Costero',
      enfenLevel: 'alerta',
      oni: [],
    });
    expect(body.summary.level).toBe('alerta');
    expect(body.summary.reasons[0]).toMatch(/^SENAMHI: aviso N° 456/);
    // static datasets imported from resultados-ancash and the OSM outline
    expect(body.management.meta).toMatchObject({ id: 'inversiones', ok: true, everyMinutes: null });
    expect(body.management.data!.investments.length).toBeGreaterThan(0);
    expect(body.elections.data!.parties.length).toBeGreaterThan(0);
    expect(body.boundary).toMatchObject({
      type: 'Feature',
      geometry: { type: expect.stringMatching(/Polygon/) },
    });
    // every source, including the ONI that is merged into elNino
    expect(body.sources.map((s) => s.id)).toContain('noaa-oni');
  });

  it('a source that never succeeded has data null, ok false and a plain error', async () => {
    const { body } = await getPanel();
    expect(body.news).toEqual({
      meta: expect.objectContaining({
        id: 'noticias',
        ok: false,
        updatedAt: null,
        error: 'No se pudo leer la fuente: sin red en las pruebas',
      }),
      data: null,
    });
  });

  it('a failing collector keeps the last good data with ok false', async () => {
    const before = (await getPanel()).body.rivers;
    expect(before.meta.ok).toBe(true);
    failRivers = true;
    const r = await runCollector(
      db,
      collectors.find((c) => c.key === 'glofas')!,
    );
    failRivers = false;
    expect(r).toEqual({ key: 'glofas', ok: false, error: 'No se pudo leer la fuente: boom' });
    const after = (await getPanel()).body.rivers;
    expect(after.data).toEqual([river]);
    expect(after.meta).toMatchObject({
      ok: false,
      error: 'No se pudo leer la fuente: boom',
      updatedAt: before.meta.updatedAt,
    });
  });

  it('is gzipped when the client accepts it', async () => {
    const res = await fetch(`${base}/api/panel`, { headers: { 'Accept-Encoding': 'gzip' } });
    // fetch decompresses transparently; check the header and that the body still parses
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect((await res.json()) as PanelResponse).toHaveProperty('summary');
  });
});

describe('other routes', () => {
  it('GET /api/health lists every source', async () => {
    const res = await fetch(`${base}/api/health`);
    const body = (await res.json()) as { ok: boolean; sources: { id: string; ok: boolean }[] };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // one per SourceId (the lakes share open-meteo's)
    expect(body.sources.map((s) => s.id).sort()).toEqual(
      [...new Set([...COLLECTORS.map((c) => c.info.id), 'inversiones', 'elecciones'])].sort(),
    );
  });

  it('unknown API routes are 404 JSON; other methods are 405', async () => {
    expect((await fetch(`${base}/api/nada`)).status).toBe(404);
    expect((await fetch(`${base}/api/panel`, { method: 'POST' })).status).toBe(405);
  });

  it('serves dist/ files and falls back to index.html for app routes', async () => {
    const js = await fetch(`${base}/assets/app-abc.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(js.headers.get('cache-control')).toMatch(/immutable/);
    const page = await fetch(`${base}/lluvias/detalle`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Monitoreo</title>');
    expect((await fetch(`${base}/assets/no-existe.js`)).status).toBe(404);
    expect((await fetch(`${base}/../package.json`)).status).not.toBe(200);
  });
});
