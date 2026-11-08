import {
  AttributionControl,
  FullscreenControl,
  type GeoJSONSource,
  type IControl,
  type LngLatBoundsLike,
  Map as MapLibre,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Panel } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
import { bboxOf, labelPoint } from '../lib/geo.ts';
import { districts, INDEPENDENCIA, rivers } from '../lib/geodata.ts';
import { levelLabel } from '../lib/levels.ts';
import {
  BASEMAPS,
  type Basemap,
  RISK_CREDIT,
  RISK_LAYERS,
  type RiskLayer,
  riskTileTemplate,
  TERRAIN,
} from '../lib/maplayers.ts';
import {
  DEFAULT_FILTERS,
  EXPOSED_KINDS,
  HAZARD_LEVELS,
  hazardPopup,
  matchHazard,
  matchPlace,
  matchRoute,
  matchZone,
  placePopup,
  SAFE_KINDS,
  type SafeZoneFilters,
  zonePopup,
} from '../lib/safezones.ts';
import type { SafeZoneData } from '../lib/safezones-data.ts';
import { icon } from '../ui/icons.ts';
import { mountPanel, type PanelItem } from './safezones-panel.ts';

// The interactive map (MapLibre GL), loaded on demand by sections/map.ts so the engine and the
// map data never weigh on the other views. Official layers (IGN districts, ANA rivers) are
// GeoJSON; base maps, CENEPRED overlays and elevation are tiles. "3D" drapes the base map over
// real terrain. The alluvion layers (hazard, safe zones, routes, pins) come from the two
// GeoPDF maps and are filtered from the side panel. Choices persist while the page is open.

setWorkerUrl(workerUrl);

const LOCALE = {
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar créditos',
  'AttributionControl.MapFeedback': 'Comentarios sobre el mapa',
  'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda del ratón para acercar o alejar',
  'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda del ratón para acercar o alejar',
  'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
  'FullscreenControl.Enter': 'Pantalla completa',
  'FullscreenControl.Exit': 'Salir de pantalla completa',
  'Map.Title': 'Mapa',
  'NavigationControl.ResetBearing': 'Arrastra para girar; clic para volver al norte',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
};

const state: {
  base: Basemap['id'];
  risks: Set<RiskLayer['id']>;
  threeD: boolean;
  filters: SafeZoneFilters;
} = {
  base: 'oficial',
  risks: new Set(),
  threeD: false,
  filters: { ...DEFAULT_FILTERS },
};

/** Parsed once per page, the first time the map opens */
let data: SafeZoneData | null = null;
let selectedZone: number | null = null;

