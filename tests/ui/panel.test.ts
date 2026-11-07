import { describe, expect, it } from 'vitest';
import type { FeedItem, Investment, RiverPoint, Section, SourceMeta } from '../../shared/types.ts';
import {
  countSince,
  filterInvestments,
  isLocal,
  normalize,
  oniPhase,
  rainNextDays,
  rebaseDates,
  riverTrend,
  sectionStatus,
  sortInvestments,
  tagCounts,
} from '../../src/lib/panel.ts';

const meta = (ok: boolean, updatedAt: string | null): SourceMeta => ({
  id: 'noticias',
  name: 'Noticias',
  url: 'https://example.org',
  updatedAt,
  ok,
  everyMinutes: 30,
});
const sec = <T>(ok: boolean, data: T | null): Section<T> => ({ meta: meta(ok, data ? '2026-11-07T10:00:00Z' : null), data });

describe('sectionStatus', () => {
  it('is loading when there is no panel yet', () => {
    expect(sectionStatus(undefined)).toBe('loading');
  });
  it('is error when the source never succeeded', () => {
    expect(sectionStatus(sec(false, null))).toBe('error');
  });
  it('is stale when the last attempt failed but there is older data', () => {
    expect(sectionStatus(sec(false, [1]))).toBe('stale');
  });
  it('is empty for an empty list, ready otherwise', () => {
    expect(sectionStatus(sec(true, []))).toBe('empty');
    expect(sectionStatus(sec(true, [1]))).toBe('ready');
    expect(sectionStatus(sec(true, { a: 1 }))).toBe('ready');
  });
});

describe('rainNextDays', () => {
  const daily = [
    { date: '2026-11-06', precipMm: 9, precipProbPct: null, tMaxC: null, tMinC: null },
    { date: '2026-11-07', precipMm: 4.2, precipProbPct: 80, tMaxC: 19, tMinC: 7 },
    { date: '2026-11-08', precipMm: 6, precipProbPct: 70, tMaxC: 18, tMinC: 7 },
    { date: '2026-11-09', precipMm: 1.3, precipProbPct: 40, tMaxC: 20, tMinC: 6 },
    { date: '2026-11-10', precipMm: 20, precipProbPct: 90, tMaxC: 17, tMinC: 6 },
  ];
  it('sums rain from today over the next days, ignoring the past', () => {
    expect(rainNextDays(daily, '2026-11-07', 3)).toBeCloseTo(11.5);
  });
});

describe('riverTrend', () => {
  const river = (vals: [number, boolean][]): RiverPoint => ({
    id: 'r',
    name: 'Río',
    point: [0, 0],
    referenceM3s: 10,
    level: 'normal',
    series: vals.map(([v, f], i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, dischargeM3s: v, maxM3s: null, forecast: f })),
  });
  it('rises when the forecast peak is well above the last observed value', () => {
    expect(riverTrend(river([[10, false], [10, true], [13, true]]))).toBe('sube');
  });
  it('falls when the forecast stays well below', () => {
    expect(riverTrend(river([[10, false], [8, true], [8.5, true]]))).toBe('baja');
  });
  it('is stable within 10% and unknown without data', () => {
    expect(riverTrend(river([[10, false], [10.5, true]]))).toBe('estable');
    expect(riverTrend(river([]))).toBe('sin-datos');
  });
});

describe('oniPhase', () => {
  it('uses the ±0.5 °C thresholds', () => {
    expect(oniPhase(2.46)).toBe('calido');
    expect(oniPhase(0.5)).toBe('calido');
    expect(oniPhase(0.49)).toBe('neutro');
    expect(oniPhase(-0.5)).toBe('frio');
  });
});

const item = (title: string, date: string, tags: string[] = []): FeedItem => ({ title, date, url: 'https://x.pe', source: 'X', tags });

describe('feeds', () => {
  const now = Date.parse('2026-11-07T20:00:00Z');
  it('counts items since N days ago', () => {
    const items = [item('a', '2026-11-07T10:00:00Z'), item('b', '2026-11-01T10:00:00Z'), item('c', '2026-10-20T10:00:00Z')];
    expect(countSince(items, now, 7)).toBe(2);
  });
  it('flags items about Independencia or Huaraz, accent-insensitive', () => {
    expect(isLocal(item('Huaicos en HUARAZ', '2026-11-07'))).toBe(true);
    expect(isLocal(item('Lluvias', '2026-11-07', ['Independencia']))).toBe(true);
    expect(isLocal(item('Lluvias en Piura', '2026-11-07'))).toBe(false);
  });
  it('counts tags, most frequent first then alphabetical', () => {
    const items = [item('a', '', ['Lluvias', 'Huaraz']), item('b', '', ['Huaraz']), item('c', '', ['Agua'])];
    expect(tagCounts(items)).toEqual([
      ['Huaraz', 2],
      ['Agua', 1],
      ['Lluvias', 1],
    ]);
  });
});

describe('investments', () => {
  const inv = (cui: string, name: string, cost: number | null, status = 'En ejecución'): Investment => ({
    cui,
    name,
    entity: 'MUNICIPALIDAD DISTRITAL DE INDEPENDENCIA',
    status,
    costSoles: cost,
    accruedSoles: null,
    progressPct: null,
    lastUpdate: null,
    url: 'https://x.pe',
  });
  const list = [inv('1', 'Riego Radián', 500), inv('2', 'Agua potable Tullparaju', null, 'Paralizada'), inv('3', 'Pistas', 900)];
  it('normalizes text for search', () => {
    expect(normalize('  Radián ÑANDÚ ')).toBe('radian nandu');
  });
  it('filters by name, CUI, status or entity ignoring accents and case', () => {
    expect(filterInvestments(list, 'radian').map((i) => i.cui)).toEqual(['1']);
    expect(filterInvestments(list, 'PARALIZADA').map((i) => i.cui)).toEqual(['2']);
    expect(filterInvestments(list, '3').map((i) => i.cui)).toEqual(['3']);
    expect(filterInvestments(list, '  ')).toHaveLength(3);
  });
  it('sorts by a key with missing values always last', () => {
    expect(sortInvestments(list, 'costSoles', 'desc').map((i) => i.cui)).toEqual(['3', '1', '2']);
    expect(sortInvestments(list, 'costSoles', 'asc').map((i) => i.cui)).toEqual(['1', '3', '2']);
    expect(sortInvestments(list, 'name', 'asc').map((i) => i.cui)).toEqual(['2', '3', '1']);
  });
  it('does not mutate the input list', () => {
    sortInvestments(list, 'costSoles', 'desc');
    expect(list.map((i) => i.cui)).toEqual(['1', '2', '3']);
  });
});

describe('rebaseDates (demo mode)', () => {
  it('shifts instants by the delta and calendar days by whole days, skipping chosen keys', () => {
    const delta = 2 * 86_400_000 + 3_600_000; // 2 days 1 hour
    const input = {
      generatedAt: '2026-11-07T20:00:00Z',
      daily: [{ date: '2026-11-07', precipMm: 1 }],
      season: 'ASO',
      elections: { asOf: '2026-10-14T03:55:00Z' },
    };
    expect(rebaseDates(input, delta, ['elections'])).toEqual({
      generatedAt: '2026-11-09T21:00:00.000Z',
      daily: [{ date: '2026-11-09', precipMm: 1 }],
      season: 'ASO',
      elections: { asOf: '2026-10-14T03:55:00Z' },
    });
  });
});
