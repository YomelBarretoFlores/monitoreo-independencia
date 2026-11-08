import type { ExpressionSpecification, GeoJSONSource, Map as MapLibre } from 'maplibre-gl';
import { esc, fmtNum } from '../lib/format.ts';
import {
  bearingAlong,
  cityRevealAt,
  floodGradient,
  LAKE_IDS,
  type LakeId,
  type LakeRoute,
  LAKES,
  makeRoute,
  PHASE_LABEL,
  playRate,
  pointAlong,
  SCENARIO_IDS,
  type ScenarioId,
  SCENARIOS,
  simEnd,
  SOURCES,
  stateAt,
  WARNING,
} from '../lib/glof.ts';
import { HAZARD_LEVELS } from '../lib/safezones.ts';
import { icon } from '../ui/icons.ts';

// The alluvion animated on the app's own map: the flood runs down each lake's real flow route over the
// imagery and the terrain, the official hazard map of the city fills in once the front arrives, and the camera
// follows the front. Times only for lakes with a published timed model (src/lib/glof.ts).

export interface GlofSimDeps {
  routes: Record<string, LakeRoute>;
  /** Turn the 3D terrain on (switches the official base map to imagery) */
  ensure3D(): void;
  /** Stop the centros-poblados camera tour */
  stopTour(): void;
  /** Called after the strip opens or closes, so map controls can reflect it */
  onToggle(): void;
}

export interface GlofSim {
  open(lake?: LakeId): void;
  close(): void;
  destroy(): void;
  readonly isOpen: boolean;
}

/** Seconds shown before the avalanche, so the first frame is the calm lake */
const START = -15;
/** Real seconds a route without published times takes to run (no clock is shown for it) */
const UNTIMED_S = 60;
const SPEEDS = [0.5, 1, 2, 4];
const LAYERS = ['glof-city', 'glof-channel', 'glof-flood', 'glof-front-halo', 'glof-front'];
const EMPTY_LINE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] },
};

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
}
const minutes = (h: number) => fmtNum(Math.round(h * 60));

