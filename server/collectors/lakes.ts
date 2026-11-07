// Glacial lakes above the district: static facts (data/lagunas.json, from ANA) plus the 7-day
// Open-Meteo forecast at each lake. There is no public real-time lake monitoring (INAIGEM's Palcacocha
// telemetry has no public feed), so liveMonitoring is false for all of them.
import { readFileSync } from 'node:fs';
import type { GlacialLake } from '../../shared/types.ts';
import { fetchJson } from '../fetch.ts';
import { dailyRows, type OpenMeteoDaily } from './open-meteo.ts';
import type { Collector } from './types.ts';

export type LakeFact = Omit<GlacialLake, 'forecast' | 'liveMonitoring'> & { anaPolygonId?: number };

const FILE = new URL('../../data/lagunas.json', import.meta.url);
export const LAKES: LakeFact[] = (JSON.parse(readFileSync(FILE, 'utf8')) as { lagunas: LakeFact[] }).lagunas;

export function lakesUrl(lakes: LakeFact[]) {
  const q = new URLSearchParams({
    latitude: lakes.map((l) => l.point[0]).join(','),
    longitude: lakes.map((l) => l.point[1]).join(','),
    daily: 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min',
    forecast_days: '7',
    timezone: 'America/Lima',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function parseLakes(
  raw: { daily: OpenMeteoDaily } | { daily: OpenMeteoDaily }[],
  lakes: LakeFact[],
): GlacialLake[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return lakes.map(({ anaPolygonId: _omit, ...l }, i) => ({
    ...l,
    forecast: list[i] ? dailyRows(list[i]!.daily) : [],
    liveMonitoring: false,
  }));
}

export const lakes: Collector<GlacialLake[]> = {
  key: 'lagunas',
  info: {
    id: 'open-meteo',
    name: 'Lagunas glaciares – ANA (datos fijos) y pronóstico Open-Meteo',
    url: 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico/Lagunas/MapServer',
    everyMinutes: 180,
  },
  everyMinutes: 180,
  async fetch() {
    return parseLakes(await fetchJson(lakesUrl(LAKES)), LAKES);
  },
  count: (d) => d.length,
};