let map: MapLibre | null = null;
let observer: ResizeObserver | null = null;
let labels: Marker[] = [];
let riskStatus: HTMLElement | null = null;
let syncControls: (() => void) | null = null;

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const IS_OWN: ['==', ['get', string], string] = ['==', ['get', 'ubigeo'], INDEPENDENCIA];
const baseLayerIds = (b: Basemap) => b.tiles.map((_, i) => `base-${b.id}-${i}`);
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function buildStyle(): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    districts: { type: 'geojson', data: districts },
    rivers: { type: 'geojson', data: rivers },
    dem: {
      type: 'raster-dem',
      tiles: TERRAIN.tiles,
      encoding: TERRAIN.encoding,
      tileSize: TERRAIN.tileSize,
      maxzoom: TERRAIN.maxzoom,
      attribution: TERRAIN.attribution,
    },
    lakes: { type: 'geojson', data: EMPTY },
    gauges: { type: 'geojson', data: EMPTY },
    quakes: { type: 'geojson', data: EMPTY },
  };
  const layers: StyleSpecification['layers'] = [
    { id: 'background', type: 'background', paint: { 'background-color': css('--surface-2', '#eef0ea') } },
  ];
  for (const b of BASEMAPS)
    b.tiles.forEach((url, i) => {
      const id = baseLayerIds(b)[i]!;
      sources[id] = {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        maxzoom: 18,
        attribution: i === 0 ? b.attribution : undefined,
      };
      layers.push({ id, type: 'raster', source: id, layout: { visibility: 'none' } });
    });
  // relief shading under the official vector map
  layers.push({
    id: 'hillshade',
    type: 'hillshade',
    source: 'dem',
    paint: {
      'hillshade-shadow-color': '#5b6168',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-exaggeration': 0.35,
    },
  });
  layers.push({
    id: 'districts-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': ['case', IS_OWN, css('--lime', '#d4f06f'), css('--surface', '#ffffff')],
      'fill-opacity': 1,
    },
  });
  for (const r of RISK_LAYERS) {
    sources[`risk-${r.id}`] = {
      type: 'raster',
      tiles: [riskTileTemplate(r.layer)],
      tileSize: 256,
      attribution: RISK_CREDIT,
    };
    layers.push({
      id: `risk-${r.id}`,
      type: 'raster',
      source: `risk-${r.id}`,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.7 },
    });
  }
  if (data) addSafeZoneLayers(sources, layers, data);
  layers.push(
    {
      id: 'districts-line',
      type: 'line',
      source: 'districts',
      paint: {
        'line-color': ['case', IS_OWN, css('--accent', '#0f4c5c'), css('--line-strong', '#cfccc4')],
        'line-width': ['case', IS_OWN, 2.5, 1],
      },
    },
    {
      id: 'rivers',
      type: 'line',
      source: 'rivers',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': css('--water', '#3d7a91'),
        'line-width': ['case', ['in', 'Santa', ['get', 'name']], 2.5, 1.4],
        'line-opacity': 0.9,
      },
    },
    {
      id: 'quakes',
      type: 'circle',
      source: 'quakes',
      paint: {
        'circle-radius': ['+', 3, ['*', 1.4, ['get', 'magnitude']]],
        'circle-color': css('--quake', '#9a3412'),
        'circle-opacity': 0.14,
        'circle-stroke-color': css('--quake', '#9a3412'),
        'circle-stroke-width': 1.25,
      },
    },
    {
      id: 'gauges',
      type: 'circle',
      source: 'gauges',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': css('--water', '#3d7a91'),
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'lakes',
      type: 'circle',
      source: 'lakes',
      paint: {
        'circle-radius': 6,
        'circle-color': css('--water', '#3d7a91'),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    },
  );
  layers.push({
    id: 'sz-points',
    type: 'circle',
    source: 'sz-points',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 14, 6, 17, 9],
      'circle-color': PLACE_COLOR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 2],
    },
  });
  return { version: 8, sources, layers };
}

// Style types come from MapLibre's own API (its style-spec package is not a direct dependency)
type Filter = NonNullable<Parameters<MapLibre['setFilter']>[1]>;
type LayerSpec = StyleSpecification['layers'][number];
type FillColor = NonNullable<Extract<LayerSpec, { type: 'fill' }>['paint']>['fill-color'];
type CircleColor = NonNullable<Extract<LayerSpec, { type: 'circle' }>['paint']>['circle-color'];

// 'match' expressions built from the legend lists (TypeScript cannot check a spread tuple)
const HAZARD_COLOR = [
  'match',
  ['get', 'level'],
  ...HAZARD_LEVELS.flatMap((l) => [l.id, l.color]),
  '#999999',
] as unknown as FillColor;
const PLACE_COLOR = [
  'match',
  ['concat', ['get', 'group'], ':', ['get', 'kind']],
  ...SAFE_KINDS.flatMap((k) => [`seguro:${k.id}`, k.color]),
  ...EXPOSED_KINDS.flatMap((k) => [`expuesto:${k.id}`, k.color]),
  '#666666',
] as unknown as CircleColor;
const ZONE_COLOR = SAFE_KINDS[0]!.color;
/** Matches nothing until filters are applied after load */
const only = (ids: number[]): Filter => ['in', ['get', 'uid'], ['literal', ids]];
const NONE = only([]);

