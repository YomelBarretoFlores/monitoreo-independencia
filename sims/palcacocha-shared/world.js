// The valley from Laguna Palcacocha to the río Santa, built from real elevations (elevation.glb,
// terrain.json from scripts/sim/terrain.py). One scene unit is one kilometre. The terrain is
// exaggerated vertically so the 1 500 m drop reads at a glance. Every pose is a function of the
// state the scenario model gives (src/lib/palcacocha.ts): the flood front distance, the time, and
// the scenario's discharge profile.
import * as THREE from 'three';
import ELEVATION from './elevation.glb';
import TERRAIN from './terrain.json';
import {dischargeAt, HAZARD_COLORS} from './model.js';

export const EXAG = 1.6;
const BASE_M = 2800;
const [WEST, SOUTH, EAST, NORTH] = TERRAIN.bounds;
const LON0 = (WEST + EAST) / 2;
const LAT0 = (SOUTH + NORTH) / 2;
const KM_LON = 109.8;
const KM_LAT = 110.6;
export const COLS = TERRAIN.cols;
export const ROWS = TERRAIN.rows;
export const WIDTH = (EAST - WEST) * KM_LON;
export const DEPTH = (NORTH - SOUTH) * KM_LAT;

/** lon/lat → scene x (east), z (south), km */
export const toXZ = (lon, lat) => [(lon - LON0) * KM_LON, -(lat - LAT0) * KM_LAT];
export const yOf = (m) => ((m - BASE_M) / 1000) * EXAG;

/** Decode the elevation grid: inline base64 (film) or a file next to the page (live). */
export async function loadElevation() {
  let buf;
  if (ELEVATION.startsWith('url:')) {
    const res = await fetch(ELEVATION.slice(4));
    if (!res.ok) throw new Error(`elevation ${res.status}`);
    buf = await res.arrayBuffer();
  } else {
    const bin = atob(ELEVATION);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    buf = u8.buffer;
  }
  const dv = new DataView(buf);
  const z = new Float32Array(COLS * ROWS);
  for (let i = 0; i < z.length; i++) z[i] = dv.getUint16(i * 2, true);
  return z;
}

