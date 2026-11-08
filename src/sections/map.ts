import type { Panel } from '../../shared/types.ts';
import { esc } from '../lib/format.ts';
import { GEO_CREDITS } from '../lib/geodata.ts';
import { HAZARD_LEVELS, MAP_SOURCES, monthYear } from '../lib/safezones.ts';
import { icon } from '../ui/icons.ts';
import type { Ctx } from '../ui/shell.ts';

// Mapa: a thin facade. The map engine (MapLibre) and its layers live in map-view.ts, which is
// fetched only when the Mapa view opens, so the other views never download them.

type MapView = typeof import('./map-view.ts');

/** The engine and the alluvion data are separate chunks, fetched in parallel */
const loadChunks = () => Promise.all([import('./map-view.ts'), import('../lib/safezones-data.ts')]);

let view: MapView | null = null;
/** Bumped on every mount/unmount so a slow import cannot mount into a view that is gone */
let generation = 0;
let latest: { panel: Panel | null; now: number } = { panel: null, now: 0 };

/** Start downloading the map chunk early (e.g. when the pointer reaches the Mapa link). */
export function prefetchMap(): void {
  void loadChunks().catch(() => undefined);
}

export function mountMap(el: HTMLElement): void {
  const gen = ++generation;
  el.classList.add('is-loading');
  el.setAttribute('aria-busy', 'true');
  loadChunks()
    .then(([m, d]) => {
      if (gen !== generation || !el.isConnected) return;
      view = m;
      el.classList.remove('is-loading');
      el.removeAttribute('aria-busy');
      m.mount(el, d.loadSafeZoneData);
      m.update(latest.panel, latest.now);
    })
    .catch((err: unknown) => {
      console.error('map', err);
      if (gen !== generation) return;
      el.classList.remove('is-loading');
      el.removeAttribute('aria-busy');
      el.innerHTML = `<p class="map-error">No se pudo cargar el mapa. Revisa tu conexión o que el navegador tenga WebGL activado, y vuelve a abrir esta sección.</p>`;
    });
}

export function unmountMap(): void {
  generation++;
  view?.unmount();
}

export function updateMap(p: Panel | null, now: number): void {
  latest = { panel: p, now };
  view?.update(p, now);
}

export function renderMapLegend(p: Panel | null, _ctx: Ctx): string {
  if (!p) return '';
  return `<div class="map-foot">
    <ul class="legend">
      <li><i class="sw sw-own"></i>Distrito de Independencia</li>
      <li><i class="sw sw-district"></i>Distritos vecinos de Huaraz</li>
      <li><i class="sw sw-water-line"></i>Ríos</li>
      <li><i class="sw sw-lake"></i>Lagunas glaciares</li>
      <li><i class="sw sw-gauge"></i>Puntos de caudal</li>
      <li><i class="sw sw-quake"></i>Sismos del último mes</li>
    </ul>
    <ul class="legend">
      <li class="legend-k">Peligro por aluvión</li>
      ${HAZARD_LEVELS.map((l) => `<li><i class="sw" style="background:${l.color};opacity:.7"></i>${esc(l.label)}</li>`).join('')}
      <li><i class="sw sw-zone"></i>Zona segura</li>
      <li><i class="sw sw-route"></i>Ruta de evacuación</li>
    </ul>
    <p class="muted">${esc(GEO_CREDITS)} Capas de riesgo: CENEPRED (escenario El Niño 2027). Los mapas satelital, de relieve y de calles son de Esri y se activan en «Capas»; el relieve 3D usa Terrain Tiles (Mapzen, AWS).</p>
  </div>`;
}

/** Sources of the alluvion maps, with a link to each PDF (static: needs no map code). */
export function renderMapSources(_p: Panel | null, _ctx: Ctx): string {
  const item = (s: (typeof MAP_SOURCES)[number]) => `<li class="src-map">
      <p class="src-map-k">${esc(s.basin === 'quillcay' ? 'Quillcay · Huaraz e Independencia' : 'Casca')}</p>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.author)}.${s.inputs ? ` Información base: ${esc(s.inputs)}.` : ''} ${esc(monthYear(s.date))}, escala ${esc(s.scale)}.</p>
      ${
        s.pdf
          ? `<p class="src-map-links"><a class="btn" href="${esc(s.pdf)}" target="_blank" rel="noopener">${icon('external')}<span>Ver el PDF</span></a>${s.page ? `<a href="${esc(s.page)}" target="_blank" rel="noopener">Ficha en SINIA (MINAM)</a>` : ''}</p>`
          : '<p class="src-map-links muted">Enlace público al PDF pendiente de confirmar.</p>'
      }
    </li>`;
  return `<section class="card src-maps" aria-labelledby="src-maps-h">
    <div class="card-h"><h3 id="src-maps-h">Fuentes de los mapas de aluvión</h3></div>
    <ul class="src-map-list">${MAP_SOURCES.map(item).join('')}</ul>
    <p class="muted src-maps-note">Las capas se extrajeron de los GeoPDF originales: las de Casca vienen como vectores, y las de Quillcay se vectorizaron desde la imagen del mapa (0,72 m por píxel), con los lugares seguros ubicados por el color de cada ícono. Es una reproducción para consulta y planificación; ante una emergencia, sigue las indicaciones de las autoridades y los mapas oficiales.</p>
  </section>`;
}
