// SENAMHI weather warnings that cover the district.
// 1. The public list (https://www.senamhi.gob.pe/?p=aviso-meteorologico) gives number, title, dates and
//    the highest national level of each warning.
// 2. Each warning has one map per day (mapa 1..n). SENAMHI publishes their polygons in the IDESEP
//    GeoServer layer g_aviso:view_aviso, selected with viewparams=qry:{number}_{map}_{year}. A WMS
//    GetFeatureInfo at the district center returns the polygon that covers it (if any), with its own
//    level ("Nivel 2/3/4") and exact validity (fech_ini/fech_fin, UTC).
import type { Level, WeatherWarning } from '../../shared/types.ts';
import { fetchJson, fetchText } from '../fetch.ts';
import { CENTER, limaDate, sentenceCase, stripTags } from '../util.ts';
import type { Collector } from './types.ts';

const LIST_URL = 'https://www.senamhi.gob.pe/?p=aviso-meteorologico';
const WMS = 'https://idesep.senamhi.gob.pe/geoserver/g_aviso/wms';

export interface ListedWarning {
  number: number;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  /** Highest level anywhere in the country (2 amarillo, 3 naranja, 4 rojo); the district may be lower */
  tableLevel: number;
  url: string;
  /** One map per day of validity */
  mapCount: number;
  year: number;
}

export interface MapCoverage {
  number: number;
  map: number;
  nivel: number;
  start: string;
  end: string;
}

const LEVEL_CLASS: Record<string, number> = { uno: 1, dos: 2, tres: 3, cuatro: 4 };
const NIVEL_LEVEL: Record<number, Level> = { 2: 'atencion', 3: 'alerta', 4: 'emergencia' };
const NIVEL_COLOR: Record<number, string> = { 1: 'verde', 2: 'amarillo', 3: 'naranja', 4: 'rojo' };

const dayCount = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000) + 1;

export function parseWarningList(html: string): ListedWarning[] {
  const body = html.slice(
    html.indexOf('<tbody'),
    html.indexOf('</tbody>') > 0 ? html.indexOf('</tbody>') : undefined,
  );
  const out: ListedWarning[] = [];
  for (const row of body.split(/<\/tr>/i)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]!);
    if (cells.length < 7) continue;
    const href = /href="\.?\/?(\?p=aviso-meteorologico[^"]+)"/.exec(cells[0]!)?.[1];
    const number = Number(/(\d+)/.exec(stripTags(cells[1]!))?.[1]);
    const [startDate, endDate] = [stripTags(cells[3]!), stripTags(cells[4]!)];
    if (!href || !number || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
      continue;
    const year = Number(/[?&]a=(\d{4})/.exec(href)?.[1] ?? startDate.slice(0, 4));
    out.push({
      number,
      title: sentenceCase(stripTags(cells[0]!)),
      startDate,
      endDate,
      tableLevel: LEVEL_CLASS[/class="(\w+)"/.exec(cells[6]!)?.[1] ?? ''] ?? 0,
      url: 'https://www.senamhi.gob.pe/' + href.replace(/&amp;/g, '&'),
      mapCount: Math.max(1, Math.min(10, dayCount(startDate, endDate))),
      year,
    });
  }
  return out;
}

/** Warnings whose last day is today or later (Lima). Cancelled ones are skipped */
export const activeListed = (listed: ListedWarning[], now: Date) =>
  listed.filter((w) => w.endDate >= limaDate(now) && !/CANCELADO/i.test(w.title));

export function featureInfoUrl(number: number, map: number, year: number): string {
  const [lat, lon] = CENTER;
  const d = 0.01;
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetFeatureInfo',
    layers: 'g_aviso:view_aviso',
    query_layers: 'g_aviso:view_aviso',
    styles: '',
    srs: 'EPSG:4326',
    // a 101×101 px box of ±0.01° around the center; the query pixel (50,50) is the center itself
    bbox: [lon - d, lat - d, lon + d, lat + d].join(','),
    width: '101',
    height: '101',
    x: '50',
    y: '50',
    info_format: 'application/json',
    feature_count: '10',
    propertyName: 'nro_aviso,nro_mapa,nivel,fech_ini,fech_fin',
    viewparams: `qry:${number}_${map}_${year}`,
  });
  return `${WMS}?${q}`;
}

export function parseFeatureInfo(json: unknown): MapCoverage[] {
  const feats = (json as { features?: { properties?: Record<string, unknown> }[] })?.features ?? [];
  return feats.flatMap((f) => {
    const p = f.properties ?? {};
    const nivel = Number(/(\d)/.exec(String(p.nivel ?? ''))?.[1]);
    const start = Date.parse(String(p.fech_ini));
    const end = Date.parse(String(p.fech_fin));
    if (!nivel || Number.isNaN(start) || Number.isNaN(end)) return [];
    return [
      {
        number: Number(p.nro_aviso),
        map: Number(p.nro_mapa),
        nivel,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      },
    ];
  });
}

/** Warnings that cover the district and have not ended yet, most severe first, then soonest */
export function buildWarnings(
  listed: ListedWarning[],
  coverage: Map<number, MapCoverage[]>,
  now: Date,
): WeatherWarning[] {
  const out: WeatherWarning[] = [];
  for (const w of listed) {
    // a level-1 polygon (verde) is not a warning
    const maps = (coverage.get(w.number) ?? []).filter(
      (m) => m.nivel >= 2 && Date.parse(m.end) > now.getTime(),
    );
    if (!maps.length) continue;
    const nivel = Math.max(...maps.map((m) => m.nivel));
    out.push({
      number: w.number,
      title: w.title,
      level: NIVEL_LEVEL[nivel]!,
      levelLabel: `Nivel ${nivel} (${NIVEL_COLOR[nivel]})`,
      start: maps.map((m) => m.start).sort()[0]!,
      end: maps
        .map((m) => m.end)
        .sort()
        .at(-1)!,
      url: w.url,
    });
  }
  return out.sort((a, b) => b.levelLabel.localeCompare(a.levelLabel) || a.start.localeCompare(b.start));
}

export const senamhiAvisos: Collector<WeatherWarning[]> = {
  key: 'senamhi-avisos',
  info: { id: 'senamhi-avisos', name: 'SENAMHI – Avisos meteorológicos', url: LIST_URL, everyMinutes: 60 },
  everyMinutes: 60,
  async fetch() {
    const now = new Date();
    const listed = activeListed(parseWarningList(await fetchText(LIST_URL)), now);
    const coverage = new Map<number, MapCoverage[]>();
    // sequential on purpose: a handful of small requests per hour, gentle with the GeoServer
    for (const w of listed) {
      const maps: MapCoverage[] = [];
      for (let m = 1; m <= w.mapCount; m++)
        maps.push(...parseFeatureInfo(await fetchJson(featureInfoUrl(w.number, m, w.year))));
      coverage.set(w.number, maps);
    }
    return buildWarnings(listed, coverage, now);
  },
  count: (d) => d.length,
};