function addSafeZoneLayers(
  sources: StyleSpecification['sources'],
  layers: StyleSpecification['layers'],
  d: SafeZoneData,
): void {
  sources['sz-hazard'] = { type: 'geojson', data: d.hazard };
  sources['sz-zones'] = { type: 'geojson', data: d.zones };
  sources['sz-influence'] = { type: 'geojson', data: d.influence };
  sources['sz-routes'] = { type: 'geojson', data: d.routes };
  sources['sz-points'] = { type: 'geojson', data: d.points };
  layers.push(
    {
      id: 'sz-hazard',
      type: 'fill',
      source: 'sz-hazard',
      filter: NONE,
      paint: { 'fill-color': HAZARD_COLOR, 'fill-opacity': 0.5 },
    },
    {
      id: 'sz-influence',
      type: 'line',
      source: 'sz-influence',
      filter: ['==', ['get', 'zone'], ''],
      paint: { 'line-color': '#5b1470', 'line-width': 2, 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'sz-zones',
      type: 'fill',
      source: 'sz-zones',
      filter: NONE,
      paint: { 'fill-color': ZONE_COLOR, 'fill-opacity': 0.6 },
    },
    {
      id: 'sz-zones-line',
      type: 'line',
      source: 'sz-zones',
      filter: NONE,
      paint: {
        'line-color': '#0b5e55',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 2.5],
      },
    },
    {
      id: 'sz-selected',
      type: 'line',
      source: 'sz-zones',
      filter: NONE,
      paint: { 'line-color': '#15171b', 'line-width': 3.5 },
    },
    {
      id: 'sz-routes-casing',
      type: 'line',
      source: 'sz-routes',
      filter: NONE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1f5f1a', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 17, 6] },
    },
    {
      id: 'sz-routes',
      type: 'line',
      source: 'sz-routes',
      filter: NONE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#7cf03c',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.2, 17, 3],
        'line-dasharray': [2, 1.2],
      },
    },
  );
}

const uids = <P extends { uid: number }>(fc: { features: { properties: P }[] }, keep: (p: P) => boolean) =>
  fc.features.filter((f) => keep(f.properties)).map((f) => f.properties.uid);

/** Show only the features the filters keep (one cheap `in` filter per layer, no data re-upload). */
function applyFilters(m: MapLibre): void {
  if (!data) return;
  const f = state.filters;
  const zones = only(uids(data.zones, (p) => matchZone(p, f)));
  m.setFilter('sz-hazard', only(uids(data.hazard, (p) => matchHazard(p, f))));
  m.setFilter('sz-zones', zones);
  m.setFilter('sz-zones-line', zones);
  const routes = only(uids(data.routes, (p) => matchRoute(p, f)));
  m.setFilter('sz-routes', routes);
  m.setFilter('sz-routes-casing', routes);
  m.setFilter('sz-points', only(uids(data.points, (p) => matchPlace(p, f))));
  // a selection hidden by the filters goes away
  if (selectedZone !== null && !matchZone(data.zones.features[selectedZone]!.properties, f))
    selectZone(m, null);
}

function selectZone(m: MapLibre, uid: number | null): void {
  selectedZone = uid;
  const id = uid === null ? '' : data!.zones.features[uid]!.properties.id;
  m.setFilter('sz-selected', only(uid === null ? [] : [uid]));
  m.setFilter('sz-influence', ['==', ['get', 'zone'], id]);
}

/** Where a feature's popup and directions point: the pin itself, or inside the zone. */
const anchorOf = (f: Feature) =>
  (f.geometry.type === 'Point' ? f.geometry.coordinates : labelPoint(f.geometry)) as [number, number];

let popup: Popup | null = null;
function openPopup(m: MapLibre, at: [number, number], html: string): void {
  popup?.remove();
  popup = new Popup({ maxWidth: '300px' }).setLngLat(at).setHTML(html).addTo(m);
  popup.on('close', () => {
    if (popup?.isOpen() === false) selectZone(m, null);
  });
}

