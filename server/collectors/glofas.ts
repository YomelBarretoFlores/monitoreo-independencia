// Modeled river discharge from GloFAS (Copernicus), served by the Open-Meteo flood API.
// It is a hydrological model on a ~5 km grid (0.05°), not a gauge reading. The points are grid cells
// checked to carry different rivers (2026-11-07 survey of the cells around Huaraz): the Santa cell has
// ~50 m³/s and grows downstream (north); the Quillcay cell east of it has ~7 m³/s.
import type { Level, RiverPoint } from '../../shared/types.ts';
import { fetchJson } from '../fetch.ts';
import { limaDate, round } from '../util.ts';
import type { Collector } from './types.ts';

export const RIVER_POINTS: { id: string; name: string; point: [number, number] }[] = [
  { id: 'rio-santa', name: 'Río Santa (altura de Huaraz e Independencia)', point: [-9.525, -77.575] },
  { id: 'rio-quillcay', name: 'Río Quillcay (cerca de su unión con el Santa)', point: [-9.525, -77.525] },
];

interface FloodResponse {
  latitude: number;
  longitude: number;
  daily: { time: string[]; river_discharge: (number | null)[]; river_discharge_max?: (number | null)[] };
}

export function floodUrl() {
  const q = new URLSearchParams({
    latitude: RIVER_POINTS.map((p) => p.point[0]).join(','),
    longitude: RIVER_POINTS.map((p) => p.point[1]).join(','),
    daily: 'river_discharge,river_discharge_max',
    past_days: '30',
    forecast_days: '14',
  });
  return `https://flood-api.open-meteo.com/v1/flood?${q}`;
}

/**
 * Level rule (documented for the UI's method box): peak modeled discharge over the next 7 forecast
 * days divided by the mean of the past 30 days.
 *   < 1.5× normal · ≥ 1.5× atención · ≥ 2× alerta · ≥ 3× emergencia.
 * Without a reference (no past data) the level stays normal.
 */
export function riverLevel(series: RiverPoint['series'], referenceM3s: number | null): Level {
  if (!referenceM3s || referenceM3s <= 0) return 'normal';
  const next7 = series.filter((s) => s.forecast).slice(0, 7);
  if (!next7.length) return 'normal';
  const ratio = Math.max(...next7.map((s) => s.dischargeM3s)) / referenceM3s;
  if (ratio >= 3) return 'emergencia';
  if (ratio >= 2) return 'alerta';
  if (ratio >= 1.5) return 'atencion';
  return 'normal';
}

export function parseRivers(raw: FloodResponse | FloodResponse[], now: Date): RiverPoint[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const today = limaDate(now);
  return RIVER_POINTS.map((p, i) => {
    const d = list[i]?.daily;
    if (!d) throw new Error(`Falta la serie del punto ${p.id}`);
    const series = d.time.flatMap((date, j) => {
      const v = d.river_discharge[j];
      if (v == null) return [];
      return [{ date, dischargeM3s: v, maxM3s: d.river_discharge_max?.[j] ?? null, forecast: date >= today }];
    });
    const past = series.filter((s) => !s.forecast);
    const referenceM3s = past.length
      ? round(past.reduce((a, s) => a + s.dischargeM3s, 0) / past.length, 2)
      : null;
    return {
      id: p.id,
      name: p.name,
      point: p.point,
      series,
      referenceM3s,
      level: riverLevel(series, referenceM3s),
    };
  });
}

export const glofas: Collector<RiverPoint[]> = {
  key: 'glofas',
  info: {
    id: 'glofas',
    name: 'GloFAS (Copernicus) vía Open-Meteo – Caudal modelado de ríos',
    url: 'https://open-meteo.com/en/docs/flood-api?latitude=-9.525&longitude=-77.575',
    everyMinutes: 180,
  },
  everyMinutes: 180,
  async fetch() {
    return parseRivers(await fetchJson<FloodResponse[]>(floodUrl()), new Date());
  },
  count: (d) => d.length,
};
