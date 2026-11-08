// Glacial lake outburst floods (aluviones) above Huaraz and Independencia: published figures and the
// illustrative model the map animation runs on. Pure (no DOM, no map).
//
// Only Laguna Palcacocha has published, timed models: Somos-Valenzuela et al. 2016 (HESS 20, 2519),
// Table 6, at the dam, the city entrance and the city exit, and the 1941 reconstruction of Mergili et al.
// 2020. Between those points the front advances linearly in distance and the peak discharge decays
// log-linearly. That interpolation is ours; it is illustrative and not an official model.

export interface Source {
  label: string;
  url: string;
  year: number;
}

export const SOURCES = {
  somos2016: {
    label:
      'Somos-Valenzuela et al., «Modeling a glacial lake outburst flood process chain: the case of Lake Palcacocha and Huaraz, Peru», HESS 20',
    url: 'https://hess.copernicus.org/articles/20/2519/2016/',
    year: 2016,
  },
  ana2016: {
    label: 'ANA – UGRH, batimetría de la laguna Palcacocha (13 de febrero de 2016)',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/documento/2804/descargar',
    year: 2016,
  },
  indeci2015: {
    label: 'INDECI – CEPIG, escenario de riesgo por aluvión de la laguna Palcacocha',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/documento/1972/descargar',
    year: 2015,
  },
  mergili2020: {
    label:
      'Mergili et al., «Reconstruction of the 1941 GLOF process chain at Lake Palcacocha (Cordillera Blanca, Peru)», HESS 24',
    url: 'https://hess.copernicus.org/articles/24/93/2020/hess-24-93-2020.html',
    year: 2020,
  },
  huggel2020: {
    label:
      'Huggel et al., «Anthropogenic climate change and glacier lake outburst flood risk: local and global drivers and responsibilities for the case of lake Palcacocha, Peru», NHESS 20',
    url: 'https://nhess.copernicus.org/articles/20/2175/2020/',
    year: 2020,
  },
  gore2021: {
    label: 'Gobierno Regional de Áncash, entrega del sistema de alerta temprana (25 de febrero de 2021)',
    url: 'https://regionancash.gob.pe/noticias.php?id=518',
    year: 2021,
  },
  defensoria2026: {
    label: 'Defensoría del Pueblo, nota de prensa 268-2026 (29 de mayo de 2026)',
    url: 'https://www.defensoria.gob.pe/wp-content/uploads/2026/05/NP-268-2026.pdf',
    year: 2026,
  },
  baer2016: {
    label:
      'Baer et al., «Modelling a GLOF process chain in the Quillcayhuanca valley (Tullparaju, Cuchillacocha)», EGU General Assembly, EGU2016-6536',
    url: 'https://meetingorganizer.copernicus.org/EGU2016/EGU2016-6536.pdf',
    year: 2016,
  },
  frey2018: {
    label:
      'Frey et al., «Multi-source glacial lake outburst flood hazard assessment and mapping for Huaraz, Cordillera Blanca, Peru», Frontiers in Earth Science 6:210',
    url: 'https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2018.00210/full',
    year: 2018,
  },
  inaigem2020: {
    label:
      'INAIGEM, evaluación del riesgo por aluvión en la ciudad de Huaraz, distritos de Huaraz e Independencia',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/storage/biblioteca/11763_evaluacion-del-riesgo-por-aluvion-en-la-ciudad-de-huaraz-distritos-de-huaraz-e-independencia-provincia-de-huaraz-departamento-de-ancash.pdf',
    year: 2020,
  },
  inaigem2016a: {
    label: 'INAIGEM, informe técnico N.º 09-2016 (lagunas Cuchillacocha y Tullparaju)',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/documento/10574/descargar',
    year: 2016,
  },
  inaigem2016b: {
    label: 'INAIGEM, informe técnico N.º 14-2016 (laguna Llaca)',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/documento/10578/descargar',
    year: 2016,
  },
  inaigem2016c: {
    label: 'INAIGEM, informe técnico N.º 15-2016 (laguna Shallap)',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/documento/10579/descargar',
    year: 2016,
  },
  inaigem2016d: {
    label: 'INAIGEM, informe técnico N.º 07-2016 (laguna Rajucolta)',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/documento/10569/descargar',
    year: 2016,
  },
  nasa2003: {
    label:
      'NASA Earth Observatory, «Glacial Collapse Threatens Huaraz, Peru» (pronóstico ante una posible caída de hielo)',
    url: 'https://www.earthobservatory.nasa.gov/images/3343/glacial-collapse-threatens-huaraz-peru',
    year: 2003,
  },
  terrain: {
    label: 'Relieve: AWS Terrain Tiles (Mapzen); cauce trazado por la máxima pendiente',
    url: 'https://registry.opendata.aws/terrain-tiles/',
    year: 2026,
  },
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** Centre of the lake, [lon, lat] (OpenStreetMap way 67765132, as in data/lagunas.json) */
export const LAKE_POINT: [number, number] = [-77.3791, -9.3957];

/** The lake by the latest primary bathymetry */
export const LAKE = {
  volumeM3: 17_403_353,
  areaM2: 514_157,
  maxDepthM: 71.1,
  altitudeM: 4562.88,
  freeboardM: 7,
  source: 'ana2016' as SourceId,
};

/** The 1941-12-13 alluvion */
export const HISTORY_1941 = {
  date: '13 de diciembre de 1941',
  deaths: 'cerca de 2 000',
  deathsNote: 'Las fuentes difieren: de unas 1 600 a más de 4 800 víctimas.',
  cityDestroyed: 'cerca de un tercio de Huaraz',
  source: 'huggel2020' as SourceId,
};

/** People living in the flood cone (INDECI 2015) */
export const EXPOSED = {
  huaraz: 16_523,
  independencia: 12_393,
  total: 28_916,
  source: 'indeci2015' as SourceId,
};

/** Early-warning system figures */
export const WARNING = {
  minutes: 30,
  source: 'gore2021' as SourceId,
  status:
    'En mayo de 2026 la Defensoría del Pueblo informó que los equipos no reciben mantenimiento desde hace más de tres años.',
  statusSource: 'defensoria2026' as SourceId,
};

export type ScenarioId = 'grande' | 'mediano' | 'pequeno' | 'r1941';

interface Section {
  /** Arrival of the flood front, hours after the avalanche (the value the animation uses) */
  frontH: number;
  /** Published range of that arrival, hours, when the source gives one */
  rangeH?: [number, number];
  /** Peak discharge, m³/s */
  peakM3s: number;
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** One line on what the scenario is */
  note: string;
  /** Ice and rock avalanche into the lake, m³ (none for the 1941 breach) */
  avalancheM3: number | null;
  /** Seconds for the avalanche to reach the lake */
  impactS: number;
  /** Highest wave in mid-lake, m */
  waveM: number | null;
  /** Wave height above the dam, m */
  overtopM: number | null;
  /** Peak discharge at the outlet, m³/s */
  overtopPeakM3s: number;
  entrance: Section;
  /** City exit (río Santa); null when the source stops at the city */
  exit: Section | null;
  /** Area flooded in Huaraz, km² (not published for the medium scenario) */
  floodKm2: number | null;
  source: SourceId;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  grande: {
    id: 'grande',
    label: 'Grande',
    note: 'Avalancha de 3 millones de m³ sobre la laguna al nivel actual (modelo).',
    avalancheM3: 3_000_000,
    impactS: 33,
    waveM: 47.8,
    overtopM: 21.7,
    overtopPeakM3s: 63_400,
    entrance: { frontH: 1.32, rangeH: [1.05, 1.32], peakM3s: 1980 },
    exit: { frontH: 2.1, peakM3s: 920 },
    floodKm2: 2.0,
    source: 'somos2016',
  },
  mediano: {
    id: 'mediano',
    label: 'Mediano',
    note: 'Avalancha de 1 millón de m³ (modelo).',
    avalancheM3: 1_000_000,
    impactS: 36,
    waveM: 30.1,
    overtopM: 12.0,
    overtopPeakM3s: 17_100,
    entrance: { frontH: 2.9, peakM3s: 149 },
    exit: { frontH: 4.95, peakM3s: 73 },
    floodKm2: null,
    source: 'somos2016',
  },
  pequeno: {
    id: 'pequeno',
    label: 'Pequeño',
    note: 'Avalancha de 0,5 millones de m³ (modelo).',
    avalancheM3: 500_000,
    impactS: 39,
    waveM: 19.6,
    overtopM: 7.1,
    overtopPeakM3s: 6410,
    entrance: { frontH: 8.68, peakM3s: 8 },
    exit: { frontH: 15.8, peakM3s: 4 },
    floodKm2: 0.7,
    source: 'somos2016',
  },
  r1941: {
    id: 'r1941',
    label: '1941',
    note: 'Reconstrucción por modelo del aluvión de 1941: rotura del dique; no hay tiempos documentados de ese día.',
    avalancheM3: null,
    impactS: 0,
    waveM: null,
    overtopM: null,
    overtopPeakM3s: 18_700,
    // 36–70 min across the reconstruction's scenarios; the animation uses the middle of that range
    entrance: { frontH: 53 / 60, rangeH: [36 / 60, 70 / 60], peakM3s: 12_500 },
    exit: null,
    floodKm2: null,
    source: 'mergili2020',
  },
};

export const SCENARIO_IDS: readonly ScenarioId[] = ['grande', 'mediano', 'pequeno', 'r1941'];

/** Distances along the flow path, metres from the lake */
export interface Route {
  lengthM: number;
  /** Where the path enters the official Quillcay hazard map (the city entrance) */
  entranceM: number;
}

export const makeRoute = (lengthM: number, entranceM: number): Route => ({ lengthM, entranceM });

/** Seconds after the avalanche when the front reaches each station: dam, city entrance, río Santa */
function stations(s: Scenario, r: Route): [number, number][] {
  const st: [number, number][] = [
    [s.impactS, 0],
    [s.entrance.frontH * 3600, r.entranceM],
  ];
  if (s.exit) st.push([s.exit.frontH * 3600, r.lengthM]);
  return st;
}

/** Distance of the flood front from the lake, m, t seconds after the avalanche starts */
export function frontAt(s: Scenario, r: Route, t: number): number {
  const st = stations(s, r);
  if (t <= st[0]![0]) return 0;
  for (let i = 1; i < st.length; i++) {
    const [t0, d0] = st[i - 1]!;
    const [t1, d1] = st[i]!;
    if (t <= t1) return d0 + ((t - t0) / (t1 - t0)) * (d1 - d0);
  }
  return st[st.length - 1]![1];
}

/** Inverse of frontAt: seconds until the front reaches distance d */
export function arrivalAt(s: Scenario, r: Route, d: number): number {
  const st = stations(s, r);
  if (d <= 0) return st[0]![0];
  for (let i = 1; i < st.length; i++) {
    const [t0, d0] = st[i - 1]!;
    const [t1, d1] = st[i]!;
    if (d <= d1) return t0 + ((d - d0) / (d1 - d0)) * (t1 - t0);
  }
  return st[st.length - 1]![0];
}

/** Peak discharge, m³/s, at distance d: log-linear between the dam, the city entrance and the city exit */
export function dischargeAt(s: Scenario, r: Route, d: number): number {
  const pts: [number, number][] = [
    [0, s.overtopPeakM3s],
    [r.entranceM, s.entrance.peakM3s],
    [r.lengthM, s.exit?.peakM3s ?? s.entrance.peakM3s],
  ];
  const x = Math.min(Math.max(d, 0), r.lengthM);
  for (let i = 1; i < pts.length; i++) {
    const [d0, q0] = pts[i - 1]!;
    const [d1, q1] = pts[i]!;
    if (x <= d1) return Math.exp(Math.log(q0) + ((x - d0) / (d1 - d0)) * (Math.log(q1) - Math.log(q0)));
  }
  return pts[pts.length - 1]![1];
}

export type Phase = 'calma' | 'avalancha' | 'quebrada' | 'ciudad' | 'santa';

export const PHASE_LABEL: Record<Phase, string> = {
  calma: 'Laguna en calma',
  avalancha: 'Avalancha de hielo y ola',
  quebrada: 'El aluvión baja por la quebrada',
  ciudad: 'El aluvión entra a la ciudad',
  santa: 'El frente llega al río Santa',
};

export function phaseAt(s: Scenario, _r: Route, t: number): Phase {
  if (t < 0) return 'calma';
  if (t <= s.impactS) return 'avalancha';
  if (t < s.entrance.frontH * 3600) return 'quebrada';
  if (!s.exit || t < s.exit.frontH * 3600) return 'ciudad';
  return 'santa';
}

/** The lake sensors and camera see the avalanche when it starts; the rest is time left for the city. */
export function warningAt(s: Scenario, _r: Route, t: number): { detected: boolean; minutesToCity: number } {
  const left = s.entrance.frontH * 3600 - t;
  return { detected: t >= 0, minutesToCity: Math.max(0, left / 60) };
}

export interface SimState {
  t: number;
  phase: Phase;
  frontM: number;
  /** frontM / route length */
  progress: number;
  dischargeM3s: number;
  detected: boolean;
  minutesToCity: number;
}

export function stateAt(s: Scenario, r: Route, t: number): SimState {
  const frontM = frontAt(s, r, t);
  const w = warningAt(s, r, t);
  return {
    t,
    phase: phaseAt(s, r, t),
    frontM,
    progress: frontM / r.lengthM,
    dischargeM3s: dischargeAt(s, r, frontM),
    detected: w.detected,
    minutesToCity: w.minutesToCity,
  };
}

/** Opacity 0..1 of the city's hazard map: it fills in while the front crosses the city */
export function cityRevealAt(s: Scenario, t: number): number {
  const tIn = s.entrance.frontH * 3600;
  const span = s.exit ? s.exit.frontH * 3600 - tIn : 20 * 60;
  return Math.min(1, Math.max(0, (t - tIn) / span));
}

const MUD = 'rgba(122, 74, 42, 0.92)';
const HEAD = 'rgba(255, 106, 40, 1)';
const NONE = 'rgba(122, 74, 42, 0)';
/**
 * MapLibre `line-gradient` for a route drawn up to `progress` (0..1 of its length): mud behind, a bright head
 * at the front, nothing ahead. Stops always run strictly from 0 to 1.
 */
export function floodGradient(progress: number): unknown[] {
  const p = Math.min(1, Math.max(0, progress));
  const base = ['interpolate', ['linear'], ['line-progress']];
  if (p <= 0) return [...base, 0, NONE, 1, NONE];
  const stops: [number, string][] = [[0, MUD]];
  const tail = p - 0.04;
  if (tail > 0) stops.push([tail, MUD]);
  stops.push([p, HEAD]);
  if (p < 1) {
    stops.push([Math.min(1, p + 0.0015), NONE]);
    if (p + 0.0015 < 1) stops.push([1, NONE]);
  }
  return [...base, ...stops.flat()];
}

export type LakeId = 'palcacocha' | 'tullparaju' | 'cuchillacocha' | 'llaca' | 'shallap' | 'rajucolta';
/** timed: published arrival times; comparable: modelled, times only called comparable to Palcacocha; no-study */
export type LakeStatus = 'timed' | 'comparable' | 'no-study';

export interface Lake {
  id: LakeId;
  name: string;
  status: LakeStatus;
  /** Where its outburst would go */
  path: string;
  /** Latest bathymetry, m³ */
  volumeM3: number;
  volumeYear: number;
  volumeSource: SourceId;
  /** What the studies say about its timing */
  timing: string;
  timingSource: SourceId | null;
  /** A flow route exists in data/glof/routes.json */
  routed: boolean;
}

export const LAKES: Record<LakeId, Lake> = {
  palcacocha: {
    id: 'palcacocha',
    name: 'Palcacocha',
    status: 'timed',
    path: 'Quebrada Cojup → río Quillcay → Huaraz e Independencia',
    volumeM3: 17_403_353,
    volumeYear: 2016,
    volumeSource: 'ana2016',
    timing: 'Tiempos de llegada publicados por modelo.',
    timingSource: 'somos2016',
    routed: true,
  },
  tullparaju: {
    id: 'tullparaju',
    name: 'Tullparaju',
    status: 'comparable',
    path: 'Quebrada Quillcayhuanca → río Quillcay → Huaraz e Independencia',
    volumeM3: 12_474_812,
    volumeYear: 2011,
    volumeSource: 'inaigem2020',
    timing: 'Modelada: tiempos «comparables a Palcacocha», sin minutos publicados.',
    timingSource: 'baer2016',
    routed: true,
  },
  cuchillacocha: {
    id: 'cuchillacocha',
    name: 'Cuchillacocha',
    status: 'comparable',
    path: 'Quebrada Quillcayhuanca → río Quillcay → Huaraz e Independencia',
    volumeM3: 2_138_936,
    volumeYear: 2005,
    volumeSource: 'inaigem2016a',
    timing: 'Modelada: tiempos «comparables a Palcacocha», sin minutos publicados.',
    timingSource: 'baer2016',
    routed: true,
  },
  llaca: {
    id: 'llaca',
    name: 'Llaca',
    status: 'no-study',
    path: 'Quebrada Llaca → río Casca (norte de Independencia)',
    volumeM3: 274_305,
    volumeYear: 2004,
    volumeSource: 'inaigem2016b',
    timing: 'Sin estudio publicado de tiempos de llegada.',
    timingSource: null,
    routed: true,
  },
  shallap: {
    id: 'shallap',
    name: 'Shallap',
    status: 'no-study',
    path: 'Quebrada Shallap → río Quillcay',
    volumeM3: 4_664_724,
    volumeYear: 2005,
    volumeSource: 'inaigem2016c',
    timing: 'Sin estudio publicado de tiempos de llegada.',
    timingSource: null,
    routed: false,
  },
  rajucolta: {
    id: 'rajucolta',
    name: 'Rajucolta',
    status: 'no-study',
    path: 'Río Pariac → río Santa, al sur de Huaraz',
    volumeM3: 17_546_151,
    volumeYear: 2014,
    volumeSource: 'inaigem2016d',
    timing: 'Sin estudio publicado de tiempos de llegada.',
    timingSource: null,
    routed: false,
  },
};

export const LAKE_IDS: readonly LakeId[] = [
  'palcacocha',
  'tullparaju',
  'cuchillacocha',
  'llaca',
  'shallap',
  'rajucolta',
];

export type EvidenceKind = 'modelo' | 'sensibilidad' | 'reconstruccion' | 'evacuacion' | 'sin-fuente';

/** Every time figure people quote for Palcacocha, and what it really is */
export const ARRIVAL_EVIDENCE: readonly {
  value: string;
  kind: EvidenceKind;
  what: string;
  source: SourceId | null;
}[] = [
  {
    value: '79 min',
    kind: 'modelo',
    what: 'Llegada del frente a la ciudad con una avalancha de 3 millones de m³ («about 1 h and 20 min»).',
    source: 'somos2016',
  },
  {
    value: '63–79 min',
    kind: 'sensibilidad',
    what: 'El mismo modelo con otros supuestos de rugosidad y sedimento.',
    source: 'somos2016',
  },
  {
    value: '36–70 min',
    kind: 'reconstruccion',
    what: 'Reconstrucción del aluvión de 1941. El estudio aclara que no hay tiempos documentados de ese día.',
    source: 'mergili2020',
  },
  {
    value: '30 min',
    kind: 'evacuacion',
    what: 'No es el tiempo de llegada: es el tiempo para evacuar tras la alerta, según el Gobierno Regional.',
    source: 'gore2021',
  },
  {
    value: '15 min',
    kind: 'sin-fuente',
    what: 'Pronóstico de una nota de NASA de 2003, sin método publicado, repetido luego en Wikipedia sin cita. No lo respalda ningún estudio, por eso no se usa.',
    source: 'nasa2003',
  },
];

/** One vertex of a flow route: [lon, lat, elevation m, distance from the lake m] (data/glof/routes.json) */
export type RoutePoint = [number, number, number, number];

export interface LakeRoute {
  name: string;
  path: RoutePoint[];
  lengthM: number;
  /** Where the route enters an official hazard map (the city), m; null if it never does */
  entranceM: number | null;
  entranceMap: 'quillcay' | 'casca' | null;
  reachesSanta: boolean;
}

/** Index of the segment [i - 1, i] that holds distance d */
function segmentAt(path: readonly RoutePoint[], d: number): number {
  let lo = 1;
  let hi = path.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (path[mid]![3] < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** [lon, lat] at distance d along the route, clamped to its ends */
export function pointAlong(path: readonly RoutePoint[], d: number): [number, number] {
  const x = Math.min(Math.max(d, 0), path[path.length - 1]![3]);
  const i = segmentAt(path, x);
  const a = path[i - 1]!;
  const b = path[i]!;
  const k = b[3] > a[3] ? (x - a[3]) / (b[3] - a[3]) : 0;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** Heading of the route at distance d, degrees clockwise from north (-180..180) */
export function bearingAlong(path: readonly RoutePoint[], d: number): number {
  const i = segmentAt(path, Math.min(Math.max(d, 0), path[path.length - 1]![3]));
  const a = path[i - 1]!;
  const b = path[i]!;
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/** Event seconds after which the animation stops: the río Santa (or the city when the source ends there), plus a pause */
export const simEnd = (s: Scenario): number =>
  s.exit ? s.exit.frontH * 3600 + 600 : s.entrance.frontH * 3600 + 1200;

/** Event seconds per real second: slow through the avalanche and the wave, then the whole run in about 70 s */
export function playRate(s: Scenario, t: number): number {
  const fast = ((s.exit ?? s.entrance).frontH * 3600) / 70;
  const k = Math.min(1, Math.max(0, (t - (s.impactS + 30)) / 150));
  return 6 + (fast - 6) * k * k * (3 - 2 * k);
}
