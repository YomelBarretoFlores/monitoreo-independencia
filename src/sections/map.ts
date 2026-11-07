import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Panel } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
import { levelLabel } from '../lib/levels.ts';
import type { Ctx } from '../ui/shell.ts';

// Mapa: Leaflet on a light basemap. The map is created once; data refreshes only swap layers.

/**
 * Light basemap. CARTO Positron (basemaps.cartocdn.com/light_all) now answers every tile with
 * "API KEY REQUIRED" (checked 2026-11-07), so this uses Esri's keyless Light Gray Canvas
 * (base + labels). Swap here if a CARTO key or another provider is adopted.
 */
const BASEMAP = {
  layers: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  ],
  attribution:
    'Mapa base © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
};

let map: L.Map | null = null;
let overlay: L.LayerGroup | null = null;
let fitted = false;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function ensureMap(el: HTMLElement, center: [number, number]): L.Map {
  if (map) return map;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  map = L.map(el, {
    center,
    zoom: 11,
    scrollWheelZoom: false,
    // On touch screens one finger keeps scrolling the page; pinch or the +/- buttons zoom.
    dragging: !coarse,
    attributionControl: true,
  });
  for (const layer of BASEMAP.layers) L.tileLayer(layer, { attribution: BASEMAP.attribution, maxZoom: 16 }).addTo(map);
  // First click/tap "activates" the map: wheel zoom on desktop, one-finger panning on touch.
  map.on('click', () => {
    map?.scrollWheelZoom.enable();
    if (coarse) map?.dragging.enable();
  });
  map.on('mouseout', () => map?.scrollWheelZoom.disable());
  overlay = L.layerGroup().addTo(map);
  new ResizeObserver(() => map?.invalidateSize()).observe(el);
  return map;
}

export function updateMap(p: Panel | null, now: number): void {
  const el = document.getElementById('map');
  if (!el || !p) return;
  const m = ensureMap(el, p.district.center);
  overlay?.clearLayers();
  const group = overlay as L.LayerGroup;
  const accent = css('--accent') || '#0c5a8f';

  let bounds: L.LatLngBounds | null = null;
  if (p.boundary) {
    const layer = L.geoJSON(p.boundary, {
      style: { color: accent, weight: 2.5, fillColor: accent, fillOpacity: 0.07 },
      interactive: false,
    }).addTo(group);
    bounds = layer.getBounds();
  }

  for (const l of p.lakes.data ?? []) {
    L.circleMarker(l.point, { radius: 8, color: '#fff', weight: 2, fillColor: css('--lake') || '#0891b2', fillOpacity: 1 })
      .bindPopup(
        `<strong>${esc(l.name)}</strong><br>${l.elevationM !== null ? `${fmtNum(l.elevationM)} m de altitud<br>` : ''}${esc(l.basin)}`,
      )
      .addTo(group);
    bounds?.extend(l.point);
  }

  for (const r of p.rivers.data ?? []) {
    const last = r.series.filter((s) => !s.forecast).at(-1);
    L.marker(r.point, {
      icon: L.divIcon({ className: 'mk-river', html: '<span></span>', iconSize: [16, 16] }),
      title: r.name,
    })
      .bindPopup(
        `<strong>${esc(r.name)}</strong><br>Nivel: ${esc(levelLabel(r.level))}${last ? `<br>${fmtNum(last.dischargeM3s, 1)} m³/s (estimado)` : ''}`,
      )
      .addTo(group);
  }

  const monthAgo = now - 30 * 86_400_000;
  for (const q of p.earthquakes.data ?? []) {
    if (Date.parse(q.date) < monthAgo) continue;
    L.circleMarker(q.point, {
      radius: 4 + q.magnitude * 1.6,
      color: css('--quake') || '#c2410c',
      weight: 2,
      fillColor: css('--quake') || '#c2410c',
      fillOpacity: 0.18,
    })
      .bindPopup(`<strong>Sismo de magnitud ${fmtNum(q.magnitude, 1)}</strong><br>${esc(q.reference)}<br>${esc(fmtDateTime(q.date))}`)
      .addTo(group);
  }

  if (!fitted) {
    if (bounds?.isValid()) m.fitBounds(bounds, { padding: [24, 24] });
    else m.setView(p.district.center, 11);
    fitted = true;
  }
}

export function renderMapLegend(p: Panel | null, _ctx: Ctx): string {
  if (!p) return '';
  return `<div class="map-foot">
    <ul class="legend">
      <li><i class="sw sw-boundary"></i>Distrito de Independencia${p.boundary ? '' : ' (contorno no disponible)'}</li>
      <li><i class="sw sw-lake"></i>Lagunas glaciares</li>
      <li><i class="sw sw-rivermk"></i>Puntos de río</li>
      <li><i class="sw sw-quake"></i>Sismos del último mes (más grande = mayor magnitud)</li>
    </ul>
    <p class="muted">Toque un punto para ver su detalle. En el celular, toque el mapa una vez para poder moverlo; use dos dedos o los botones + y − para acercar.</p>
  </div>`;
}
