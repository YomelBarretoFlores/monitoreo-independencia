import type { RouteId } from './lib/router.ts';

// Layout of each view: which [data-body] slots it holds and how wide each one is
// on the 12-column grid (classes in styles/layout.css). Slots render in main.ts.

const slot = (key: string, cls = 'span-12') => `<div class="${cls}" data-body="${key}"></div>`;
const block = (title: string, body: string) =>
  `<section class="block span-12"><h2 class="block-h">${title}</h2><div class="grid">${body}</div></section>`;

export const LAYOUTS: Record<RouteId, string> = {
  resumen: slot('summary'),
  lluvias: slot('warnings', 'span-5') + slot('forecast', 'span-7'),
  rios: block('Ríos', slot('rivers')) + block('Lagunas glaciares', slot('lakes')),
  nino: slot('elNino'),
  emergencias: slot('emergencies', 'span-7') + slot('earthquakes', 'span-5'),
  // row 1: map and its filters at the same height; row 2: district figures; row 3: alluvion simulator; row 4: map sources
  mapa: `<div class="span-8 row-fill"><div class="card card-flush map-card"><div class="map" id="map" role="region" aria-label="Mapa del distrito de Independencia"></div><div data-body="map"></div></div></div>
    <section class="span-4 row-fill card sz-card" id="sz-panel" aria-label="Zonas seguras ante aluvión"><p class="muted">Cargando las zonas seguras…</p></section>
    ${slot('district', 'span-5 row-pair')}${slot('risk', 'span-7 row-pair')}${slot('simulator')}${slot('mapSources')}`,
  noticias: slot('news', 'span-8') + slot('legal', 'span-4'),
  gestion: slot('management') + block('Elecciones 2026 en el distrito', slot('elections', 'span-7')),
  fuentes: slot('sources'),
};