function showZone(m: MapLibre, uid: number): void {
  const f = data!.zones.features[uid]!;
  const [lon, lat] = anchorOf(f);
  selectZone(m, uid);
  openPopup(m, [lon, lat], zonePopup(f.properties, lat, lon));
}

function showPlace(m: MapLibre, uid: number): void {
  const f = data!.points.features[uid]!;
  const [lon, lat] = anchorOf(f);
  openPopup(m, [lon, lat], placePopup(f.properties, lat, lon));
}

/** From the panel's search results: fly there and open its card. */
function focusItem(m: MapLibre, item: PanelItem): void {
  const f = item.kind === 'zone' ? data!.zones.features[item.uid]! : data!.points.features[item.uid]!;
  const [w, s, e, n] = bboxOf([f]);
  const done = () => (item.kind === 'zone' ? showZone(m, item.uid) : showPlace(m, item.uid));
  m.once('moveend', done);
  if (w === e && s === n) m.flyTo({ center: [w, s], zoom: 17, duration: 900 });
  else m.fitBounds([w, s, e, n], { padding: 80, maxZoom: 17.5, duration: 900 });
}

function fitSafeZones(m: MapLibre): void {
  if (!data) return;
  const [w, s, e, n] = bboxOf([...data.hazard.features, ...data.points.features]);
  m.fitBounds([w, s, e, n], { padding: 32, duration: 900 });
}

/** One click handler: the topmost interactive feature wins. */
const CLICK_ORDER = ['sz-points', 'lakes', 'gauges', 'quakes', 'sz-zones', 'sz-hazard'];
function bindClicks(m: MapLibre): void {
  m.on('click', (e) => {
    const layers = CLICK_ORDER.filter((id) => m.getLayer(id));
    const hit = m.queryRenderedFeatures(e.point, { layers });
    const f = CLICK_ORDER.map((id) => hit.find((h) => h.layer.id === id)).find(Boolean);
    if (!f) {
      popup?.remove();
      selectZone(m, null);
      return;
    }
    const id = f.layer.id;
    if (id === 'sz-points') return showPlace(m, f.properties.uid as number);
    if (id === 'sz-zones') return showZone(m, f.properties.uid as number);
    selectZone(m, null);
    if (id === 'sz-hazard')
      return openPopup(
        m,
        [e.lngLat.lng, e.lngLat.lat],
        hazardPopup(data!.hazard.features[f.properties.uid as number]!.properties),
      );
    openPopup(m, (f.geometry as Point).coordinates as [number, number], String(f.properties.html));
  });
  for (const id of CLICK_ORDER) {
    m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
  }
}

/** District fills give way to whatever sits below them (imagery or a risk raster). */
function applyDistrictStyle(m: MapLibre): void {
  const seeThrough = state.base !== 'oficial' || state.risks.size > 0 || state.threeD;
  // on the official map the fills stay translucent so the relief shading reads through
  const own = state.risks.size ? 0 : state.base !== 'oficial' ? 0.3 : 0.6;
  m.setPaintProperty('districts-fill', 'fill-opacity', ['case', IS_OWN, own, seeThrough ? 0 : 0.55]);
}

function setBase(m: MapLibre, id: Basemap['id']): void {
  state.base = id;
  for (const b of BASEMAPS)
    for (const layer of baseLayerIds(b))
      m.setLayoutProperty(layer, 'visibility', b.id === id ? 'visible' : 'none');
  const b = BASEMAPS.find((x) => x.id === id)!;
  m.setLayoutProperty('hillshade', 'visibility', b.tiles.length ? 'none' : 'visible');
  const el = m.getContainer();
  el.classList.toggle('is-dark', !!b.dark);
  // Esri tiles carry their own place names: keep only the Independencia label on top of them
  el.classList.toggle('has-base', b.tiles.length > 0);
  applyDistrictStyle(m);
}

