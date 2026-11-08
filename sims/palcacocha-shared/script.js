// The camera views and the tour: a pure function of film time t. The live page plays the same script as its
// auto tour, so the film and the page tell the story the same way.
import {SCENARIOS} from './model.js';

const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;

export const VIEWS = ['general', 'laguna', 'frente', 'ciudad'];
export const VIEW_LABEL = {general: 'VALLE', laguna: 'LAGUNA', frente: 'FRENTE', ciudad: 'CIUDAD'};
export const LAYERS = ['hazard', 'safe', 'labels', 'orbit'];
export const LAYER_LABEL = {hazard: 'MAPA DE PELIGRO', safe: 'ZONAS SEGURAS', labels: 'ETIQUETAS', orbit: 'ÓRBITA'};

/** Camera for a view, in degrees and km; `w` is the world, `s` the frame state (for the front) */
export function viewCam(view, w, s) {
  const mid = w.pathAt(w.lengthM * 0.5);
  const city = w.pathAt((w.entranceM + w.lengthM) / 2);
  switch (view) {
    case 'laguna':
      // from down the valley: the lake in front, the summit the avalanche falls from behind it
      return {tx: (w.source.x + w.lakeCentre.x * 2) / 3, ty: w.lakeCentre.y + 0.2, tz: (w.source.z + w.lakeCentre.z * 2) / 3, az: -35, el: 50, d: 6.5};
    case 'frente': {
      const f = w.pathAt(Math.max(400, s.frontM));
      return {tx: f.x, ty: f.y, tz: f.z, az: -55, el: 46, d: 5.5};
    }
    case 'ciudad':
      return {tx: city.x + 0.4, ty: city.y, tz: city.z - 0.2, az: -60, el: 50, d: 7.5};
    default:
      return {tx: mid.x, ty: mid.y, tz: mid.z, az: -40, el: 42, d: 27};
  }
}

const SC = SCENARIOS.grande;
const T_IN = SC.entrance.frontH * 3600;
const T_OUT = SC.exit.frontH * 3600;
/** Film time → event time (s since the avalanche), large scenario */
const TAU = [
  [0, -24],
  [5, -2],
  [9.5, SC.impactS],
  [13, 95],
  [30, T_IN],
  [42, T_OUT],
  [50, T_OUT + 600],
];
export const DURATION = 56;
export const tauAt = (t) => {
  if (t <= TAU[0][0]) return TAU[0][1];
  for (let i = 1; i < TAU.length; i++) {
    const [t0, v0] = TAU[i - 1];
    const [t1, v1] = TAU[i];
    if (t <= t1) return lerp(v0, v1, (t - t0) / (t1 - t0));
  }
  return TAU[TAU.length - 1][1];
};

/** [start, view] cuts; the camera eases between them */
export const CUTS = [
  [0, 'general'],
  [4.2, 'laguna'],
  [13.2, 'frente'],
  [29.4, 'ciudad'],
  [43.5, 'general'],
];
export const viewAt = (t) => CUTS.filter(([a]) => a <= t).pop();

/** Layer toggles over the film: [time, layer, on] */
const TOGGLES = [
  [0, 'labels', 1],
  [30.2, 'hazard', 1],
  [36.5, 'safe', 1],
  [44.5, 'orbit', 1],
];
export const layersAt = (t) => {
  const on = {hazard: 0, safe: 0, labels: 0, orbit: 0};
  const since = {hazard: -9, safe: -9, labels: -9, orbit: -9};
  for (const [at, k, v] of TOGGLES)
    if (at <= t) {
      on[k] = v;
      since[k] = at;
    }
  return {on, since};
};
export const easedLayer = (k, t, dur = 0.9) => {
  const {on, since} = layersAt(t);
  const x = ss(since[k], since[k] + dur, t);
  return on[k] ? x : 1 - x;
};

/** Film camera: eased from the previous cut's view to the current one, plus a slow drift */
export function camAt(t, w, s) {
  const i = CUTS.findIndex(([a]) => a > t);
  const k = i === -1 ? CUTS.length - 1 : i - 1;
  const [t0, v] = CUTS[k];
  const prev = k > 0 ? CUTS[k - 1][1] : v;
  const a = viewCam(prev, w, s);
  const b = viewCam(v, w, s);
  const e = ss(t0, t0 + 2.4, t);
  const c = {};
  for (const key of Object.keys(b)) c[key] = lerp(a[key], b[key], e);
  c.az += (t - t0) * 0.9 + easedLayer('orbit', t) * (t - 44.5) * 3;
  return {...c, az: c.az * D2R, el: c.el * D2R};
}
