// Runs every collector at boot (staggered, or when its data is due) and then on its interval.
// A failing collector keeps its last good data, is retried sooner, and never affects the others.
import type { Collector } from './collectors/types.ts';
import { type Db, loadSnapshots, saveFailure, saveSuccess } from './db.ts';
import { describeError } from './fetch.ts';

/** After a failure, retry within this many minutes (or the normal interval if shorter) */
const RETRY_MINUTES = 15;

export interface RunResult {
  key: string;
  ok: boolean;
  count?: number;
  error?: string;
}

export async function runCollector(db: Db, c: Collector, now = () => new Date()): Promise<RunResult> {
  let prev: unknown = null;
  try {
    prev = (await loadSnapshots(db)).get(c.key)?.data ?? null;
  } catch {
    // without the previous data the collector still runs (only INDECI uses it, for its history)
  }
  try {
    const data = await c.fetch(prev);
    await saveSuccess(db, c.key, data, now());
    return { key: c.key, ok: true, count: c.count(data) };
  } catch (e) {
    const error = describeError(e);
    try {
      await saveFailure(db, c.key, error, now());
    } catch (dbErr) {
      console.error(`No se pudo guardar el fallo de ${c.key}:`, (dbErr as Error).message);
    }
    return { key: c.key, ok: false, error };
  }
}

export interface Scheduler {
  stop(): void;
}

export async function startScheduler(
  db: Db,
  collectors: Collector[],
  opts: { staggerMs?: number; log?: (r: RunResult) => void } = {},
): Promise<Scheduler> {
  const stagger = opts.staggerMs ?? 4000;
  const log = opts.log ?? ((r) => console.log(r.ok ? `✓ ${r.key} (${r.count})` : `✗ ${r.key}: ${r.error}`));
  const timers = new Map<string, NodeJS.Timeout>();
  let stopped = false;
  const snaps = await loadSnapshots(db).catch(() => new Map());

  const schedule = (c: Collector, delayMs: number) => {
    if (stopped) return;
    timers.set(
      c.key,
      setTimeout(
        async () => {
          const r = await runCollector(db, c);
          log(r);
          schedule(c, (r.ok ? c.everyMinutes : Math.min(RETRY_MINUTES, c.everyMinutes)) * 60_000);
        },
        Math.max(0, delayMs),
      ),
    );
  };

  collectors.forEach((c, i) => {
    const s = snaps.get(c.key);
    // a fresh snapshot (e.g. after a quick restart) waits until it is due instead of refetching
    const dueIn = s?.ok && s.updatedAt ? Date.parse(s.updatedAt) + c.everyMinutes * 60_000 - Date.now() : 0;
    schedule(c, Math.max(i * stagger, dueIn));
  });

  return {
    stop() {
      stopped = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
