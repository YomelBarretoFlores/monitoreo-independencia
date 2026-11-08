// The console around the valley, laid out at 1600 x 900, in Spanish: the scenario and its published figures,
// the flood front, the early warning, the people exposed, the views, the layers, the timeline, and labels with
// leaders into the 3D scene. update(f) redraws every live part from the frame's state, so every number on screen
// comes from the same model that moves the flood.
import {esc, fmtNum} from '../../src/lib/format.ts';
import {EXPOSED, HISTORY_1941, LAKE, PHASE_LABEL, SCENARIOS, SOURCES, WARNING, dischargeAt} from './model.js';
import {LAYER_LABEL, LAYERS, VIEW_LABEL, VIEWS} from './script.js';

export const C = {ink: '#2a2521', mute: '#8c8174', faint: '#d9cdbb', line: '#e6dccb', panel: 'rgba(252,250,246,.94)', or: '#e3562a', green: '#2fa36b', blue: '#3c79a8', red: '#c62a1e'};
export const SCENARIO_IDS = ['grande', 'mediano', 'pequeno'];

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 12px rgba(90,70,40,.08)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.ph i{display:block;width:3px;height:13px;background:${C.or}}
.pn{position:absolute;font:500 9.5px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.rw{position:absolute;display:flex;justify-content:space-between;align-items:baseline;width:254px}
.rw b{font:700 13px Inter,sans-serif}
.bt{position:absolute;height:23px;padding:0 9px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fffdf9;font:700 9.2px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.bt.on{background:${C.ink};border-color:${C.ink};color:#fff}
.lb{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform}
.lb b{display:flex;align-items:center;gap:6px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.ink};background:rgba(252,250,246,.88);padding:3px 6px;border-radius:3px}
.lb b i{display:block;width:6px;height:6px;border-radius:50%;background:${C.ink}}
.lb span{display:block;font:500 8.6px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.mute};margin:2px 0 0 6px}
.lb.hot b{background:${C.or};color:#fff}
.lb.hot b i{background:#fff}
.note{font:500 9.6px/1.55 Inter,sans-serif;color:#5f564b}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const num = (n, d = 0) => fmtNum(n, d);
const m3 = (v) => `${num(v / 1e6, 1)} M m³`;
export const clock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
};

export function createConsole(app, world) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };
  const btn = {};
  const spots = {};
  const button = (key, x, y, w, label) => {
    btn[key] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:${w}px">${label}</div>`);
    spots[key] = [x + w / 2, y + 11];
  };

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:1600px;height:96px;background:rgba(239,234,225,.9)"></div>`);
  add(`<div style="position:absolute;left:0;top:872px;width:1600px;height:28px;background:rgba(239,234,225,.9)"></div>`);
  add(`<div style="position:absolute;left:0;top:0;width:118px;height:89px;background:${C.or}"></div>`);
  add(`<svg style="position:absolute;left:30px;top:27px" width="58" height="34" viewBox="0 0 58 34"><path d="M2 30 L16 8 L24 18 L33 4 L56 30 Z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M2 30c6-5 10-5 16 0s10 5 16 0 10-5 16 0" fill="none" stroke="#fff" stroke-width="2.4"/></svg>`);
  add(`<div class="sm" style="position:absolute;left:140px;top:20px;letter-spacing:2.4px">CORDILLERA BLANCA · ÁNCASH</div>`);
  add(`<div style="position:absolute;left:139px;top:35px;font-size:31px;font-weight:700;letter-spacing:-.6px;line-height:1">Aluvión de la laguna Palcacocha <span style="color:${C.or};font-weight:400">/</span></div>`);
  add(`<div class="mo" style="position:absolute;left:140px;top:74px;font-size:10.6px;letter-spacing:2px;color:#6d6357">QUEBRADA COJUP → RÍO QUILLCAY → HUARAZ E INDEPENDENCIA</div>`);
  add(`<div style="position:absolute;right:28px;top:22px;text-align:right"><div class="sm" style="letter-spacing:2.2px">SIMULACIÓN ILUSTRATIVA</div><div style="font-size:12.5px;font-weight:600;margin-top:5px">No es un modelo oficial</div><div class="sm" style="margin-top:5px">CIFRAS DE ESTUDIOS PUBLICADOS</div></div>`);

  // ------------------------------------------------------------ 01 scenario
  panel(28, 116, 282, 262, 'ESCENARIO', '01');
  add(`<div style="position:absolute;left:42px;top:150px;width:254px;height:29px;border-radius:5px;background:#efe6d8"></div>`);
  SCENARIO_IDS.forEach((id, i) => {
    btn[id] = add(`<div class="bt" style="left:${45 + i * 83}px;top:153px;width:82px;border:none;background:transparent">${SCENARIOS[id].label.toUpperCase()}</div>`);
    spots[id] = [45 + i * 83 + 41, 164];
  });
  const scRows = ['Avalancha de hielo', 'Ola en la laguna', 'Ola sobre el dique', 'Caudal pico en el dique', 'Área inundada en Huaraz'].map((n, i) => {
    const y = 194 + i * 28;
    const r = add(`<div class="rw" style="left:42px;top:${y}px"><span class="sm">${n}</span><b></b></div>`);
    return r.querySelector('b');
  });
  add(`<div class="sm" style="position:absolute;left:42px;top:342px;text-transform:none;letter-spacing:.6px">Somos-Valenzuela et al. (2016), tabla 6</div>`);
  add(`<div class="sm" style="position:absolute;left:42px;top:356px;text-transform:none;letter-spacing:.4px">Laguna: ${m3(LAKE.volumeM3)}, ${num(LAKE.maxDepthM, 1)} m de fondo (ANA 2016)</div>`);

  // ------------------------------------------------------------ 02 flood front
  panel(28, 392, 282, 316, 'FRENTE DEL ALUVIÓN', '02');
  const chip = add(`<div style="position:absolute;left:42px;top:430px;width:11px;height:22px;border-radius:2px"></div>`);
  const phase = add(`<div style="position:absolute;left:62px;top:428px;width:240px;font-size:13.5px;font-weight:600;line-height:1.15"></div>`);
  add(`<div style="position:absolute;left:42px;top:466px;width:254px;height:1px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:42px;top:478px">TIEMPO DESDE LA AVALANCHA</div>`);
  const since = add(`<div style="position:absolute;left:42px;top:492px;font-size:30px;font-weight:700;letter-spacing:-.6px"></div>`);
  const bars = ['RECORRIDO', 'CAUDAL PICO'].map((n, i) => {
    const y = 540 + i * 30;
    add(`<div class="sm" style="position:absolute;left:42px;top:${y}px">${n}</div>`);
    add(`<div style="position:absolute;left:42px;top:${y + 15}px;width:254px;height:4px;background:#efe6d8;border-radius:2px"></div>`);
    const f = add(`<div style="position:absolute;left:42px;top:${y + 15}px;height:4px;background:${C.or};border-radius:2px"></div>`);
    const v = add(`<div class="mo" style="position:absolute;right:${1600 - 296}px;top:${y - 2}px;font-size:11px;font-weight:700"></div>`);
    return {f, v};
  });
  add(`<div class="sm" style="position:absolute;left:42px;top:604px">CAUDAL PICO A LO LARGO DEL CAUCE</div>`);
  const chart = add(`<svg style="position:absolute;left:42px;top:618px" width="254" height="80"></svg>`);

  // ------------------------------------------------------------ 03 early warning
  panel(1290, 116, 282, 236, 'ALERTA TEMPRANA', '03');
  const wBig = add(`<div style="position:absolute;left:1304px;top:150px;font-size:40px;font-weight:700;letter-spacing:-1px;line-height:1"></div>`);
  const wSub = add(`<div style="position:absolute;left:1304px;top:196px;width:254px;font-size:12px;font-weight:600;line-height:1.3"></div>`);
  add(`<div style="position:absolute;left:1304px;top:232px;width:254px;height:1px;background:${C.line}"></div>`);
  add(`<div class="note" style="position:absolute;left:1304px;top:240px;width:254px">El sistema de alerta temprana regional da hasta <b>${WARNING.minutes} min</b> de aviso (Gobierno Regional de Áncash, 2021).</div>`);
  add(`<div class="note" style="position:absolute;left:1304px;top:286px;width:254px;color:${C.red}"><b>Estado:</b> ${esc(WARNING.status)}</div>`);

  // ------------------------------------------------------------ 04 exposure
  panel(1290, 366, 282, 168, 'POBLACIÓN EXPUESTA', '04');
  [['Independencia', EXPOSED.independencia], ['Huaraz', EXPOSED.huaraz], ['Total', EXPOSED.total]].forEach(([n, v], i) => {
    const y = 398 + i * 22;
    add(`<div class="rw" style="left:1304px;top:${y}px"><span class="sm">${n.toUpperCase()}</span><b style="${i === 0 ? `color:${C.or}` : ''}">${num(v)} personas</b></div>`);
  });
  add(`<div class="sm" style="position:absolute;left:1304px;top:466px;text-transform:none;letter-spacing:.4px">En el cono de inundación (INDECI, 2015)</div>`);
  add(`<div class="note" style="position:absolute;left:1304px;top:482px;width:254px">El ${HISTORY_1941.date} un aluvión de esta laguna causó ${HISTORY_1941.deaths} víctimas y destruyó ${HISTORY_1941.cityDestroyed}.</div>`);

  // ------------------------------------------------------------ 05 views, 06 layers
  panel(1290, 548, 282, 84, 'VISTAS', '05');
  VIEWS.forEach((v, i) => button(v, 1304 + i * 64, 586, 60, VIEW_LABEL[v]));
  panel(1290, 646, 282, 112, 'CAPAS', '06');
  [[0, 0, 132], [1, 138, 116], [2, 0, 96], [3, 102, 76]].forEach(([i, dx, w]) => button(LAYERS[i], 1304 + dx, i < 2 ? 684 : 715, w, LAYER_LABEL[LAYERS[i]]));

  // ------------------------------------------------------------ 07 timeline
  panel(340, 772, 920, 96, 'LÍNEA DE TIEMPO', '07');
  btn.play = add(`<div class="bt" style="left:356px;top:806px;width:44px;height:44px;border-radius:50%;border:none;background:${C.or};color:#fff;font-size:15px"></div>`);
  spots.play = [378, 828];
  const TL = {x: 420, w: 690};
  add(`<div style="position:absolute;left:${TL.x}px;top:826px;width:${TL.w}px;height:3px;background:#efe6d8;border-radius:2px"></div>`);
  const tlFill = add(`<div style="position:absolute;left:${TL.x}px;top:826px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const tlKnob = add(`<div style="position:absolute;top:820px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const ticks = add(`<div style="position:absolute;inset:0"></div>`);
  const tlTime = add(`<div class="mo" style="position:absolute;left:418px;top:842px;font-size:9.6px;color:${C.mute};letter-spacing:1px"></div>`);
  add(`<div class="sm" style="position:absolute;left:1130px;top:806px">VELOCIDAD</div>`);
  const SP = {x: 1132, w: 92};
  add(`<div style="position:absolute;left:${SP.x}px;top:829px;width:${SP.w}px;height:3px;background:#efe6d8;border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:823px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const spVal = add(`<div class="mo" style="position:absolute;left:1132px;top:842px;font-size:9.6px;font-weight:700"></div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:27px;top:882px;letter-spacing:1.8px">SIMULACIÓN ILUSTRATIVA · NO ES UN MODELO OFICIAL · ENTRE LAS SECCIONES PUBLICADAS EL AVANCE SE INTERPOLA</div>`);
  btn.sources = add(`<div class="bt" style="left:1452px;top:874px;width:120px;height:21px">FUENTES ↗</div>`);
  spots.sources = [1512, 884];

  // ------------------------------------------------------------ labels into the scene
  const at = (lon, lat) => world.point(lon, lat, 0.05);
  const pathPt = (m) => world.pathAt(m).add({x: 0, y: 0.05, z: 0});
  const LABELS = [
    {id: 'lake', p: world.lakeCentre.clone().setY(world.lakeCentre.y + 0.05), name: 'LAGUNA PALCACOCHA', sub: `${m3(LAKE.volumeM3)} · ${num(LAKE.altitudeM)} m`},
    {id: 'cojup', p: pathPt(6500), name: 'QUEBRADA COJUP'},
    {id: 'indep', p: at(-77.521, -9.512), name: 'INDEPENDENCIA'},
    {id: 'huaraz', p: at(-77.53, -9.536), name: 'HUARAZ'},
    {id: 'santa', p: at(-77.5375, -9.503), name: 'RÍO SANTA'},
    {id: 'front', p: null, name: 'FRENTE DEL ALUVIÓN', hot: true},
  ];
  for (const l of LABELS) l.node = add(`<div class="lb${l.hot ? ' hot' : ''}"><b><i></i>${l.name}</b>${l.sub || l.hot ? `<span>${l.sub ?? ''}</span>` : ''}</div>`);

  // ------------------------------------------------------------ live parts
  let lastScenario = null;
  const drawChart = (sc, route, frontM) => {
    const W = 254;
    const H = 80;
    const lo = Math.log10(2);
    const hi = Math.log10(80000);
    const y = (q) => H - 6 - ((Math.log10(q) - lo) / (hi - lo)) * (H - 14);
    const x = (d) => (d / route.lengthM) * W;
    let p = '';
    for (let i = 0; i <= 60; i++) {
      const d = (i / 60) * route.lengthM;
      p += `${i ? 'L' : 'M'}${x(d).toFixed(1)} ${y(dischargeAt(sc, route, d)).toFixed(1)}`;
    }
    const fx = x(frontM);
    const ex = x(route.entranceM);
    chart.innerHTML = `<path d="M0 ${H - 6}H${W}" stroke="${C.faint}"/>
      <path d="M${ex} 4V${H - 6}" stroke="${C.mute}" stroke-dasharray="2 3"/>
      <text x="${ex - 4}" y="12" text-anchor="end" font-family="JetBrains Mono" font-size="8" fill="${C.mute}">CIUDAD</text>
      <path d="${p}" fill="none" stroke="${C.faint}" stroke-width="2"/>
      <clipPath id="cl"><rect x="0" y="0" width="${fx}" height="${H}"/></clipPath>
      <path d="${p}" fill="none" stroke="${C.or}" stroke-width="2" clip-path="url(#cl)"/>
      <circle cx="${fx}" cy="${y(dischargeAt(sc, route, frontM))}" r="3.5" fill="${C.or}"/>
      <text x="0" y="${H}" font-family="JetBrains Mono" font-size="8" fill="${C.mute}">LAGUNA</text>
      <text x="${W}" y="${H}" text-anchor="end" font-family="JetBrains Mono" font-size="8" fill="${C.mute}">${num(route.lengthM / 1000, 1)} km</text>`;
  };
  const drawTicks = (sc, end) => {
    const marks = [
      [0, 'AVALANCHA'],
      [sc.entrance.frontH * 3600, `CIUDAD · ${clock(sc.entrance.frontH * 3600)}`],
      [sc.exit.frontH * 3600, `RÍO SANTA · ${clock(sc.exit.frontH * 3600)}`],
    ];
    ticks.innerHTML = marks
      .map(([t, n]) => {
        const x = TL.x + (t / end) * TL.w;
        return `<div style="position:absolute;left:${x}px;top:810px;width:1px;height:10px;background:${C.mute}"></div><div class="sm" style="position:absolute;left:${x}px;top:799px;transform:translateX(-50%);font-size:8.4px">${n}</div>`;
      })
      .join('');
  };

  /**
   * f: {scenario, route, state (stateAt), end (timeline length s), view, layers {k: 0/1}, labels 0..1,
   *     paused, speedK 0..1, speedLabel}
   */
  const update = (f, project) => {
    const sc = f.scenario;
    if (lastScenario !== sc.id) {
      lastScenario = sc.id;
      scRows[0].textContent = m3(sc.avalancheM3);
      scRows[1].textContent = `${num(sc.waveM, 1)} m`;
      scRows[2].textContent = `${num(sc.overtopM, 1)} m`;
      scRows[3].textContent = `${num(sc.overtopPeakM3s)} m³/s`;
      scRows[4].textContent = sc.floodKm2 === null ? 'no publicado' : `${num(sc.floodKm2, 1)} km²`;
      for (const id of SCENARIO_IDS) {
        btn[id].style.background = id === sc.id ? C.ink : 'transparent';
        btn[id].style.color = id === sc.id ? '#fff' : C.ink;
      }
      drawTicks(sc, f.end);
    }
    const s = f.state;
    const color = {calma: C.green, avalancha: C.blue, quebrada: C.or, ciudad: C.red, santa: C.red}[s.phase];
    chip.style.background = color;
    phase.textContent = PHASE_LABEL[s.phase];
    since.textContent = s.t < 0 ? '—' : clock(s.t);
    bars[0].f.style.width = `${254 * s.progress}px`;
    bars[0].v.textContent = `${num(s.frontM / 1000, 1)} / ${num(f.route.lengthM / 1000, 1)} km`;
    const qk = s.frontM > 0 ? Math.log10(s.dischargeM3s) / Math.log10(sc.overtopPeakM3s) : 0;
    bars[1].f.style.width = `${254 * Math.max(0, qk)}px`;
    bars[1].v.textContent = s.frontM > 0 ? `${num(s.dischargeM3s)} m³/s` : '—';
    drawChart(sc, f.route, s.frontM);

    if (s.t < 0) {
      wBig.textContent = '—';
      wSub.textContent = 'Sin avalancha. Los sensores de la laguna vigilan el nivel del agua.';
      wBig.style.color = C.ink;
    } else if (s.minutesToCity > 0) {
      wBig.textContent = `${num(Math.ceil(s.minutesToCity))} min`;
      wSub.textContent = 'para que el frente llegue a la ciudad, según el escenario.';
      wBig.style.color = s.minutesToCity <= WARNING.minutes ? C.red : C.or;
    } else {
      wBig.textContent = 'Llegó';
      wSub.textContent = 'El frente del aluvión ya entró a Huaraz e Independencia.';
      wBig.style.color = C.red;
    }

    for (const v of VIEWS) btn[v].classList.toggle('on', v === f.view);
    for (const k of LAYERS) btn[k].classList.toggle('on', !!f.layers[k]);
    btn.play.textContent = f.paused ? '▶' : '❚❚';
    const k = Math.min(1, Math.max(0, s.t / f.end));
    tlFill.style.width = `${TL.w * k}px`;
    tlKnob.style.left = `${TL.x + TL.w * k}px`;
    tlTime.textContent = s.t < 0 ? 'ANTES DE LA AVALANCHA' : `${clock(s.t)} DESDE LA AVALANCHA`;
    spKnob.style.left = `${SP.x + SP.w * (f.speedK ?? 0.5)}px`;
    spVal.textContent = f.speedLabel ?? '';

    // labels follow their points; the front label rides the front
    const front = LABELS[LABELS.length - 1];
    front.p = s.t > sc.impactS ? world.pathAt(s.frontM).add({x: 0, y: 0.6, z: 0}) : null;
    if (front.p) front.node.querySelector('span').textContent = `${num(s.dischargeM3s)} m³/s`;
    for (const l of LABELS) {
      const q = l.p && project(l.p);
      const show = q && q[0] > 330 && q[0] < 1270 && q[1] > 100 && q[1] < 760;
      const a = show ? (l.hot ? 1 : f.labels) : 0;
      l.node.style.opacity = a;
      if (show) l.node.style.transform = `translate(${q[0] - 6}px, ${q[1] - 10}px)`;
    }
  };

  return {root: ui, btn, spots, TL, SP, update};
}

/** The sources overlay of the live page */
export function sourcesHtml() {
  return Object.values(SOURCES)
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a> <span>(${s.year})</span></li>`)
    .join('');
}