function setRisk(m: MapLibre, r: RiskLayer, on: boolean): void {
  if (on) state.risks.add(r.id);
  else state.risks.delete(r.id);
  m.setLayoutProperty(`risk-${r.id}`, 'visibility', on ? 'visible' : 'none');
  applyDistrictStyle(m);
}

function setThreeD(m: MapLibre, on: boolean): void {
  state.threeD = on;
  if (on) {
    // terrain looks real only under imagery
    if (state.base === 'oficial') setBase(m, 'satelite');
    m.setTerrain({ source: 'dem', exaggeration: TERRAIN.exaggeration });
    m.setSky({
      'sky-color': '#9fc3e6',
      'horizon-color': '#e8eef2',
      'fog-color': '#eef1ef',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.4,
    });
    m.easeTo({ pitch: 62, bearing: -20, duration: 1200 });
  } else {
    m.setTerrain(null);
    m.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }
  applyDistrictStyle(m);
  syncControls?.();
}

/** Shows a note while CENEPRED tiles load (its server takes seconds per tile). */
function trackRiskLoading(m: MapLibre): void {
  const update = () => {
    if (!riskStatus) return;
    const pending = RISK_LAYERS.some((r) => state.risks.has(r.id) && !m.isSourceLoaded(`risk-${r.id}`));
    riskStatus.hidden = !pending;
  };
  m.on('sourcedata', update);
  m.on('idle', update);
}

const legendChips = (r: RiskLayer) =>
  `<ul class="ml-legend">${r.legend.map(([label, color]) => `<li><i style="background:${color}"></i>${esc(label)}</li>`).join('')}</ul>`;

class LayersControl implements IControl {
  private box: HTMLElement | null = null;
  onAdd(m: MapLibre): HTMLElement {
    const box = document.createElement('div');
    box.className = 'maplibregl-ctrl map-layers';
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
    riskStatus = box.querySelector<HTMLElement>('.ml-status');
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
    this.box = box;
    return box;
  }
  /** Reflect a base map changed elsewhere (the 3D button switches to satellite). */
  sync(): void {
    this.box
      ?.querySelectorAll<HTMLInputElement>('input[name="ml-base"]')
      .forEach((i) => (i.checked = i.value === state.base));
  }
  onRemove(): void {
    this.box?.remove();
    this.box = null;
  }
}

class ThreeDControl implements IControl {
  private button: HTMLButtonElement | null = null;
  onAdd(m: MapLibre): HTMLElement {
    const box = document.createElement('div');
    box.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    box.innerHTML = `<button type="button" class="map-3d" aria-pressed="${state.threeD}" title="Ver el relieve en 3D">3D</button>`;
    this.button = box.querySelector('button');
    this.button!.addEventListener('click', () => setThreeD(m, !state.threeD));
    return box;
  }
  sync(): void {
    this.button?.setAttribute('aria-pressed', String(state.threeD));
  }
  onRemove(): void {
    this.button?.parentElement?.remove();
    this.button = null;
  }
}

function addDistrictLabels(m: MapLibre): void {
  for (const f of districts.features) {
    const p = f.properties ?? {};
    const own = p.ubigeo === INDEPENDENCIA;
    const el = document.createElement('span');
    el.className = own ? 'map-label map-label-own' : 'map-label';
    el.textContent = String(p.name ?? '');
    const at = labelPoint(f.geometry) as [number, number];
    labels.push(new Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(m));
  }
}

function ownBounds(): LngLatBoundsLike | null {
  const own = districts.features.find((f) => f.properties?.ubigeo === INDEPENDENCIA);
  return own ? (bboxOf([own]) as [number, number, number, number]) : null;
}

