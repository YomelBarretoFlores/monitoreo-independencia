import type { Feature } from 'geojson';

// Contract between the server (server/) and the UI (src/). GET /api/panel returns a Panel.
// Every section carries its own SourceMeta so the UI can say when it was updated and if it failed.

/** Traffic-light level, shared by every alert in the system */
export type Level = 'normal' | 'atencion' | 'alerta' | 'emergencia';

export type SourceId =
  | 'senamhi-avisos'
  | 'open-meteo'
  | 'glofas'
  | 'enfen'
  | 'noaa-oni'
  | 'indeci-coen'
  | 'igp-sismos'
  | 'noticias'
  | 'el-peruano'
  | 'cenepred'
  | 'inversiones'
  | 'elecciones';

export interface SourceMeta {
  id: SourceId;
  /** Human name in Spanish, e.g. "SENAMHI – Avisos meteorológicos" */
  name: string;
  /** Public page a person can open to check the data */
  url: string;
  /** ISO time of the last successful fetch, null if it never succeeded */
  updatedAt: string | null;
  /** false when the last attempt failed (the section then shows the last good data, if any) */
  ok: boolean;
  error?: string;
  /** How often the server refreshes it, in minutes (static datasets: null) */
  everyMinutes: number | null;
}

export interface Section<T> {
  meta: SourceMeta;
  /** null only when the source never succeeded */
  data: T | null;
}

export interface District {
  ubigeo: string; // INEI 020105
  name: string; // "Independencia"
  province: string; // "Huaraz"
  region: string; // "Áncash"
  center: [lat: number, lon: number];
  population2017: number | null;
  households2017: number | null;
  /** INEI estimate, with its year */
  populationEstimate: { year: number; value: number } | null;
  povertyPct: number | null;
}

export interface Summary {
  level: Level;
  /** Plain-Spanish reasons behind the level, most important first */
  reasons: string[];
}

/** SENAMHI weather warning that covers the district */
export interface WeatherWarning {
  number: number;
  title: string; // e.g. "Precipitaciones de moderada a fuerte intensidad en la sierra"
  level: Level; // SENAMHI Nivel 2/3/4 → atencion/alerta/emergencia
  levelLabel: string; // original label, e.g. "Nivel 3 (naranja)"
  start: string; // ISO
  end: string; // ISO
  url: string;
}

export interface DayForecast {
  date: string; // YYYY-MM-DD
  precipMm: number;
  precipProbPct: number | null;
  tMaxC: number | null;
  tMinC: number | null;
}

export interface Forecast {
  /** Where the forecast is computed (district center) */
  point: [lat: number, lon: number];
  /** Past 7 days + next 14 days */
  daily: DayForecast[];
  /** Next 48 h, hourly rain in mm */
  hourly: { time: string; precipMm: number }[];
}

/** Modeled river discharge (GloFAS via Open-Meteo). It is a model, not a gauge reading. */
export interface RiverPoint {
  id: string;
  name: string; // e.g. "Río Santa (altura de Independencia)"
  point: [lat: number, lon: number];
  series: { date: string; dischargeM3s: number; maxM3s: number | null; forecast: boolean }[];
  /** Mean discharge over the past 30 days, as reference for the chart */
  referenceM3s: number | null;
  level: Level;
}

export interface GlacialLake {
  id: string;
  name: string; // "Laguna Palcacocha"
  point: [lat: number, lon: number];
  basin: string; // "Quebrada Cojup → río Quillcay"
  areaKm2: number | null;
  elevationM: number | null;
  /** Short plain-Spanish note on its known risk, with the source in `note` */
  riskNote: string;
  /** Rain and temperature forecast at the lake (next 7 days) */
  forecast: DayForecast[];
  /** True when there is public real-time monitoring data (today: false for all) */
  liveMonitoring: boolean;
}

export interface ElNino {
  /** ENFEN alert system status, e.g. "Alerta de El Niño Costero" */
  enfenStatus: string | null;
  enfenLevel: Level;
  communiques: { title: string; date: string; url: string }[];
  /** NOAA ONI, last 24 seasons */
  oni: { season: string; year: number; anomaly: number }[];
}

export interface FeedItem {
  title: string;
  date: string; // ISO
  url: string;
  source: string; // outlet or institution
  summary?: string;
  /** Why it matched, e.g. "Independencia", "Palcacocha", "Huaraz" */
  tags: string[];
}

export interface Earthquake {
  date: string; // ISO
  magnitude: number;
  depthKm: number | null;
  point: [lat: number, lon: number];
  reference: string; // IGP text, e.g. "5 km al S de Carhuaz"
  distanceKm: number; // to the district center
  url: string;
}

export interface RiskProfile {
  massMovement: { hazard: string | null; risk: string | null };
  flood: { hazard: string | null; risk: string | null };
  healthFacilities: number | null;
  schools: number | null;
  scenario: string; // e.g. "Escenario de riesgo FEN 2027 (CENEPRED)"
}

export interface Investment {
  cui: string;
  name: string;
  entity: string; // executing entity
  status: string; // "En ejecución", "Paralizada", ...
  costSoles: number | null;
  accruedSoles: number | null; // devengado acumulado
  progressPct: number | null; // avance físico/financiero, when known
  lastUpdate: string | null;
  url: string; // public link (MEF / Infobras)
}

export interface Procurement {
  id: string;
  entity: string;
  object: string;
  method: string;
  amountSoles: number | null;
  date: string | null;
  url: string;
}

export interface Management {
  investments: Investment[];
  procurements: Procurement[];
  /** Totals over `investments` */
  totals: { count: number; costSoles: number; accruedSoles: number; stalled: number };
  /** Date of the underlying datasets */
  asOf: string | null;
}

export interface Elections {
  title: string; // "Elecciones Regionales 2026 – Gobernador (Independencia)"
  asOf: string | null;
  actasPct: number;
  turnoutPct: number;
  emitted: number;
  valid: number;
  /** Top parties by valid votes, percentage over valid votes */
  parties: { name: string; votes: number; pct: number }[];
}

export interface Panel {
  generatedAt: string;
  district: District;
  summary: Summary;
  warnings: Section<WeatherWarning[]>;
  forecast: Section<Forecast>;
  rivers: Section<RiverPoint[]>;
  lakes: Section<GlacialLake[]>;
  elNino: Section<ElNino>;
  emergencies: Section<FeedItem[]>;
  earthquakes: Section<Earthquake[]>;
  news: Section<FeedItem[]>;
  legal: Section<FeedItem[]>;
  risk: Section<RiskProfile>;
  management: Section<Management>;
  elections: Section<Elections>;
  /** Overlay for the map: district outline (GeoJSON Feature, OSM relation 1953273) */
  boundary: Feature | null;
}
