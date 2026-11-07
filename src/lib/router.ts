// Hash routes: one view per sidebar item (#lluvias, #/lluvias). No DOM here.

export type RouteId =
  'resumen' | 'lluvias' | 'rios' | 'nino' | 'emergencias' | 'mapa' | 'noticias' | 'gestion' | 'fuentes';

export interface Route {
  id: RouteId;
  /** Sidebar label */
  label: string;
  /** View heading */
  title: string;
  /** One-line answer to "what is this view for" */
  intro: string;
}

export const ROUTES: readonly Route[] = [
  {
    id: 'resumen',
    label: 'Resumen',
    title: 'Resumen del distrito',
    intro: 'El estado general de Independencia y lo más importante de cada tema.',
  },
  {
    id: 'lluvias',
    label: 'Lluvias y clima',
    title: 'Lluvias y clima',
    intro: 'Avisos vigentes de SENAMHI y la lluvia esperada en el distrito.',
  },
  {
    id: 'rios',
    label: 'Ríos y lagunas',
    title: 'Ríos y lagunas',
    intro: 'Caudal estimado de los ríos y las lagunas glaciares sobre el distrito.',
  },
  {
    id: 'nino',
    label: 'El Niño',
    title: 'Fenómeno El Niño',
    intro: 'El estado oficial (ENFEN) y la temperatura del océano.',
  },
  {
    id: 'emergencias',
    label: 'Emergencias y sismos',
    title: 'Emergencias y sismos',
    intro: 'Emergencias reportadas por INDECI y sismos del IGP cerca del distrito.',
  },
  {
    id: 'mapa',
    label: 'Mapa',
    title: 'Mapa del distrito',
    intro: 'Límites oficiales, ríos, lagunas y sismos recientes; riesgo y cifras del distrito.',
  },
  {
    id: 'noticias',
    label: 'Noticias',
    title: 'Noticias y normas',
    intro: 'Lo último de los medios y las normas de El Peruano que tocan al distrito.',
  },
  {
    id: 'gestion',
    label: 'Gestión municipal',
    title: 'Gestión municipal',
    intro: 'Inversiones públicas, contrataciones y resultados electorales del distrito.',
  },
  {
    id: 'fuentes',
    label: 'Fuentes',
    title: 'Fuentes de datos',
    intro: 'De dónde sale cada dato, cuándo se actualizó y si la última consulta funcionó.',
  },
];

/** Anchors of the previous one-page layout, so old links still work. */
const LEGACY: Record<string, RouteId> = {
  hoy: 'resumen',
  lagunas: 'rios',
  normas: 'noticias',
  riesgo: 'mapa',
  elecciones: 'gestion',
};

const IDS = new Set<string>(ROUTES.map((r) => r.id));

export function parseRoute(hash: string): RouteId {
  const key = hash.replace(/^#\/?/, '').split(/[/?]/)[0]!.toLowerCase();
  if (IDS.has(key)) return key as RouteId;
  return LEGACY[key] ?? 'resumen';
}

export const routeOf = (id: RouteId): Route => ROUTES.find((r) => r.id === id)!;
