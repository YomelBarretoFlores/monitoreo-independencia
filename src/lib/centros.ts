import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { esc, fmtNum } from './format.ts';
import { LAKE_POINT } from './palcacocha.ts';

// Centros poblados of Independencia and Huaraz with an access-gap index (data/centros-poblados.json, built by
// scripts/centros/build.py). Pure: the 3D columns, their colours, the popup and the camera tour.

export interface Centro {
  code: string;
  name: string;
  district: 'independencia' | 'huaraz';
  area: 'urbano' | 'rural';
  lon: number;
  lat: number;
  /** Best 4G coverage of the centro poblado's area across operators, % */
  cov4g: number;
  /** Censos 2017; null when the centro poblado has no census row */
  pop: number | null;
  dwellings: number | null;
  alt: number | null;
  schoolKm: number;
  healthKm: number;
  conectividad: number;
  educacion: number;
  salud: number;
  /** 0 = no gap, 100 = largest gap */
  indice: number;
}

export interface CentrosData {
  builtAt: string;
  method: string;
  sources: Record<string, { label: string; url: string }>;
  totals2017: { independencia: number; huaraz: number };
  centros: Centro[];
}

/** Sequential scale for the gap (violet, kept apart from the hazard map's traffic-light colours) */
export const GAP_STOPS: [number, string][] = [
  [0, '#d8ccef'],
  [25, '#ad97dc'],
  [50, '#9177c9'],
  [75, '#5e3fa3'],
  [100, '#2e1a63'],
];

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function gapColor(indice: number): string {
  const x = Math.min(100, Math.max(0, indice));
  for (let i = 1; i < GAP_STOPS.length; i++) {
    const [a, ca] = GAP_STOPS[i - 1]!;
    const [b, cb] = GAP_STOPS[i]!;
    if (x <= b) {
      if (x === a) return ca;
      if (x === b) return cb;
      const k = (x - a) / (b - a);
      const [r, g, bl] = hex(ca).map((v, j) => Math.round(v + (hex(cb)[j]! - v) * k));
      return `#${[r, g, bl].map((v) => v!.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return GAP_STOPS[GAP_STOPS.length - 1]![1];
}

/** Column height in metres: the gap, plus a stub so a centro without gaps still shows */
export const columnHeightM = (indice: number) => Math.round(30 + Math.max(0, indice) * 8);
/** Column side in metres: grows with the log of the 2017 population */
export const columnSideM = (pop: number | null) => Math.round(70 + 24 * Math.log10((pop ?? 0) + 1));

const M_PER_DEG_LAT = 110_600;
const M_PER_DEG_LON = 109_800; // at Huaraz's latitude

export interface ColumnProps {
  uid: number;
  height: number;
  color: string;
  indice: number;
  district: Centro['district'];
}

export function toColumns(centros: readonly Centro[]): FeatureCollection<Polygon, ColumnProps> {
  return {
    type: 'FeatureCollection',
    features: centros.map((c, uid): Feature<Polygon, ColumnProps> => {
      const half = columnSideM(c.pop) / 2;
      const dx = half / M_PER_DEG_LON;
      const dy = half / M_PER_DEG_LAT;
      const ring = [
        [c.lon - dx, c.lat - dy],
        [c.lon + dx, c.lat - dy],
        [c.lon + dx, c.lat + dy],
        [c.lon - dx, c.lat + dy],
        [c.lon - dx, c.lat - dy],
      ];
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          uid,
          height: columnHeightM(c.indice),
          color: gapColor(c.indice),
          indice: c.indice,
          district: c.district,
        },
      };
    }),
  };
}

export function centroPopup(c: Centro): string {
  const row = (k: string, v: string) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`;
  return `<div class="sz-pop cp-pop">
    <p class="sz-pop-k">${esc(c.area === 'urbano' ? 'Centro poblado urbano' : 'Centro poblado rural')} · ${esc(c.district === 'independencia' ? 'Independencia' : 'Huaraz')}</p>
    <h3>${esc(c.name)}</h3>
    <p class="cp-idx"><i style="background:${gapColor(c.indice)}"></i>Índice de brechas: <b>${fmtNum(c.indice)}</b> de 100</p>
    <ul>
      ${row('Población 2017', c.pop === null ? 'sin dato' : `${fmtNum(c.pop)} personas`)}
      ${row('Cobertura 4G del área', `${fmtNum(c.cov4g)} %`)}
      ${row('Colegio más cercano', `${fmtNum(c.schoolKm, 1)} km`)}
      ${row('Salud pública más cercana', `${fmtNum(c.healthKm, 1)} km`)}
    </ul>
  </div>`;
}

export interface TourStop {
  label: string;
  title: string;
  /** INEI code of the centro poblado, when the stop is one */
  code?: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  holdMs: number;
}

/** Casco urbano → the three rural villages of Independencia with the largest gaps (with people) → Palcacocha */
export function tourStops(centros: readonly Centro[]): TourStop[] {
  const urban = centros.find((c) => c.code === '0201050001') ?? centros[0]!;
  const villages = centros
    .filter((c) => c.district === 'independencia' && c.area === 'rural' && (c.pop ?? 0) >= 30)
    .sort((a, b) => b.indice - a.indice)
    .slice(0, 3);
  return [
    {
      label: `Casco urbano · ${urban.name}`,
      title: urban.name,
      code: urban.code,
      center: [urban.lon, urban.lat],
      zoom: 13.6,
      pitch: 62,
      bearing: -25,
      holdMs: 4000,
    },
    ...villages.map((c, i): TourStop => ({
      label: `Caserío · ${c.name} · índice ${fmtNum(c.indice)}`,
      title: c.name,
      code: c.code,
      center: [c.lon, c.lat],
      zoom: 14.2,
      pitch: 66,
      bearing: 20 + i * 35,
      holdMs: 3500,
    })),
    {
      label: 'Laguna Palcacocha',
      title: 'Laguna Palcacocha',
      center: LAKE_POINT,
      zoom: 13.4,
      pitch: 70,
      bearing: 40,
      holdMs: 4500,
    },
  ];
}
