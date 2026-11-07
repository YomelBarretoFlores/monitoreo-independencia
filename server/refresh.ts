// Refresh-on-read for serverless hosts (Vercel): there is no long-running scheduler, so each
// /api/panel request (and a daily cron) runs the sources that are overdue. Same rules as the
// scheduler: a source is due after its interval, and 15 minutes after a failed attempt.
import type { Collector } from './collectors/types.ts';
import { type Db, loadSnapshots, type Snapshot } from './db.ts';
import { RETRY_MINUTES, type RunResult, runCollector } from './scheduler.ts';

const t = (iso: string | null) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

/** Collectors whose snapshot is missing, older than their interval, or whose failure can be retried. */
export function dueCollectors(
  snaps: Map<string, Snapshot>,
  collectors: Collector[],
  now = Date.now(),
): Collector[] {
  return collectors.filter((c) => {
    const s = snaps.get(c.key);
    if (!s) return true;
    if (s.ok) return t(s.updatedAt) + c.everyMinutes * 60_000 <= now;
    return t(s.attemptedAt) + Math.min(RETRY_MINUTES, c.everyMinutes) * 60_000 <= now;
  });
}

/** Sources being fetched by this instance right now: a second request must not start them again. */
const inFlight = new Set<string>();

/**
 * Runs every due collector in parallel and stores the results. `snaps` can be passed when the
 * caller already loaded them. Returns one result per collector it started, in collector order.
 */
export async function refreshDue(
  db: Db,
  collectors: Collector[],
  snaps?: Map<string, Snapshot>,
): Promise<RunResult[]> {
  const current = snaps ?? (await loadSnapshots(db));
  const due = dueCollectors(current, collectors).filter((c) => !inFlight.has(c.key));
  for (const c of due) inFlight.add(c.key);
  try {
    return await Promise.all(due.map((c) => runCollector(db, c)));
  } finally {
    for (const c of due) inFlight.delete(c.key);
  }
}
