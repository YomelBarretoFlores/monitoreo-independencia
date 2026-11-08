import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature } from 'geojson';
import type { Panel } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
import { districts, GEO_CREDITS, INDEPENDENCIA, rivers } from '../lib/geodata.ts';
import { levelLabel } from '../lib/levels.ts';
import {
  BASEMAPS,
  type Basemap,
  RISK_CREDIT,
  RISK_LAYERS,
  type RiskLayer,
  riskTileUrl,
} from '../lib/maplayers.ts';
import { icon } from '../ui/icons.ts';
import type { Ctx } from '../ui/shell.ts';

// Mapa: a vector map drawn from official layers (IGN boundaries, ANA rivers). The "Capas" panel
// switches the base map (official vector, satellite, terrain, streets) and overlays CENEPRED's
// susceptibility maps. The map lives while the Mapa view is open; data refreshes only swap the
// overlay layer. The chosen layers persist while the page is open.

/** CENEPRED raster drawn tile by tile through its ArcGIS export endpoint. */
class RiskTiles extends L.TileLayer {
  private readonly layerId: number;
  constructor(layerId: number, options: L.TileLayerOptions) {
    super('', options);
    this.layerId = layerId;
  }
  getTileUrl(c: L.Coords): string {
    return riskTileUrl(this.layerId, c.x, c.y, c.z);
  }
}

const state: { base: Basemap['id']; risks: Set<RiskLayer['id']> } = { base: 'oficial', risks: new Set() };

let map: L.Map | null = null;
let overlay: L.LayerGroup | null = null;
let neighbours: L.GeoJSON | null = null;
let baseLayer: L.LayerGroup | null = null;
const riskLayers = new Map<RiskLayer['id'], L.TileLayer>();
let observer: ResizeObserver | null = null;
/** "Loading" note in the layers panel while CENEPRED tiles are on their way (its server is slow) */
let riskStatus: HTMLElement | null = null;
let riskLoading = 0;

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const isOwn = (f: Feature | undefined) => f?.properties?.ubigeo === INDEPENDENCIA;

/** District fills give way to whatever sits below them (imagery or a risk raster). */
function applyDistrictStyle(): void {
  const seeThrough = state.base !== 'oficial' || state.risks.size > 0;
  neighbours?.setStyle((f) =>
    isOwn(f)
      ? { fillOpacity: state.risks.size ? 0 : state.base !== 'oficial' ? 0.35 : 0.9 }
      : {
          color: css('--line-strong', '#cfccc4'),
          weight: 1,
          fillColor: css('--surface', '#ffffff'),
          fillOpacity: seeThrough ? 0 : 1,
        },
  );
}

function setBase(m: L.Map, id: Basemap['id']): void {
  state.base = id;
  baseLayer?.remove();
  baseLayer = null;
  const b = BASEMAPS.find((x) => x.id === id)!;
  if (b.tiles.length) {
    baseLayer = L.layerGroup(
      b.tiles.map((u) => L.tileLayer(u, { attribution: b.attribution, maxZoom: 18, pane: 'base' })),
    ).addTo(m);
  }
  m.getContainer().classList.toggle('is-dark', !!b.dark);
  // Esri tiles carry their own place names: keep only the Independencia label on top of them
  m.getContainer().classList.toggle('has-base', b.tiles.length > 0);
  applyDistrictStyle();
}

function setRiskLoading(delta: number): void {
  riskLoading = Math.max(0, riskLoading + delta);
  if (riskStatus) riskStatus.hidden = riskLoading === 0;
}

