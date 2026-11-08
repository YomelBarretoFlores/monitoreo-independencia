// The valley as a page you drive. The three scenario buttons restart the event, the play button pauses it, the
// timeline scrubs it, VELOCIDAD sets its pace. There are four views, four layers, an orbit you drag and a zoom on the
// wheel. Left alone it plays the film's script as an auto tour; a click, drag, wheel or key hands control to the
// visitor, and 25 s of quiet hands it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {C, createConsole, SCENARIO_IDS, sourcesHtml} from './console.js';
import {tourFrame} from './film.js';
import {makeRoute, SCENARIOS, stateAt} from './model.js';
import {DURATION, LAYERS, viewAt, viewCam, VIEWS} from './script.js';
import {COL, createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const START = -20;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const SPEED = [0.25, 4];

const CSS = `
html,body{background:${COL.bg};overflow:hidden;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.bt{pointer-events:auto;cursor:pointer}
.bt:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:108px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 11px;border:1px solid ${C.line};border-radius:4px;background:rgba(252,250,246,.95);color:${C.ink};font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.2px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:${C.or}}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.srcs{position:absolute;right:28px;bottom:36px;width:560px;max-height:520px;overflow:auto;padding:18px 20px;background:rgba(252,250,246,.98);border:1px solid ${C.line};border-radius:6px;box-shadow:0 6px 30px rgba(60,40,20,.18);pointer-events:auto;font:13px/1.5 Inter,sans-serif;color:${C.ink}}
.srcs h4{margin:0 0 4px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.srcs p{margin:0 0 10px;color:#5f564b;font-size:12px}
.srcs ol{margin:0;padding-left:18px}
.srcs li{margin:0 0 7px}
.srcs a{color:${C.ink}}
.srcs li span{color:${C.mute}}
.srcs .x{position:absolute;right:12px;top:10px;cursor:pointer;font:700 14px Inter,sans-serif;color:${C.mute}}
.msg{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:600 13px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;text-align:center;padding:0 16px}
.turn{position:fixed;left:0;right:0;bottom:12px;text-align:center;font:600 11px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.mute};text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export async function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.documentElement.lang = 'es';
  document.title = 'Aluvión de la laguna Palcacocha · simulación 3D';
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = 'Cargando el relieve del valle…';
  document.body.appendChild(msg);

  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  let st;
  try {
    st = await createStage({canvas});
  } catch (err) {
    msg.textContent = 'No se pudo cargar la simulación. Recarga la página.';
    console.error(err);
    return;
  }
  msg.remove();
  const ui = createConsole(app, st.world);
  const routeOf = () => makeRoute(st.world.lengthM, st.world.entranceM);
  const route = routeOf();

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 4, shadow: 4096, pr: 2},
    {samples: 2, shadow: 2048, pr: 1.5},
    {samples: 0, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr: _pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx) => (cx - app.getBoundingClientRect().left) / scale;
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Gira el teléfono para ver la consola completa';
  document.body.appendChild(note);
  const srcs = document.createElement('div');
  srcs.className = 'srcs';
  srcs.hidden = true;
  srcs.innerHTML = `<span class="x" role="button" aria-label="Cerrar">✕</span><h4>FUENTES</h4>
    <p>Simulación ilustrativa preparada como propuesta; no es un modelo oficial. Los tiempos y caudales en la presa, la entrada y la salida de la ciudad son los publicados; entre esos puntos el avance se interpola.</p>
    <ol>${sourcesHtml()}</ol>`;
  ui.root.appendChild(srcs);
  srcs.querySelector('.x').addEventListener('click', () => (srcs.hidden = true));

  // ------------------------------------------------------------ state
  let T = 0;
  let scenario = SCENARIOS.grande;
  let tau = START;
  let speed = 1;
  let paused = false;
  let view = 'general';
  const layer = Object.fromEntries(LAYERS.map((k) => [k, {on: k === 'labels' ? 1 : 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  const eased = (k, dur = 0.8) => {
    const d = layer[k];
    const x = ss(d.t, d.t + dur, T);
    return d.on ? x : 1 - x;
  };
  const endOf = (sc) => sc.exit.frontH * 3600 + 600;
  /** Event seconds per real second: slow through the avalanche and the wave, then the whole run in about 70 s */
  const rateAt = (sc, x) => {
    const fast = (sc.exit.frontH * 3600) / 70;
    return 2.5 + (fast - 2.5) * ss(sc.impactS + 40, sc.impactS + 220, x);
  };
  const setScenario = (id) => {
    scenario = SCENARIOS[id];
    st.world.shapeRibbon(scenario, route);
  };
  setScenario('grande');

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    paused = false;
    speed = 1;
    if (scenario.id !== 'grande') setScenario('grande');
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const f = tourFrame((T - AP.t0) % DURATION, st.world, route);
    tau = f.tau;
    view = f.view;
    for (const k of LAYERS) if (layer[k].on !== f.layers[k]) layer[k] = {on: f.layers[k], t: T - 1};
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });

  // ------------------------------------------------------------ controls
  for (const id of SCENARIO_IDS)
    ui.btn[id].addEventListener('click', () => {
      takeOver();
      setScenario(id);
      tau = START;
      paused = false;
    });
  for (const v of VIEWS)
    ui.btn[v].addEventListener('click', () => {
      takeOver();
      view = v;
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  for (const k of LAYERS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      layer[k] = {on: layer[k].on ? 0 : 1, t: T};
    });
  ui.btn.play.addEventListener('click', () => {
    takeOver();
    if (tau >= endOf(scenario) - 1) tau = START;
    paused = !paused;
  });
  ui.btn.sources.addEventListener('click', () => {
    takeOver();
    srcs.hidden = !srcs.hidden;
  });
  const slider = (x0, w, y, apply) => {
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x0 - 8}px`, top: `${y - 11}px`, width: `${w + 16}px`, height: '22px'});
    const move = (e) => {
      apply(clamp((toStage(e.clientX) - x0) / w, 0, 1));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider(ui.TL.x, ui.TL.w, 827, (k) => {
    tau = k * endOf(scenario);
    paused = true;
  });
  const speedOf = (k) => SPEED[0] * Math.pow(SPEED[1] / SPEED[0], k);
  const speedK = (v) => Math.log(v / SPEED[0]) / Math.log(SPEED[1] / SPEED[0]);
  slider(ui.SP.x, ui.SP.w, 830, (k) => (speed = speedOf(k)));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = {1: 'general', 2: 'laguna', 3: 'frente', 4: 'ciudad'}[key];
    if (v) ui.btn[v].click();
    else if (key === ' ') ui.btn.play.click();
    else if (key === 'p') ui.btn.hazard.click();
    else if (key === 'z') ui.btn.safe.click();
    else if (key === 'escape') srcs.hidden = true;
    else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az -= ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 40);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.35, 2.5);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    // step down a quality tier when frames run slow
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.024 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let f;
    let tgt;
    if (AP.on) {
      const cyc = (T - AP.t0) % DURATION;
      f = tourFrame(cyc, st.world, route);
      tau = f.tau;
      view = viewAt(cyc)[1];
      tgt = {...f.cam, az: f.cam.az / D2R, el: f.cam.el / D2R};
    } else {
      if (T - lastInput > IDLE) startTour();
      const end = endOf(scenario);
      if (!paused) {
        tau = Math.min(end, tau + dt * speed * rateAt(scenario, tau));
        if (tau >= end) paused = true;
      }
      const state = stateAt(scenario, route, tau);
      f = {
        tau,
        state,
        pose: {tau, frontM: state.frontM, impactS: scenario.impactS, hazard: eased('hazard'), safe: eased('safe')},
        layers: Object.fromEntries(LAYERS.map((k) => [k, layer[k].on])),
        labels: eased('labels', 0.5),
      };
      tgt = viewCam(view, st.world, state);
      tgt.az += off.az + (layer.orbit.on ? 6 * (T - layer.orbit.t) : 0);
      tgt.el = clamp(tgt.el + off.el, 12, 85);
      tgt.d *= off.k;
    }
    if (!cam) cam = {...tgt};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.15 : 0.4));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd']) cam[key] += (tgt[key] - cam[key]) * k;
    st.frame(f.pose, {...cam, az: cam.az * D2R, el: cam.el * D2R});
    const sc = AP.on ? SCENARIOS.grande : scenario;
    ui.update(
      {
        scenario: sc,
        route,
        state: f.state,
        end: endOf(sc),
        view,
        layers: f.layers,
        labels: f.labels,
        paused: AP.on ? false : paused,
        speedK: speedK(AP.on ? 1 : speed),
        speedLabel: `×${(AP.on ? 1 : speed).toLocaleString('es-PE', {maximumFractionDigits: 2})}`,
      },
      st.project,
    );
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>RECORRIDO AUTOMÁTICO · TOCA PARA TOMAR EL CONTROL' : '▶ VOLVER AL RECORRIDO';
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, startTour, takeOver, get tier() {
    return tier;
  }};
}