/** `loadData` parses the safe-zone layers (their own chunk, fetched alongside this one). */
export function mount(el: HTMLElement, loadData: () => SafeZoneData): void {
  unmount();
  data ??= loadData();
  const bounds = ownBounds();
  const m = new MapLibre({
    container: el,
    style: buildStyle(),
    bounds: bounds ?? undefined,
    center: bounds ? undefined : [-77.53, -9.51],
    zoom: bounds ? undefined : 11,
    fitBoundsOptions: { padding: 24 },
    maxPitch: 75,
    cooperativeGestures: true,
    attributionControl: false,
    locale: LOCALE,
  });
  map = m;
  m.addControl(
    new AttributionControl({
      compact: true,
      customAttribution:
        'Límites: <a href="https://data.humdata.org/dataset/cod-ab-per" target="_blank" rel="noopener">IGN</a> · Ríos y lagunas: <a href="https://geosnirh.ana.gob.pe/" target="_blank" rel="noopener">ANA</a>',
    }),
  );
  m.addControl(new NavigationControl({ visualizePitch: true }), 'top-left');
  const threeD = new ThreeDControl();
  m.addControl(threeD, 'top-left');
  m.addControl(new FullscreenControl({ container: el.closest<HTMLElement>('.map-card') ?? el }), 'top-left');
  m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
  const layersCtl = new LayersControl();
  m.addControl(layersCtl, 'top-right');
  syncControls = () => {
    layersCtl.sync();
    threeD.sync();
  };
  addDistrictLabels(m);
  bindClicks(m);
  trackRiskLoading(m);
  m.on('load', () => {
    // restore the layers chosen earlier in this visit
    setBase(m, state.base);
    for (const r of RISK_LAYERS) if (state.risks.has(r.id)) setRisk(m, r, true);
    if (state.threeD) setThreeD(m, true);
    applyFilters(m);
    if (pending) update(pending.panel, pending.now);
  });
  const panelRoot = document.getElementById('sz-panel');
  if (panelRoot && data)
    mountPanel(panelRoot, data, state.filters, {
      onChange: (f) => {
        state.filters = f;
        if (m.isStyleLoaded()) applyFilters(m);
      },
      onSelect: (item) => focusItem(m, item),
      onFit: () => fitSafeZones(m),
    });
  observer = new ResizeObserver(() => m.resize());
  observer.observe(el);
}

export function unmount(): void {
  observer?.disconnect();
  observer = null;
  for (const l of labels) l.remove();
  labels = [];
  map?.remove();
  map = null;
  riskStatus = null;
  syncControls = null;
  pending = null;
  popup = null;
  selectedZone = null;
}

let pending: { panel: Panel; now: number } | null = null;

const pointFeature = (lat: number, lon: number, props: Record<string, unknown>): Feature<Point> => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: props,
});

export function update(p: Panel | null, now: number): void {
  if (!map || !p) return;
  if (!map.isStyleLoaded()) {
    pending = { panel: p, now };
    return;
  }
  pending = null;
  const set = (id: string, features: Feature[]) =>
    (map!.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });

  set(
    'lakes',
    (p.lakes.data ?? []).map((l) =>
      pointFeature(l.point[0], l.point[1], {
        html: `<strong>${esc(l.name)}</strong><br>${l.elevationM !== null ? `${fmtNum(l.elevationM)} m de altitud<br>` : ''}${esc(l.basin)}`,
      }),
    ),
  );
  set(
    'gauges',
    (p.rivers.data ?? []).map((r) => {
      const last = r.series.filter((s) => !s.forecast).at(-1);
      return pointFeature(r.point[0], r.point[1], {
        html: `<strong>${esc(r.name)}</strong><br>Nivel: ${esc(levelLabel(r.level))}${last ? `<br>${fmtNum(last.dischargeM3s, 1)} m³/s (estimado)` : ''}`,
      });
    }),
  );
  const monthAgo = now - 30 * 86_400_000;
  set(
    'quakes',
    (p.earthquakes.data ?? [])
      .filter((q) => Date.parse(q.date) >= monthAgo)
      .map((q) =>
        pointFeature(q.point[0], q.point[1], {
          magnitude: q.magnitude,
          html: `<strong>Sismo de magnitud ${fmtNum(q.magnitude, 1)}</strong><br>${esc(q.reference)}<br>${esc(fmtDateTime(q.date))}`,
        }),
      ),
  );
}
