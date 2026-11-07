// IGP (Instituto Geofísico del Perú) earthquakes reported this year, within 150 km of the district
// center and in the last 90 days.
import type { Earthquake } from '../../shared/types.ts';
import { fetchJson } from '../fetch.ts';
import { CENTER, haversineKm, round } from '../util.ts';
import type { Collector } from './types.ts';

const RADIUS_KM = 150;
const DAYS = 90;
const api = (year: number) => `https://ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb/${year}`;

interface IgpRow {
  codigo: string;
  fecha_utc: string; // "2026-11-07T00:00:00.000Z" (date part only)
  hora_utc: string; // "1970-01-01T07:27:16.000Z" (time part only)
  latitud: string;
  longitud: string;
  magnitud: string;
  profundidad: number | null;
  referencia: string;
}

export function parseQuakes(rows: IgpRow[], now: Date): Earthquake[] {
  const since = now.getTime() - DAYS * 86400_000;
  return rows
    .flatMap((r) => {
      const date = new Date(`${r.fecha_utc.slice(0, 10)}T${r.hora_utc.slice(11, 19)}Z`);
      const point: [number, number] = [Number(r.latitud), Number(r.longitud)];
      if (Number.isNaN(date.getTime()) || point.some(Number.isNaN)) return [];
      const distanceKm = round(haversineKm(CENTER, point), 1);
      if (distanceKm > RADIUS_KM || date.getTime() < since || date.getTime() > now.getTime()) return [];
      return [
        {
          date: date.toISOString(),
          magnitude: Number(r.magnitud),
          depthKm: r.profundidad ?? null,
          point,
          reference: r.referencia,
          distanceKm,
          url: `https://ultimosismo.igp.gob.pe/evento/${encodeURIComponent(r.codigo)}`,
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const igpSismos: Collector<Earthquake[]> = {
  key: 'igp-sismos',
  info: {
    id: 'igp-sismos',
    name: 'IGP – Sismos reportados',
    url: 'https://ultimosismo.igp.gob.pe/ultimo-sismo/sismos-reportados',
    everyMinutes: 30,
  },
  everyMinutes: 30,
  async fetch() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const rows = await fetchJson<IgpRow[]>(api(year));
    // early in the year the 90-day window reaches into last year's list
    const startOfYear = Date.UTC(year, 0, 1);
    if (now.getTime() - DAYS * 86400_000 < startOfYear)
      rows.push(...(await fetchJson<IgpRow[]>(api(year - 1))));
    return parseQuakes(rows, now);
  },
  count: (d) => d.length,
};
