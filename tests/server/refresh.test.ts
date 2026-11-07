// Refresh-on-read for serverless hosts: which sources are overdue, and running them once.
import { describe, expect, it } from 'vitest';
import type { Collector } from '../../server/collectors/types.ts';
import { type Db, loadSnapshots, migrate, openDb, type Snapshot } from '../../server/db.ts';
import { dueCollectors, refreshDue } from '../../server/refresh.ts';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const min = (m: number) => new Date(NOW - m * 60_000).toISOString();

const collector = (
  key: string,
  everyMinutes: number,
  fetch: () => Promise<unknown> = async () => [1],
): Collector => ({
  key,
  info: { id: 'noticias', name: key, url: 'https://example.org', everyMinutes },
  everyMinutes,
  fetch,
  count: (d) => (Array.isArray(d) ? d.length : 1),
});

const snap = (s: Partial<Snapshot>): Snapshot => ({
  data: [1],
  updatedAt: null,
  ok: true,
  error: null,
  attemptedAt: null,
  ...s,
});

describe('dueCollectors', () => {
  const a = collector('a', 60);
  it('a source with no snapshot is due', () => {
    expect(dueCollectors(new Map(), [a], NOW)).toEqual([a]);
  });
  it('a fresh source is not due; one older than its interval is', () => {
    expect(
      dueCollectors(new Map([['a', snap({ updatedAt: min(30), attemptedAt: min(30) })]]), [a], NOW),
    ).toEqual([]);
    expect(
      dueCollectors(new Map([['a', snap({ updatedAt: min(61), attemptedAt: min(61) })]]), [a], NOW),
    ).toEqual([a]);
  });
  it('after a failure it waits 15 minutes (or its interval if shorter) before trying again', () => {
    const failed = (m: number) =>
      new Map([['a', snap({ ok: false, updatedAt: min(300), attemptedAt: min(m) })]]);
    expect(dueCollectors(failed(10), [a], NOW)).toEqual([]);
    expect(dueCollectors(failed(16), [a], NOW)).toEqual([a]);
    const fast = collector('a', 5);
    expect(dueCollectors(failed(6), [fast], NOW)).toEqual([fast]);
  });
});

describe('refreshDue', () => {
  const fresh = async () => {
    const db: Db = await openDb();
    await migrate(db);
    return db;
  };

  it('runs only the due collectors and stores their data', async () => {
    const db = await fresh();
    let bRuns = 0;
    const a = collector('a', 60, async () => ['nuevo']);
    const b = collector('b', 60, async () => {
      bRuns++;
      return ['b'];
    });
    await db.query(
      `INSERT INTO snapshots (source_id, data, updated_at, ok, attempted_at) VALUES ('b', '["b"]', now(), true, now())`,
    );
    const results = await refreshDue(db, [a, b]);
    expect(results.map((r) => r.key)).toEqual(['a']);
    expect(bRuns).toBe(0);
    expect((await loadSnapshots(db)).get('a')).toMatchObject({ ok: true, data: ['nuevo'] });
    await db.close();
  });

  it('does not start a source twice while its first run is still going', async () => {
    const db = await fresh();
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = collector('slow', 60, async () => {
      runs++;
      await gate;
      return ['ok'];
    });
    const first = refreshDue(db, [slow]);
    const second = await refreshDue(db, [slow]);
    expect(second).toEqual([]);
    release();
    expect((await first).map((r) => r.ok)).toEqual([true]);
    expect(runs).toBe(1);
    await db.close();
  });

  it('a failing source is recorded and does not stop the others', async () => {
    const db = await fresh();
    const bad = collector('bad', 60, async () => {
      throw new Error('caído');
    });
    const good = collector('good', 60, async () => ['ok']);
    const results = await refreshDue(db, [bad, good]);
    expect(results).toEqual([
      { key: 'bad', ok: false, error: 'No se pudo leer la fuente: caído' },
      { key: 'good', ok: true, count: 1 },
    ]);
    await db.close();
  });
});
