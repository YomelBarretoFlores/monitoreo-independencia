// The studio around the valley: a pale backdrop, haze in the distance, a low sun from the north-west so
// the relief reads as on a printed map, soft shadows from the ridges. frame(state, cam) poses the world
// and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {createWorld, DEPTH, loadElevation, WIDTH} from './world.js';

export const COL = {bg: '#efeae1', fog: '#efeae1'};
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();

export async function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.fog, 30, 70);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 200);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight('#f6f3ee', '#b9ab8e', 1.25));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.castShadow = true;
  const ext = Math.max(WIDTH, DEPTH) * 0.62;
  Object.assign(sun.shadow.camera, {left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 90});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const elev = await loadElevation();
  const world = createWorld(scene, elev);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  /** cam: {tx, ty, tz, az, el (radians), d (km), sx, sy (screen shift, px)} */
  const frame = (state, cam) => {
    world.update(state);
    // raise the camera until neither it nor its line of sight passes through a ridge
    let el = cam.el;
    const at = (e, k) => [
      cam.tx + k * cam.d * Math.cos(e) * Math.sin(cam.az),
      cam.ty + k * cam.d * Math.sin(e),
      cam.tz + k * cam.d * Math.cos(e) * Math.cos(cam.az),
    ];
    const blocked = (e) => [0.3, 0.45, 0.6, 0.75, 0.9, 1].some((k) => {
      const [x, y, z] = at(e, k);
      return y < world.groundY(x, z) + 0.12 * k;
    });
    for (let i = 0; i < 24 && el < 1.45 && blocked(el); i++) el += 0.04;
    camera.position.set(...at(el, 1));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    composer.render();
  };

  const pv = new THREE.Vector3();
  /** World point → CSS px, or null when behind the camera */
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };

  const setQuality = ({samples, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };

  return {renderer, scene, camera, composer, world, resize, frame, project, size, setQuality};
}
