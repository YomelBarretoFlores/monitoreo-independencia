// Open-Meteo forecast at the district center: past 7 + next 14 days (daily) and next 48 h (hourly).
import type { DayForecast, Forecast } from '../../shared/types.ts';
import { fetchJson } from '../fetch.ts';
import { CENTER, fromLima, limaHour } from '../util.ts';
import type { Collector } from './types.ts';

const DAILY = 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min';

export interface OpenMeteoDaily {
  time: string[];
  precipitation_sum: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
}

export interface OpenMeteoResponse {
  daily: OpenMeteoDaily;
  hourly?: { time: string[]; precipitation: (number | null)[] };
}

export function forecastUrl(
  [lat, lon]: [number, number],
  days: { past: number; future: number; hourly: boolean },
) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: DAILY,
    past_days: String(days.past),
    forecast_days: String(days.future),
    timezone: 'America/Lima',
  });
  if (days.hourly) q.set('hourly', 'precipitation');
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export const dailyRows = (d: OpenMeteoDaily): DayForecast[] =>
  d.time.map((date, i) => ({
    date,
    precipMm: d.precipitation_sum[i] ?? 0,
    precipProbPct: d.precipitation_probability_max?.[i] ?? null,
    tMaxC: d.temperature_2m_max?.[i] ?? null,
    tMinC: d.temperature_2m_min?.[i] ?? null,
  }));

export function parseForecast(raw: OpenMeteoResponse, now: Date): Forecast {
  const fromHour = limaHour(now);
  const h = raw.hourly ?? { time: [], precipitation: [] };
  const hourly = h.time
    .map((t, i) => ({ t, mm: h.precipitation[i] ?? 0 }))
    .filter((x) => x.t >= fromHour)
    .slice(0, 48)
    .map((x) => ({ time: fromLima(x.t), precipMm: x.mm }));
  return { point: CENTER, daily: dailyRows(raw.daily), hourly };
}

export const openMeteo: Collector<Forecast> = {
  key: 'open-meteo',
  info: {
    id: 'open-meteo',
    name: 'Open-Meteo – Pronóstico del tiempo',
    url: 'https://open-meteo.com/en/docs?latitude=-9.51&longitude=-77.53&timezone=America%2FLima',
    everyMinutes: 60,
  },
  everyMinutes: 60,
  async fetch() {
    const raw = await fetchJson<OpenMeteoResponse>(
      forecastUrl(CENTER, { past: 7, future: 14, hourly: true }),
    );
    return parseForecast(raw, new Date());
  },
  count: (d) => d.daily.length,
};
