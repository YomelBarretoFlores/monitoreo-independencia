// Alluvion safe-zone maps (no DOM): vocabulary, colors, filters, popups and sources.
// The data itself (data/safe-zones/*.geojson, built by scripts/geopdf/extract.py) is loaded
// only with the Mapa view; this module stays small so the sources block can use it anywhere.

import { esc, fmtNum } from './format.ts';

export type Basin = 'quillcay' | 'casca';
export type HazardLevel = 'muy-alto' | 'alto' | 'medio' | 'bajo';
/** Safe places: Casca zone polygons plus the Quillcay map's pins */
export type SafeKind =
  'zona' | 'seguridad' | 'refugio' | 'acopio' | 'salud' | 'comando' | 'animales' | 'cadaveres';
/** Exposed elements drawn on the Casca map */
export type ExposedKind = 'educacion' | 'salud' | 'estadio';

export interface HazardProps {
  basin: Basin;
  level: HazardLevel;
}
export interface ZoneProps {
  basin: Basin;
  id: string;
  areaHa: number;
  maxEvacMin: number;
  avgEvacMin: number;
  altitudeM: number;
  influenceHa: number;
  independencia: boolean;
}
export interface PlaceProps {
  basin: Basin;
  group: 'seguro' | 'expuesto';
  kind: string;
  independencia: boolean;
}

export const BASINS: readonly { id: Basin; label: string }[] = [
  { id: 'quillcay', label: 'Quillcay · Huaraz e Independencia' },
  { id: 'casca', label: 'Casca' },
];

export const HAZARD_LEVELS: readonly { id: HazardLevel; label: string; color: string }[] = [
  { id: 'muy-alto', label: 'Muy alto', color: '#e3241b' },
  { id: 'alto', label: 'Alto', color: '#f08c2a' },
  { id: 'medio', label: 'Medio', color: '#f2cf16' },
  { id: 'bajo', label: 'Bajo', color: '#3c9a3c' },
];

/** Pin colors follow the source maps' legends */
export const SAFE_KINDS: readonly { id: SafeKind; label: string; color: string }[] = [
  { id: 'zona', label: 'Zona segura', color: '#13a99a' },
  { id: 'seguridad', label: 'Zona de seguridad', color: '#0b5e33' },
  { id: 'refugio', label: 'Refugio temporal', color: '#e0b000' },
  { id: 'acopio', label: 'Centro de acopio', color: '#a855f7' },
  { id: 'salud', label: 'Atención médica', color: '#e0141c' },
  { id: 'comando', label: 'Puesto de comando', color: '#5b1470' },
  { id: 'animales', label: 'Atención de animales', color: '#1aa9b5' },
  { id: 'cadaveres', label: 'Gestión de cadáveres', color: '#26282c' },
];

export const EXPOSED_KINDS: readonly { id: ExposedKind; label: string; color: string }[] = [
  { id: 'educacion', label: 'Institución educativa', color: '#0084a8' },
  { id: 'salud', label: 'Establecimiento de salud', color: '#c93100' },
  { id: 'estadio', label: 'Estadio', color: '#4f9e4c' },
];

const label = <T extends { id: string; label: string }>(list: readonly T[], id: string) =>
  list.find((x) => x.id === id)?.label ?? id;
export const basinLabel = (id: string) => label(BASINS, id);
export const hazardLabel = (id: string) => label(HAZARD_LEVELS, id);

type Kind = { id: string; label: string; color: string };
const kindsOf = (group: PlaceProps['group']): readonly Kind[] =>
  group === 'seguro' ? SAFE_KINDS : EXPOSED_KINDS;

export function placeLabel(p: Pick<PlaceProps, 'group' | 'kind'>): string {
  return label(kindsOf(p.group), p.kind);
}

export function placeColor(p: Pick<PlaceProps, 'group' | 'kind'>): string {
  return kindsOf(p.group).find((x) => x.id === p.kind)?.color ?? '#666';
}

// ---------------------------------------------------------------- filters

export interface SafeZoneFilters {
  basins: Basin[];
  levels: HazardLevel[];
  kinds: SafeKind[];
  /** Show the Casca map's exposed schools, health posts and stadium */
  exposed: boolean;
  /** Casca zones only: the source gives evacuation times there */
  maxEvacMin: number | null;
  onlyIndependencia: boolean;
}

export const DEFAULT_FILTERS: SafeZoneFilters = {
  basins: ['quillcay', 'casca'],
  levels: ['muy-alto', 'alto', 'medio', 'bajo'],
  kinds: SAFE_KINDS.map((k) => k.id),
  exposed: false,
  maxEvacMin: null,
  onlyIndependencia: false,
};

/** Evacuation-time choices in the filter (minutes) */
export const EVAC_STEPS = [10, 15, 30] as const;

export const matchHazard = (p: HazardProps, f: SafeZoneFilters) =>
  f.basins.includes(p.basin) && f.levels.includes(p.level);