export function createWorld(scene, elev) {
  // ------------------------------------------------------------ sampling
  /** Elevation in metres at scene (x, z), bilinear */
  const elevAt = (x, z) => {
    const c = Math.min(COLS - 1.001, Math.max(0, ((x + WIDTH / 2) / WIDTH) * (COLS - 1)));
    const r = Math.min(ROWS - 1.001, Math.max(0, ((z + DEPTH / 2) / DEPTH) * (ROWS - 1)));
    const c0 = Math.floor(c);
    const r0 = Math.floor(r);
    const fc = c - c0;
    const fr = r - r0;
    const at = (rr, cc) => elev[rr * COLS + cc];
    return (
      at(r0, c0) * (1 - fc) * (1 - fr) + at(r0, c0 + 1) * fc * (1 - fr) + at(r0 + 1, c0) * (1 - fc) * fr + at(r0 + 1, c0 + 1) * fc * fr
    );
  };
  const groundY = (x, z) => yOf(elevAt(x, z));
  const point = (lon, lat, lift = 0) => {
    const [x, z] = toXZ(lon, lat);
    return new THREE.Vector3(x, groundY(x, z) + lift, z);
  };

  // ------------------------------------------------------------ the lake: cells at the lake's level around its centre
  const lakeCell = (() => {
    const [x, z] = toXZ(...TERRAIN.lake);
    const c = Math.round(((x + WIDTH / 2) / WIDTH) * (COLS - 1));
    const r = Math.round(((z + DEPTH / 2) / DEPTH) * (ROWS - 1));
    return r * COLS + c;
  })();
  const water = new Uint8Array(COLS * ROWS);
  {
    const level = elev[lakeCell];
    const stack = [lakeCell];
    water[lakeCell] = 1;
    while (stack.length) {
      const i = stack.pop();
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        const j = rr * COLS + cc;
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && !water[j] && Math.abs(elev[j] - level) <= 4) {
          water[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  const lakeLevel = elev[lakeCell];
  const lakeCentre = point(...TERRAIN.lake, 0);
  lakeCentre.y = yOf(lakeLevel);

  // ------------------------------------------------------------ textures baked from the data
  const TW = 2048;
  const TH = Math.round((TW * DEPTH) / WIDTH);
  const px = (lon, lat) => [((lon - WEST) / (EAST - WEST)) * TW, ((NORTH - lat) / (NORTH - SOUTH)) * TH];

  const ramp = [
    [2800, [214, 205, 172]],
    [3300, [200, 196, 160]],
    [3900, [186, 180, 146]],
    [4400, [170, 160, 140]],
    [4900, [176, 170, 166]],
    [5150, [236, 240, 244]],
    [6200, [250, 251, 253]],
  ];
  const colorOf = (m) => {
    for (let i = 1; i < ramp.length; i++) {
      if (m <= ramp[i][0]) {
        const k = (m - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0]);
        return ramp[i - 1][1].map((v, j) => v + (ramp[i][1][j] - v) * Math.max(0, k));
      }
    }
    return ramp[ramp.length - 1][1];
  };
  const small = document.createElement('canvas');
  small.width = COLS;
  small.height = ROWS;
  {
    const ctx = small.getContext('2d');
    const img = ctx.createImageData(COLS, ROWS);
    for (let i = 0; i < COLS * ROWS; i++) {
      const [r, g, b] = water[i] ? [104, 160, 178] : colorOf(elev[i]);
      img.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }
  const ring = (ctx, pts) => {
    ctx.beginPath();
    pts.forEach(([lon, lat], i) => {
      const [x, y] = px(lon, lat);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
  };
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = TW;
  baseCanvas.height = TH;
  {
    const ctx = baseCanvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, TW, TH);
    // the río Santa
    ctx.strokeStyle = 'rgba(70,128,160,.9)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    for (const line of TERRAIN.overlays.santa) {
      ring(ctx, line);
      ctx.stroke();
    }
    // the flow path, faint: the channel the flood will take
    ctx.strokeStyle = 'rgba(70,128,160,.55)';
    ctx.lineWidth = 3;
    ring(ctx, TERRAIN.path);
    ctx.stroke();
    // the district of Independencia
    ctx.setLineDash([14, 9]);
    ctx.strokeStyle = 'rgba(40,40,40,.55)';
    ctx.lineWidth = 3;
    for (const r of TERRAIN.overlays.boundary) {
      ring(ctx, r);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  const hazardCanvas = document.createElement('canvas');
  hazardCanvas.width = TW;
  hazardCanvas.height = TH;
  {
    const ctx = hazardCanvas.getContext('2d');
    for (const level of ['bajo', 'medio', 'alto', 'muy-alto']) {
      ctx.fillStyle = HAZARD_COLORS[level];
      for (const r of TERRAIN.overlays.hazard[level] || []) {
        ring(ctx, r);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  const tex = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  // ------------------------------------------------------------ terrain mesh
  const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, COLS - 1, ROWS - 1);
  geo.rotateX(-Math.PI / 2);
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, yOf(elev[i]));
    geo.computeVertexNormals();
  }
  const terrainMat = new THREE.MeshStandardMaterial({map: tex(baseCanvas), roughness: 0.96, metalness: 0});
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  const hazardMat = new THREE.MeshStandardMaterial({
    map: tex(hazardCanvas),
    transparent: true,
    opacity: 0,
    roughness: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const hazard = new THREE.Mesh(geo, hazardMat);
  hazard.receiveShadow = true;
  hazard.renderOrder = 2;
  scene.add(hazard);

  // a skirt under the terrain edges, so the block reads as a solid model
  {
    const skirt = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color: '#cbbf9f', roughness: 1});
    const floorY = yOf(BASE_M) - 0.25;
    const edge = (idx) => {
      const pts = idx.map((i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        return [(c / (COLS - 1) - 0.5) * WIDTH, (r / (ROWS - 1) - 0.5) * DEPTH, yOf(elev[i])];
      });
      const g = new THREE.BufferGeometry();
      const v = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, z0, y0] = pts[k];
        const [x1, z1, y1] = pts[k + 1];
        v.push(x0, y0, z0, x0, floorY, z0, x1, y1, z1, x1, y1, z1, x0, floorY, z0, x1, floorY, z1);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.material.side = THREE.DoubleSide;
      skirt.add(m);
    };
    const range = (n, f) => Array.from({length: n}, (_, i) => f(i));
    edge(range(COLS, (c) => c));
    edge(range(COLS, (c) => (ROWS - 1) * COLS + c));
    edge(range(ROWS, (r) => r * COLS));
    edge(range(ROWS, (r) => r * COLS + COLS - 1));
    scene.add(skirt);
  }

  // ------------------------------------------------------------ the flow path in 3D
  const path = TERRAIN.path.map(([lon, lat, , d]) => ({p: point(lon, lat), d}));
  const pathAt = (d) => {
    const x = Math.min(Math.max(d, 0), TERRAIN.pathLengthM);
    let i = 1;
    while (i < path.length - 1 && path[i].d < x) i++;
    const a = path[i - 1];
    const b = path[i];
    const k = b.d > a.d ? (x - a.d) / (b.d - a.d) : 0;
    return a.p.clone().lerp(b.p, k);
  };

  // the flood: a ribbon along the path, revealed up to the front, as wide as the scenario's discharge
  const ribbonGeo = new THREE.BufferGeometry();
  const N = path.length;
  ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 3), 3));
  ribbonGeo.setAttribute('along', new THREE.Float32BufferAttribute(new Float32Array(N * 2), 1));
  ribbonGeo.setAttribute('side', new THREE.Float32BufferAttribute(new Float32Array(N * 2), 1));
  {
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    ribbonGeo.setIndex(idx);
  }
  const ribbonMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: {uFront: {value: 0}, uFlow: {value: 0}, uBody: {value: new THREE.Color('#7a4a2a')}, uHead: {value: new THREE.Color('#e3562a')}},
    vertexShader: /* glsl */ `attribute float along; attribute float side; varying float vA; varying float vS;
      void main(){ vA = along; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uFront; uniform float uFlow; uniform vec3 uBody; uniform vec3 uHead; varying float vA; varying float vS;
      void main(){
        if (vA > uFront) discard;
        float head = 1.0 - smoothstep(0.0, 1800.0, uFront - vA);
        float streak = 0.5 + 0.5 * sin((vA - uFlow) * 0.012 + vS * 1.3);
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(vS));
        vec3 col = mix(uBody, uHead, head * 0.9) * (0.9 + 0.12 * streak);
        gl_FragColor = vec4(col, (0.55 + 0.4 * edge) * (0.92 + 0.08 * streak));
      }`,
  });
  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.renderOrder = 4;
  scene.add(ribbon);
  /** Rebuild the ribbon's width for a scenario: wider where the peak discharge is larger */
  const shapeRibbon = (scenario, route) => {
    const pos = ribbonGeo.attributes.position;
    const along = ribbonGeo.attributes.along;
    const side = ribbonGeo.attributes.side;
    for (let i = 0; i < N; i++) {
      const prev = path[Math.max(0, i - 1)].p;
      const next = path[Math.min(N - 1, i + 1)].p;
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const q = dischargeAt(scenario, route, path[i].d);
      const half = 0.015 + 0.012 * Math.log10(Math.max(q, 2));
      for (const s of [-1, 1]) {
        const x = path[i].p.x + (-dz / len) * half * s;
        const z = path[i].p.z + (dx / len) * half * s;
        const j = i * 2 + (s > 0 ? 1 : 0);
        pos.setXYZ(j, x, groundY(x, z) + 0.012, z);
        along.setX(j, path[i].d);
        side.setX(j, s);
      }
    }
    pos.needsUpdate = true;
    along.needsUpdate = true;
    side.needsUpdate = true;
    ribbonGeo.computeBoundingSphere();
  };

  // the front: a pin and a glowing disc where the flood is now
  const front = new THREE.Group();
  {
    const mat = new THREE.MeshBasicMaterial({color: '#e3562a', toneMapped: false});
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 8), mat);
    pin.position.y = 0.275;
    front.add(pin);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12), mat);
    head.position.y = 0.56;
    front.add(head);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.09, 40),
      new THREE.MeshBasicMaterial({color: '#e3562a', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide}),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    disc.name = 'disc';
    front.add(disc);
  }
  scene.add(front);

  // ------------------------------------------------------------ the avalanche and the wave
  // the avalanche falls from the highest summit within 3 km of the lake (Palcaraju side)
  const source = (() => {
    let best = -1;
    let bi = 0;
    for (let i = 0; i < elev.length; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const x = (c / (COLS - 1) - 0.5) * WIDTH;
      const z = (r / (ROWS - 1) - 0.5) * DEPTH;
      if (Math.hypot(x - lakeCentre.x, z - lakeCentre.z) < 3 && elev[i] > best) {
        best = elev[i];
        bi = i;
      }
    }
    const r = Math.floor(bi / COLS);
    const c = bi % COLS;
    return new THREE.Vector3((c / (COLS - 1) - 0.5) * WIDTH, yOf(best), (r / (ROWS - 1) - 0.5) * DEPTH);
  })();
  const ICE = 260;
  const ice = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.035, 0),
    new THREE.MeshStandardMaterial({color: '#f4f8fb', roughness: 0.5}),
    ICE,
  );
  ice.castShadow = true;
  ice.frustumCulled = false;
  scene.add(ice);
  const iceSeed = Array.from({length: ICE}, (_, i) => {
    const h = (n) => {
      const x = Math.sin((i + 1) * 127.1 + n * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    return {delay: h(1) * 0.35, lat: (h(2) - 0.5) * 0.7, s: 0.6 + h(3) * 1.2, spin: h(4) * 6.28};
  });
  const wave = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 64),
      new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}),
    );
    m.rotation.x = -Math.PI / 2;
    wave.add(m);
  }
  wave.position.copy(lakeCentre).add(new THREE.Vector3(0, 0.01, 0));
  scene.add(wave);

  // ------------------------------------------------------------ safe places of the official map
  const pinGeo = (() => {
    const stem = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8).translate(0, 0.03, 0);
    const head = new THREE.SphereGeometry(0.016, 16, 10).translate(0, 0.072, 0);
    const g = new THREE.BufferGeometry();
    const merged = [stem, head].map((x) => x.toNonIndexed());
    for (const name of ['position', 'normal']) {
      const arrays = merged.map((m) => m.attributes[name].array);
      const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
      let o = 0;
      for (const a of arrays) {
        out.set(a, o);
        o += a.length;
      }
      g.setAttribute(name, new THREE.BufferAttribute(out, 3));
    }
    return g;
  })();
  const safe = new THREE.InstancedMesh(
    pinGeo,
    new THREE.MeshStandardMaterial({color: '#2fa36b', roughness: 0.6}),
    TERRAIN.overlays.safe.length,
  );
  safe.frustumCulled = false;
  scene.add(safe);
  const safePts = TERRAIN.overlays.safe.map(([lon, lat]) => point(lon, lat));

  // ------------------------------------------------------------ pose
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  /**
   * s: {tau (s since the avalanche), frontM, impactS, hazard 0..1, safe 0..1}
   * Everything is a pure function of s.
   */
  const update = (s) => {
    ribbonMat.uniforms.uFront.value = s.frontM > 0 ? s.frontM : -1;
    ribbonMat.uniforms.uFlow.value = s.tau * 9;
    const fp = pathAt(s.frontM);
    front.position.copy(fp);
    front.visible = s.frontM > 250;
    const pulse = 1 + 0.25 * Math.sin(s.tau * 0.08);
    front.getObjectByName('disc').scale.setScalar(pulse);
    hazardMat.opacity = 0.72 * s.hazard;
    hazard.visible = s.hazard > 0.002;

    // ice blocks slide from the summit into the lake over impactS seconds
    for (let i = 0; i < ICE; i++) {
      const q = iceSeed[i];
      const k = (s.tau / s.impactS - q.delay) / (1 - q.delay);
      if (s.tau < 0 || k <= 0 || k >= 1) {
        M.makeScale(0, 0, 0);
      } else {
        const e = k * k;
        P.copy(source).lerp(lakeCentre, e);
        const dx = lakeCentre.x - source.x;
        const dz = lakeCentre.z - source.z;
        const L = Math.hypot(dx, dz) || 1;
        P.x += (-dz / L) * q.lat * (0.15 + e * 0.5);
        P.z += (dx / L) * q.lat * (0.15 + e * 0.5);
        P.y = Math.max(groundY(P.x, P.z), lakeCentre.y) + 0.02;
        Q.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), q.spin + k * 14);
        S.setScalar(q.s);
        M.compose(P, Q, S);
      }
      ice.setMatrixAt(i, M);
    }
    ice.instanceMatrix.needsUpdate = true;

    // the impact wave: three rings spreading over the lake for a minute
    wave.children.forEach((m, k) => {
      const w = (s.tau - s.impactS - k * 6) / 50;
      const on = w > 0 && w < 1;
      m.visible = on;
      if (on) {
        m.scale.setScalar(0.04 + w * 0.75);
        m.material.opacity = 0.85 * (1 - w);
      }
    });

    for (let i = 0; i < safePts.length; i++) {
      const k = s.safe;
      S.set(k, k, k);
      P.copy(safePts[i]);
      M.compose(P, Q.identity(), S);
      safe.setMatrixAt(i, M);
    }
    safe.instanceMatrix.needsUpdate = true;
    safe.visible = s.safe > 0.002;
  };

  return {
    terrain,
    update,
    shapeRibbon,
    pathAt,
    point,
    groundY,
    lakeCentre,
    lakeLevel,
    source,
    lengthM: TERRAIN.pathLengthM,
    entranceM: TERRAIN.entranceM,
    path: TERRAIN.path,
  };
}
