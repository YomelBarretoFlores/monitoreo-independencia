import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature } from 'geojson';
import type { Panel } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
import { districts, GEO_CREDITS, INDEPENDENCIA, rivers } from '../lib/geodata.ts';
import { levelLabel } from '../lib/levels.ts';
import type { Ctx } from '../ui/shell.ts';

// Mapa: a vector map drawn only from official layers (IGN boundaries, ANA rivers). A third-party
// basemap is an optional toggle. The map lives while the Mapa view is open; data refreshes only
// swap the overlay layer.

/**
 * Optional basemap. CARTO Positron now needs an API key (checked 2026-11-07), so this uses Esri's
 * keyless Light Gray Canvas (base + labels).
 */
const BASEMAP = {
  layers: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  ],
  attribution:
    'Mapa base © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};

let map: L.Map | null = null;
let overlay: L.LayerGroup | null = null;
let neighbours: L.GeoJSON | null = null;
let basemap: L.LayerGroup | null = null;
let observer: ResizeObserver | null = null;

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const isOwn = (f: Feature | undefined) => f?.properties?.ubigeo === INDEPENDENCIA;

function neighbourStyle(withBasemap: boolean): L.PathOptions {
  return {
    color: css('--line-strong', '#cfccc4'),
    weight: 1,
    fillColor: css('--surface', '#ffffff'),
    fillOpacity: withBasemap ? 0 : 1,
  };
}

function basemapControl(m: L.Map): L.Control {
  const Ctl = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create('label', 'map-toggle');
      box.innerHTML = '<input type="checkbox" /> <span>Mapa base</span>';
      L.DomEvent.disableClickPropagation(box);
      const input = box.querySelector('input') as HTMLInputElement;
      input.addEventListener('change', () => {
        if (input.checked) {
          basemap = L.layerGroup(
            BASEMAP.layers.map((u) => L.tileLayer(u, { attribution: BASEMAP.attribution, maxZoom: 16 })),
          ).addTo(m);
          basemap.eachLayer((l) => (l as L.TileLayer).bringToBack());
        } else {
          basemap?.remove();
          basemap = null;
        }
        neighbours?.setStyle((f) =>
          isOwn(f) ? { fillOpacity: input.checked ? 0.4 : 1 } : neighbourStyle(input.checked),
        );
      });
      return box;
    },
  });
  return new Ctl({ position: 'topright' });
}

export function mountMap(el: HTMLElement): void {
  unmountMap();
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const m = L.map(el, {
    zoomSnap: 0.25,
    scrollWheelZoom: false,
    // On touch screens one finger keeps scrolling the page; pinch or the +/- buttons zoom.
    dragging: !coarse,
    attributionControl: true,
  });
  map = m;
  m.attributionControl.setPrefix(false);
  m.attributionControl.addAttribution(
    'Límites: <a href="https://data.humdata.org/dataset/cod-ab-per" target="_blank" rel="noopener">IGN</a> · Ríos y lagunas: <a href="https://geosnirh.ana.gob.pe/" target="_blank" rel="noopener">ANA</a>',
  );
  // First click/tap "activates" the map: wheel zoom on desktop, one-finger panning on touch.
  m.on('click', () => {
    m.scrollWheelZoom.enable();
    if (coarse) m.dragging.enable();
  });
  m.on('mouseout', () => m.scrollWheelZoom.disable());

  const accent = css('--accent', '#0f4c5c');
  neighbours = L.geoJSON(districts, {
    style: (f) =>
      isOwn(f)
        ? { color: accent, weight: 2, fillColor: css('--accent-soft', '#e8eff0'), fillOpacity: 1 }
        : neighbourStyle(false),
    onEachFeature: (f, layer) => {
      layer.bindTooltip(esc(String(f.properties?.name ?? '')), {
        permanent: true,
        direction: 'center',
        className: isOwn(f) ? 'map-label map-label-own' : 'map-label',
      });
    },
  }).addTo(m);

  L.geoJSON(rivers, {
    style: (f) => ({
      color: css('--water', '#3d7a91'),
      weight: /santa/i.test(String(f?.properties?.name)) ? 2.25 : 1.25,
      opacity: 0.9,
    }),
    onEachFeature: (f, layer) => layer.bindTooltip(esc(String(f.properties?.name ?? '')), { sticky: true }),
  }).addTo(m);

  overlay = L.layerGroup().addTo(m);
  basemapControl(m).addTo(m);

  const own = neighbours.getLayers().find((l) => isOwn((l as L.GeoJSON).feature as Feature)) as
    L.Polygon | undefined;
  const bounds = own?.getBounds();
  if (bounds?.isValid()) m.fitBounds(bounds.pad(0.12));
  else m.setView([-9.51, -77.53], 11);
  observer = new ResizeObserver(() => m.invalidateSize());
  observer.observe(el);
}

export function unmountMap(): void {
  observer?.disconnect();
  observer = null;
  map?.remove();
  map = overlay = neighbours = basemap = null;
}

export function updateMap(p: Panel | null, now: number): void {
  if (!map || !overlay || !p) return;
  overlay.clearLayers();
  const group = overlay;
  const water = css('--water', '#3d7a91');
  const quake = css('--quake', '#9a3412');

  for (const l of p.lakes.data ?? []) {
    L.circleMarker(l.point, { radius: 6, color: '#fff', weight: 1.5, fillColor: water, fillOpacity: 1 })
      .bindPopup(
        `<strong>${esc(l.name)}</strong><br>${l.elevationM !== null ? `${fmtNum(l.elevationM)} m de altitud<br>` : ''}${esc(l.basin)}`,
      )
      .addTo(group);
  }

  for (const r of p.rivers.data ?? []) {
    const last = r.series.filter((s) => !s.forecast).at(-1);
    L.circleMarker(r.point, { radius: 5, color: water, weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .bindPopup(
        `<strong>${esc(r.name)}</strong><br>Nivel: ${esc(levelLabel(r.level))}${last ? `<br>${fmtNum(last.dischargeM3s, 1)} m³/s (estimado)` : ''}`,
      )
      .addTo(group);
  }

  const monthAgo = now - 30 * 86_400_000;
  for (const q of p.earthquakes.data ?? []) {
    if (Date.parse(q.date) < monthAgo) continue;
    L.circleMarker(q.point, {
      radius: 3 + q.magnitude * 1.4,
      color: quake,
      weight: 1.25,
      fillColor: quake,
      fillOpacity: 0.12,
    })
      .bindPopup(
        `<strong>Sismo de magnitud ${fmtNum(q.magnitude, 1)}</strong><br>${esc(q.reference)}<br>${esc(fmtDateTime(q.date))}`,
      )
      .addTo(group);
  }
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
    <p class="muted">${esc(GEO_CREDITS)} El mapa base de terceros es opcional.</p>
  </div>`;
}