function setRisk(m: L.Map, r: RiskLayer, on: boolean): void {
  if (on) {
    state.risks.add(r.id);
    if (!riskLayers.has(r.id))
      riskLayers.set(
        r.id,
        new RiskTiles(r.layer, { pane: 'risk', opacity: 0.7, maxZoom: 18, attribution: RISK_CREDIT })
          .on('loading', () => setRiskLoading(+1))
          .on('load', () => setRiskLoading(-1))
          .addTo(m),
      );
  } else {
    state.risks.delete(r.id);
    const layer = riskLayers.get(r.id);
    if (layer?.isLoading()) setRiskLoading(-1);
    layer?.remove();
    riskLayers.delete(r.id);
  }
  applyDistrictStyle();
}

const legendChips = (r: RiskLayer) =>
  `<ul class="ml-legend">${r.legend.map(([label, color]) => `<li><i style="background:${color}"></i>${esc(label)}</li>`).join('')}</ul>`;

function layersControl(m: L.Map): L.Control {
  const Ctl = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create('div', 'map-layers');
      const open = window.matchMedia('(min-width: 768px)').matches;
      box.innerHTML = `<button type="button" class="ml-toggle" aria-expanded="${open}" aria-controls="ml-panel">${icon('layers')}<span>Capas</span></button>
        <div class="ml-panel" id="ml-panel"${open ? '' : ' hidden'}>
          <fieldset><legend>Mapa base</legend><div class="ml-seg">${BASEMAPS.map(
            (b) =>
              `<label><input type="radio" name="ml-base" value="${b.id}"${b.id === state.base ? ' checked' : ''}><span>${esc(b.label)}</span></label>`,
          ).join('')}</div></fieldset>
          <fieldset><legend>Riesgo ante lluvias intensas (CENEPRED)</legend>${RISK_LAYERS.map(
            (
              r,
            ) => `<label class="ml-risk"><input type="checkbox" value="${r.id}"${state.risks.has(r.id) ? ' checked' : ''}>
              <span><b>${esc(r.label)}</b><small>${esc(r.hint)}</small></span></label>
              <div class="ml-legend-box" data-legend="${r.id}"${state.risks.has(r.id) ? '' : ' hidden'}>${legendChips(r)}</div>`,
          ).join(
            '',
          )}<p class="ml-status" role="status" hidden>Cargando la capa de CENEPRED…</p><p class="ml-note">Susceptibilidad para el escenario de lluvias de El Niño 2027.</p></fieldset>
        </div>`;
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      riskStatus = box.querySelector<HTMLElement>('.ml-status');
      riskLoading = 0;
      const toggle = box.querySelector<HTMLButtonElement>('.ml-toggle')!;
      const panel = box.querySelector<HTMLElement>('.ml-panel')!;
      toggle.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
      });
      box.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        if (input.name === 'ml-base') return setBase(m, input.value as Basemap['id']);
        const r = RISK_LAYERS.find((x) => x.id === input.value);
        if (!r) return;
        setRisk(m, r, input.checked);
        const legend = box.querySelector<HTMLElement>(`[data-legend="${r.id}"]`);
        if (legend) legend.hidden = !input.checked;
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
  // base tiles under everything; risk rasters above them and below the vector layers (overlayPane 400)
  m.createPane('base').style.zIndex = '150';
  m.createPane('risk').style.zIndex = '350';
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
        ? { color: accent, weight: 2, fillColor: css('--lime', '#d4f06f'), fillOpacity: 0.9 }
        : {
            color: css('--line-strong', '#cfccc4'),
            weight: 1,
            fillColor: css('--surface', '#ffffff'),
            fillOpacity: 1,
          },
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
  layersControl(m).addTo(m);
  // restore the layers chosen earlier in this visit
  setBase(m, state.base);
  for (const r of RISK_LAYERS) if (state.risks.has(r.id)) setRisk(m, r, true);

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
  map = overlay = neighbours = baseLayer = null;
  riskLayers.clear();
  riskStatus = null;
  riskLoading = 0;
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
    <p class="muted">${esc(GEO_CREDITS)} Capas de riesgo: CENEPRED (escenario El Niño 2027). Los mapas satelital, de relieve y de calles son de Esri y se activan en «Capas».</p>
  </div>`;
}
