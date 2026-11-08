// The film: the tour script (script.js) rendered as a pure function of t, large scenario, under the console.
import {runSim} from 'teardown-kit/runtime.js';
import {createConsole} from './console.js';
import {makeRoute, SCENARIOS, stateAt} from './model.js';
import {camAt, DURATION, easedLayer, layersAt, tauAt, viewAt} from './script.js';
import {createStage} from './stage.js';

export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'palcacocha', subtitle: ''}, director: {enabled: false}, watermark: ''};
const SCENARIO = SCENARIOS.grande;

/** Everything one frame of the tour shows, at film time t */
export function tourFrame(t, world, route) {
  const tau = tauAt(t);
  const state = stateAt(SCENARIO, route, tau);
  return {
    tau,
    state,
    pose: {tau, frontM: state.frontM, impactS: SCENARIO.impactS, hazard: easedLayer('hazard', t), safe: easedLayer('safe', t)},
    cam: camAt(t, world, state),
    view: viewAt(t)[1],
    layers: layersAt(t).on,
    labels: easedLayer('labels', t),
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = await createStage({canvas});
    const route = makeRoute(st.world.lengthM, st.world.entranceM);
    st.world.shapeRibbon(SCENARIO, route);
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'), st.world);
    const end = SCENARIO.exit.frontH * 3600 + 600;
    return {
      resize,
      render(t) {
        const f = tourFrame(t, st.world, route);
        st.frame(f.pose, f.cam);
        ui.update({scenario: SCENARIO, route, state: f.state, end, view: f.view, layers: f.layers, labels: f.labels, paused: false, speedK: 0.5, speedLabel: 'RECORRIDO'}, st.project);
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
