import type { Panel } from '../../shared/types.ts';
import { esc } from '../lib/format.ts';
import { GEO_CREDITS } from '../lib/geodata.ts';
import type { Ctx } from '../ui/shell.ts';

// Mapa: a thin facade. The map engine (MapLibre) and its layers live in map-view.ts, which is
// fetched only when the Mapa view opens, so the other views never download them.

type MapView = typeof import('./map-view.ts');

let view: MapView | null = null;
/** Bumped on every mount/unmount so a slow import cannot mount into a view that is gone */
let generation = 0;
let latest: { panel: Panel | null; now: number } = { panel: null, now: 0 };

/** Start downloading the map chunk early (e.g. when the pointer reaches the Mapa link). */
export function prefetchMap(): void {
  void import('./map-view.ts').catch(() => undefined);
}

export function mountMap(el: HTMLElement): void {
  const gen = ++generation;
  el.classList.add('is-loading');
  el.setAttribute('aria-busy', 'true');
  import('./map-view.ts')
    .then((m) => {
      if (gen !== generation || !el.isConnected) return;
      view = m;
      el.classList.remove('is-loading');
      el.removeAttribute('aria-busy');
      m.mount(el);
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
    <p class="muted">${esc(GEO_CREDITS)} Capas de riesgo: CENEPRED (escenario El Niño 2027). Los mapas satelital, de relieve y de calles son de Esri y se activan en «Capas»; el relieve 3D usa Terrain Tiles (Mapzen, AWS).</p>
  </div>`;
}