export function createGlofSim(m: MapLibre, deps: GlofSimDeps): GlofSim {
  let lake: LakeId = 'palcacocha';
  let scenario: ScenarioId = 'grande';
  /** Event seconds since the avalanche (timed lakes) or animation seconds (untimed routes) */
  let t = START;
  let playing = false;
  let speed = 1;
  let follow = true;
  let open = false;
  let raf = 0;
  let lastFrame = 0;
  let lastCam = 0;

  const route = () => deps.routes[lake] ?? null;
  const timed = () => LAKES[lake].status === 'timed';
  const animated = () => LAKES[lake].status !== 'no-study' && !!route();
  const end = () => (timed() ? simEnd(SCENARIOS[scenario]) : UNTIMED_S + 12);
  const start = () => (timed() ? START : 0);

  // ------------------------------------------------------------ the control strip
  const strip = document.createElement('section');
  strip.className = 'glof-strip';
  strip.hidden = true;
  strip.setAttribute('aria-label', 'Simulación de aluvión');
  strip.innerHTML = `<div class="gs-row">
      <label class="gs-field"><span>Laguna</span><select name="lake">${LAKE_IDS.map(
        (id) =>
          `<option value="${id}">${esc(LAKES[id].name)}${LAKES[id].status === 'timed' ? '' : LAKES[id].status === 'comparable' ? ' · sin minutos publicados' : ' · sin estudio'}</option>`,
      ).join('')}</select></label>
      <div class="gs-seg" role="group" aria-label="Escenario">${SCENARIO_IDS.map(
        (id) =>
          `<button type="button" data-scenario="${id}" title="${esc(SCENARIOS[id].note)}">${esc(SCENARIOS[id].label)}</button>`,
      ).join('')}</div>
      <button type="button" class="gs-play" data-action="play" aria-label="Reproducir">${icon('play')}</button>
      <div class="gs-time"><input type="range" name="time" min="0" max="1000" step="1" value="0" aria-label="Línea de tiempo"><div class="gs-marks"></div></div>
      <label class="gs-field"><span>Velocidad</span><select name="speed">${SPEEDS.map((v) => `<option value="${v}"${v === 1 ? ' selected' : ''}>×${fmtNum(v, v % 1 ? 1 : 0)}</option>`).join('')}</select></label>
      <label class="gs-check"><input type="checkbox" name="follow" checked><span>Seguir el frente</span></label>
      <button type="button" class="gs-close" data-action="close" aria-label="Cerrar la simulación">✕</button>
    </div>
    <div class="gs-read" role="status" aria-live="off"></div>
    <p class="gs-note"></p>`;
  // under the map, inside its card (so it joins the map in full screen and never covers it)
  m.getContainer().after(strip);
  const q = <T extends Element>(sel: string) => strip.querySelector<T>(sel)!;
  const lakeSel = q<HTMLSelectElement>('select[name="lake"]');
  const speedSel = q<HTMLSelectElement>('select[name="speed"]');
  const followBox = q<HTMLInputElement>('input[name="follow"]');
  const timeInput = q<HTMLInputElement>('input[name="time"]');
  const playBtn = q<HTMLButtonElement>('[data-action="play"]');
  const marks = q<HTMLElement>('.gs-marks');
  const read = q<HTMLElement>('.gs-read');
  const note = q<HTMLElement>('.gs-note');

  // ------------------------------------------------------------ map layers (added once, after the style is ready)
  const ensureLayers = () => {
    if (m.getSource('glof-route')) return;
    m.addSource('glof-route', { type: 'geojson', lineMetrics: true, data: EMPTY_LINE });
    m.addSource('glof-front', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const levelColor = [
      'match',
      ['get', 'level'],
      ...HAZARD_LEVELS.flatMap((l) => [l.id, l.color]),
      '#999999',
    ];
    m.addLayer({
      id: 'glof-city',
      type: 'fill',
      source: 'sz-hazard',
      filter: ['==', ['get', 'basin'], 'none'],
      paint: { 'fill-color': levelColor as ExpressionSpecification, 'fill-opacity': 0 },
    });
    m.addLayer({
      id: 'glof-channel',
      type: 'line',
      source: 'glof-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 4],
        'line-dasharray': [2, 2],
      },
    });
    m.addLayer({
      id: 'glof-flood',
      type: 'line',
      source: 'glof-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 11, 16, 26],
        'line-gradient': floodGradient(0) as ExpressionSpecification,
      },
    });
    m.addLayer({
      id: 'glof-front-halo',
      type: 'circle',
      source: 'glof-front',
      paint: { 'circle-radius': 16, 'circle-color': '#ff6a28', 'circle-opacity': 0.3, 'circle-blur': 0.6 },
    });
    m.addLayer({
      id: 'glof-front',
      type: 'circle',
      source: 'glof-front',
      paint: {
        'circle-radius': 6,
        'circle-color': '#ff6a28',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  };
  const setVisible = (on: boolean) => {
    for (const id of LAYERS)
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  };

  // ------------------------------------------------------------ choosing a lake and a scenario
  const fitRoute = () => {
    const r = route();
    if (!r) return;
    const lons = r.path.map((p) => p[0]);
    const lats = r.path.map((p) => p[1]);
    m.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        padding: { top: 60, bottom: 190, left: 60, right: 60 },
        pitch: 58,
        bearing: bearingAlong(r.path, r.lengthM / 2),
        duration: 1600,
      },
    );
  };
  const drawMarks = () => {
    const r = route();
    if (!timed() || !r) {
      marks.innerHTML =
        r && r.entranceM !== null && animated() ? mark(r.entranceM / r.lengthM, 'Ciudad') : '';
      return;
    }
    const s = SCENARIOS[scenario];
    const span = end() - start();
    const at = (sec: number) => (sec - start()) / span;
    marks.innerHTML =
      mark(at(0), s.avalancheM3 ? 'Avalancha' : 'Rotura') +
      mark(at(s.entrance.frontH * 3600), 'Ciudad') +
      (s.exit ? mark(at(s.exit.frontH * 3600), 'Río Santa') : '');
  };
  // labels near either end align inwards so they are never cut off
  const mark = (k: number, label: string) =>
    `<span class="${k < 0.12 ? 'gs-start' : k > 0.88 ? 'gs-end' : ''}" style="left:${(k * 100).toFixed(2)}%"><i></i>${esc(label)}</span>`;

  const setLake = (id: LakeId) => {
    lake = id;
    lakeSel.value = id;
    const r = route();
    (m.getSource('glof-route') as GeoJSONSource | undefined)?.setData(
      r
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: r.path.map((p) => [p[0], p[1]]) },
          }
        : EMPTY_LINE,
    );
    m.setFilter('glof-city', ['==', ['get', 'basin'], r?.entranceMap ?? 'none']);
    for (const b of strip.querySelectorAll<HTMLButtonElement>('[data-scenario]')) b.disabled = !timed();
    playBtn.disabled = !animated();
    timeInput.disabled = !animated();
    t = start();
    playing = animated();
    drawMarks();
    frame(performance.now(), true);
    if (r) fitRoute();
  };
  const setScenario = (id: ScenarioId) => {
    scenario = id;
    for (const b of strip.querySelectorAll<HTMLButtonElement>('[data-scenario]'))
      b.setAttribute('aria-pressed', String(b.dataset.scenario === id));
    t = start();
    playing = animated();
    drawMarks();
    frame(performance.now(), true);
  };

  // ------------------------------------------------------------ one frame
  const frame = (now: number, force = false) => {
    if (!open) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    const r = route();
    const L = LAKES[lake];
    if (playing && animated()) {
      const rate = timed() ? playRate(SCENARIOS[scenario], t) : 1;
      t = Math.min(end(), t + dt * speed * rate);
      if (t >= end()) playing = false;
    }
    let frontM = 0;
    let reveal = 0;
    let html = '';
    if (r && timed()) {
      const s = SCENARIOS[scenario];
      const st = stateAt(s, makeRoute(r.lengthM, r.entranceM ?? r.lengthM), t);
      frontM = st.frontM;
      reveal = cityRevealAt(s, t);
      const range = s.entrance.rangeH;
      const cityText = range
        ? `${minutes(range[0])}–${minutes(range[1])} min`
        : `${minutes(s.entrance.frontH)} min`;
      html = `<span class="gs-phase">${esc(PHASE_LABEL[st.phase])}</span>
        <span><small>Desde ${s.avalancheM3 ? 'la avalancha' : 'la rotura'}</small><b>${t < 0 ? '—' : clock(t)}</b></span>
        <span><small>Recorrido</small><b>${fmtNum(frontM / 1000, 1)} / ${fmtNum(r.lengthM / 1000, 1)} km</b></span>
        <span><small>Caudal pico en el frente</small><b>${frontM > 0 ? `${fmtNum(st.dischargeM3s)} m³/s` : '—'}</b></span>
        <span><small>Llegada a la ciudad (publicado)</small><b>${cityText}</b></span>
        <span><small>Falta para la ciudad</small><b class="${st.minutesToCity > 0 && st.minutesToCity <= WARNING.minutes ? 'gs-hot' : ''}">${t < 0 ? '—' : st.minutesToCity > 0 ? `${fmtNum(Math.ceil(st.minutesToCity))} min` : 'llegó'}</b></span>`;
    } else if (r && animated()) {
      const p = Math.min(1, t / UNTIMED_S);
      frontM = p * r.lengthM;
      const enter = r.entranceM === null ? 1 : r.entranceM / r.lengthM;
      reveal = Math.min(1, Math.max(0, (p - enter) / (1 - enter)));
      html = `<span class="gs-phase">${p < enter ? 'El aluvión baja por la quebrada' : 'El aluvión entra a la ciudad'}</span>
        <span><small>Recorrido</small><b>${fmtNum(frontM / 1000, 1)} / ${fmtNum(r.lengthM / 1000, 1)} km</b></span>
        <span><small>Tiempo</small><b>sin minutos publicados</b></span>`;
    } else {
      html = `<span class="gs-phase">${esc(L.name)}: ${esc(L.timing)}</span>`;
    }
    m.setPaintProperty(
      'glof-flood',
      'line-gradient',
      floodGradient(r && animated() ? frontM / r.lengthM : r ? 1 : 0) as ExpressionSpecification,
    );
    m.setPaintProperty('glof-flood', 'line-opacity', animated() ? 1 : 0.35);
    m.setPaintProperty('glof-city', 'fill-opacity', 0.62 * reveal);
    const front = r && animated() && frontM > 0 ? pointAlong(r.path, frontM) : null;
    (m.getSource('glof-front') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: front
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: front } }]
        : [],
    });
    if (force || read.dataset.html !== html) {
      read.innerHTML = html;
      read.dataset.html = html;
    }
    const span = end() - start();
    timeInput.value = String(Math.round(((t - start()) / span) * 1000));
    playBtn.innerHTML = playing ? '<span aria-hidden="true">❚❚</span>' : icon('play');
    playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    // the camera follows the front down the valley, looking downstream
    if (follow && front && r && playing && now - lastCam > 700) {
      lastCam = now;
      m.easeTo({
        center: front,
        bearing: bearingAlong(r.path, frontM),
        pitch: 62,
        zoom: 13.4,
        duration: 800,
      });
    }
  };
  const loop = (now: number) => {
    frame(now);
    raf = open ? requestAnimationFrame(loop) : 0;
  };

  const writeNote = () => {
    const L = LAKES[lake];
    const timingSrc = L.timingSource ? SOURCES[L.timingSource] : null;
    const scen = SCENARIOS[scenario];
    note.innerHTML = `${
      timed()
        ? `${esc(scen.note)} Fuente: ${esc(SOURCES[scen.source].label.split(',')[0]!)} (${SOURCES[scen.source].year}). Entre los puntos publicados el avance se interpola.`
        : `${esc(L.timing)}${timingSrc ? ` Fuente: ${esc(timingSrc.label.split(',')[0]!)} (${timingSrc.year}).` : ''}`
    } Alerta temprana: hasta ${WARNING.minutes} min de aviso (Gobierno Regional de Áncash, 2021). ${esc(WARNING.status)} Simulación ilustrativa, no es un modelo oficial.`;
  };

  // ------------------------------------------------------------ controls
  strip.addEventListener('click', (e) => {
    const el = e.target as Element;
    const sc = el.closest<HTMLButtonElement>('[data-scenario]');
    if (sc && !sc.disabled) {
      setScenario(sc.dataset.scenario as ScenarioId);
      writeNote();
      return;
    }
    const action = el.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'close') sim.close();
    if (action === 'play' && animated()) {
      if (t >= end()) t = start();
      playing = !playing;
      lastFrame = performance.now();
    }
  });
  lakeSel.addEventListener('change', () => {
    setLake(lakeSel.value as LakeId);
    writeNote();
  });
  speedSel.addEventListener('change', () => (speed = Number(speedSel.value)));
  followBox.addEventListener('change', () => (follow = followBox.checked));
  timeInput.addEventListener('input', () => {
    playing = false;
    t = start() + (Number(timeInput.value) / 1000) * (end() - start());
    frame(performance.now(), true);
  });
  // a person moving the map takes the camera back
  const release = (e: { originalEvent?: unknown }) => {
    if (!e.originalEvent || !open) return;
    follow = false;
    followBox.checked = false;
  };
  m.on('dragstart', release);
  m.on('rotatestart', release);
  m.on('pitchstart', release);
  m.on('wheel', release);

  const sim: GlofSim = {
    get isOpen() {
      return open;
    },
    open(id = lake) {
      deps.stopTour();
      ensureLayers();
      deps.ensure3D();
      open = true;
      strip.hidden = false;
      m.getContainer().classList.add('glof-on');
      setVisible(true);
      follow = true;
      followBox.checked = true;
      setScenario(scenario);
      setLake(id);
      writeNote();
      lastFrame = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      deps.onToggle();
    },
    close() {
      open = false;
      playing = false;
      cancelAnimationFrame(raf);
      raf = 0;
      strip.hidden = true;
      m.getContainer().classList.remove('glof-on');
      if (m.getLayer('glof-flood')) setVisible(false);
      deps.onToggle();
    },
    destroy() {
      sim.close();
      m.off('dragstart', release);
      m.off('rotatestart', release);
      m.off('pitchstart', release);
      m.off('wheel', release);
      strip.remove();
    },
  };
  return sim;
}