export function matchZone(p: ZoneProps, f: SafeZoneFilters): boolean {
  return (
    f.basins.includes(p.basin) &&
    f.kinds.includes('zona') &&
    (f.maxEvacMin === null || p.maxEvacMin <= f.maxEvacMin) &&
    (!f.onlyIndependencia || p.independencia)
  );
}

export function matchPlace(p: PlaceProps, f: SafeZoneFilters): boolean {
  if (!f.basins.includes(p.basin) || (f.onlyIndependencia && !p.independencia)) return false;
  if (p.group === 'expuesto') return f.exposed;
  // pins carry no evacuation time: an evacuation-time filter is about Casca zones only
  return f.kinds.includes(p.kind as SafeKind) && f.maxEvacMin === null;
}

/** Casca evacuation routes lead to its zones: they follow the zone filters' basin and kind. */
export const matchRoute = (p: { basin: Basin }, f: SafeZoneFilters) =>
  f.basins.includes(p.basin) && f.kinds.includes('zona');

/** Zone ids, kinds and basin names that match a free-text search (accents and case ignored). */
export function matchesQuery(text: string, query: string): boolean {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const q = norm(query);
  return q === '' || norm(text).includes(q);
}

// ---------------------------------------------------------------- popups

export const directionsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`;

const where = (independencia: boolean) =>
  independencia ? 'Distrito de Independencia' : 'Fuera de Independencia (distrito de Huaraz)';

export function zonePopup(p: ZoneProps, lat: number, lon: number): string {
  return `<div class="sz-pop">
    <p class="sz-pop-k">Zona segura · ${esc(basinLabel(p.basin))}</p>
    <h3>${esc(p.id)}</h3>
    <dl>
      <div><dt>Evacuación máxima</dt><dd>${fmtNum(p.maxEvacMin)} min</dd></div>
      <div><dt>Evacuación promedio</dt><dd>${fmtNum(p.avgEvacMin)} min</dd></div>
      <div><dt>Área</dt><dd>${fmtNum(p.areaHa, 3)} ha</dd></div>
      <div><dt>Área de influencia</dt><dd>${fmtNum(p.influenceHa, 2)} ha</dd></div>
      <div><dt>Altitud</dt><dd>${fmtNum(p.altitudeM)} m</dd></div>
    </dl>
    <p class="sz-pop-w">${esc(where(p.independencia))}</p>
    <a href="${directionsUrl(lat, lon)}" target="_blank" rel="noopener">Cómo llegar</a>
  </div>`;
}

export function placePopup(p: PlaceProps, lat: number, lon: number): string {
  const kicker = p.group === 'seguro' ? 'Lugar seguro' : 'Elemento expuesto';
  return `<div class="sz-pop">
    <p class="sz-pop-k">${kicker} · ${esc(basinLabel(p.basin))}</p>
    <h3>${esc(placeLabel(p))}</h3>
    <p class="sz-pop-w">${esc(where(p.independencia))}</p>
    ${p.group === 'seguro' ? `<a href="${directionsUrl(lat, lon)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
  </div>`;
}

export function hazardPopup(p: HazardProps): string {
  return `<div class="sz-pop">
    <p class="sz-pop-k">Peligro por aluvión · ${esc(basinLabel(p.basin))}</p>
    <h3>Nivel ${esc(hazardLabel(p.level).toLowerCase())}</h3>
  </div>`;
}

// ---------------------------------------------------------------- sources

export interface MapSource {
  basin: Basin;
  title: string;
  author: string;
  inputs?: string;
  date: string;
  scale: string;
  /** Public PDF, or null while its public source is unknown */
  pdf: string | null;
  page: string | null;
}

/** Same records as SOURCES in scripts/geopdf/extract.py (a test keeps them in sync). */
export const MAP_SOURCES: readonly MapSource[] = [
  {
    basin: 'quillcay',
    title:
      'Mapa de zonas seguras y rutas de evacuación ante aluviones en Huaraz e Independencia (Áncash) – zona baja, subcuenca río Quillcay',
    author:
      'Oficina de Gestión del Riesgo de Desastres y Defensa Civil de la Municipalidad Provincial de Huaraz, con la Municipalidad Distrital de Independencia',
    inputs: 'INAIGEM, MTC, ANA y catastro de las municipalidades de Huaraz e Independencia',
    date: '2025-05',
    scale: '1:8 500',
    pdf: 'https://sinia.minam.gob.pe/sites/default/files/archivos/public/docs/MAPA%20DE%20ZONAS%20SEGURAS%20Y%20RUTAS%20DE%20EVACUACI%C3%93N_FIN.pdf',
    page: 'https://sinia.minam.gob.pe/mapas/mapa-zonas-seguras-rutas-evacuacion-ante-aluviones-huaraz-independencia',
  },
  {
    basin: 'casca',
    title: 'Mapa de zonas seguras y peligro por aluvión – unidad hidrográfica Casca',
    author: 'Instituto Nacional de Investigación en Glaciares y Ecosistemas de Montaña (INAIGEM)',
    date: '2026-08',
    scale: '1:5 500',
    pdf: null,
    page: null,
  },
];

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
export const monthYear = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} de ${y}`;
};
