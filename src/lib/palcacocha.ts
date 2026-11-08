// Laguna Palcacocha alluvion: published figures and the illustrative model the 3D simulator runs on.
// Pure (no DOM, no three.js), shared by the simulator (sims/palcacocha-*) and the app.
//
// Arrival times and discharges come from Somos-Valenzuela et al. 2016 (HESS 20, 2519), Table 6, at
// three points: the dam, the city entrance and the city exit. Between those points the front advances
// linearly in distance and the peak discharge decays log-linearly. That interpolation is ours, it is
// illustrative and not an official model.

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
  terrain: {
    label: 'Relieve: AWS Terrain Tiles (Mapzen); cauce trazado por la máxima pendiente',
    url: 'https://registry.opendata.aws/terrain-tiles/',
    year: 2026,
  },
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

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

export type ScenarioId = 'grande' | 'mediano' | 'pequeno';

interface Section {
  /** Arrival of the flood front, hours after the avalanche */
  frontH: number;
  /** Peak discharge, m³/s */
  peakM3s: number;
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** Ice and rock avalanche into the lake, m³ */
  avalancheM3: number;
  /** Seconds for the avalanche to reach the lake */
  impactS: number;
  /** Highest wave in mid-lake, m */
  waveM: number;
  /** Wave height above the dam, m */
  overtopM: number;
  /** Peak discharge over the dam, m³/s */
  overtopPeakM3s: number;
  entrance: Section;
  exit: Section;
  /** Area flooded in Huaraz, km² (not published for the medium scenario) */
  floodKm2: number | null;
  source: SourceId;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  grande: {
    id: 'grande',
    label: 'Grande',
    avalancheM3: 3_000_000,
    impactS: 33,
    waveM: 47.8,
    overtopM: 21.7,
    overtopPeakM3s: 63_400,
    entrance: { frontH: 1.32, peakM3s: 1980 },
    exit: { frontH: 2.1, peakM3s: 920 },
    floodKm2: 2.0,
    source: 'somos2016',
  },
  mediano: {
    id: 'mediano',
    label: 'Mediano',
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
};

/** Distances along the flow path, metres from the lake */
export interface Route {
  lengthM: number;
  /** Where the path enters the official Quillcay hazard map (the city entrance) */
  entranceM: number;
}

export const makeRoute = (lengthM: number, entranceM: number): Route => ({ lengthM, entranceM });

/** Seconds after the avalanche when the front reaches each station: dam, city entrance, río Santa */
function stations(s: Scenario, r: Route): [number, number][] {
  return [
    [s.impactS, 0],
    [s.entrance.frontH * 3600, r.entranceM],
    [s.exit.frontH * 3600, r.lengthM],
  ];
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
  return r.lengthM;
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
    [r.lengthM, s.exit.peakM3s],
  ];
  const x = Math.min(Math.max(d, 0), r.lengthM);
  for (let i = 1; i < pts.length; i++) {
    const [d0, q0] = pts[i - 1]!;
    const [d1, q1] = pts[i]!;
    if (x <= d1) return Math.exp(Math.log(q0) + ((x - d0) / (d1 - d0)) * (Math.log(q1) - Math.log(q0)));
  }
  return s.exit.peakM3s;
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
  if (t < s.exit.frontH * 3600) return 'ciudad';
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
