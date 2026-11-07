import type { DayForecast, FeedItem, Investment, RiverPoint, Section } from '../../shared/types.ts';

// Derived values and aggregations over the Panel (no DOM).

export type SectionStatus = 'loading' | 'error' | 'stale' | 'empty' | 'ready';

/** loading: no panel yet; error: never succeeded; stale: last fetch failed but old data exists. */
export function sectionStatus(s: Section<unknown> | undefined): SectionStatus {
  if (!s) return 'loading';
  if (s.data === null || s.data === undefined) return 'error';
  if (!s.meta.ok) return 'stale';
  if (Array.isArray(s.data) && s.data.length === 0) return 'empty';
  return 'ready';
}

/** Rain expected from today over the next `days` calendar days (mm). */
export function rainNextDays(daily: DayForecast[], today: string, days = 3): number {
  return daily
    .filter((d) => d.date >= today)
    .slice(0, days)
    .reduce((sum, d) => sum + (d.precipMm || 0), 0);
}

export type Trend = 'sube' | 'baja' | 'estable' | 'sin-datos';

/** Compare the forecast peak with the last observed discharge (±10% band = stable). */
export function riverTrend(r: RiverPoint): Trend {
  const past = r.series.filter((p) => !p.forecast);
  const future = r.series.filter((p) => p.forecast);
  const last = past.at(-1)?.dischargeM3s;
  if (last === undefined || future.length === 0) return 'sin-datos';
  const values = future.map((p) => p.dischargeM3s);
  const peak = Math.max(...values);
  const low = Math.max(...values.slice(0, 3));
  if (peak > last * 1.1) return 'sube';
  if (low < last * 0.9) return 'baja';
  return 'estable';
}

export const TREND_LABEL: Record<Trend, string> = {
  sube: 'Subiendo',
  baja: 'Bajando',
  estable: 'Estable',
  'sin-datos': 'Sin datos',
};

export type OniPhase = 'calido' | 'neutro' | 'frio';

/** NOAA convention: ONI ≥ +0.5 °C warm (El Niño), ≤ −0.5 °C cool (La Niña). */
export function oniPhase(anomaly: number): OniPhase {
  if (anomaly >= 0.5) return 'calido';
  if (anomaly <= -0.5) return 'frio';
  return 'neutro';
}

export function countSince<T extends { date: string }>(items: T[], now: number, days: number): number {
  const from = now - days * 86_400_000;
  return items.filter((i) => {
    const t = Date.parse(i.date);
    return !Number.isNaN(t) && t >= from;
  }).length;
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const LOCAL = /\b(independencia|huaraz)\b/;

/** Items about the district or its province get highlighted. */
export function isLocal(item: FeedItem): boolean {
  return LOCAL.test(normalize([item.title, item.summary ?? '', ...item.tags].join(' ')));
}

export function tagCounts(items: FeedItem[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const i of items) for (const t of new Set(i.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
}

export function filterInvestments(list: Investment[], query: string): Investment[] {
  const q = normalize(query);
  if (!q) return list;
  return list.filter((i) => normalize(`${i.cui} ${i.name} ${i.status} ${i.entity}`).includes(q));
}

export type InvestmentKey = 'name' | 'status' | 'costSoles' | 'accruedSoles' | 'progressPct';

/** Sorted copy; missing values always go last whatever the direction. */
export function sortInvestments(list: Investment[], key: InvestmentKey, dir: 'asc' | 'desc'): Investment[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
    return c * sign;
  });
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Demo mode: move every timestamp forward by `deltaMs` (bare days by whole days) so the
 * sample always looks current. Top-level keys in `skip` (e.g. elections) keep their dates.
 */
export function rebaseDates<T>(value: T, deltaMs: number, skip: string[] = []): T {
  const dayShift = Math.round(deltaMs / 86_400_000) * 86_400_000;
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') {
      if (INSTANT.test(v)) return new Date(Date.parse(v) + deltaMs).toISOString();
      if (DAY.test(v)) return new Date(Date.parse(`${v}T00:00:00Z`) + dayShift).toISOString().slice(0, 10);
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = depth === 0 && skip.includes(k) ? x : walk(x, depth + 1);
      return out;
    }
    return v;
  };
  return walk(value, 0) as T;
}
