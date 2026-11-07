import type { Feature, Geometry, Position } from 'geojson';

// Static SVG drawing of GeoJSON (official boundaries for the summary tile). No DOM here.

export type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];
export type Project = (p: Position) => [number, number];

function eachPosition(g: Geometry, fn: (p: Position) => void): void {
  switch (g.type) {
    case 'Point':
      fn(g.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      g.coordinates.forEach(fn);
      break;
    case 'MultiLineString':
    case 'Polygon':
      g.coordinates.forEach((l) => l.forEach(fn));
      break;
    case 'MultiPolygon':
      g.coordinates.forEach((p) => p.forEach((l) => l.forEach(fn)));
      break;
    case 'GeometryCollection':
      g.geometries.forEach((x) => eachPosition(x, fn));
      break;
  }
}

export function bboxOf(features: Feature[]): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    if (!f.geometry) continue;
    eachPosition(f.geometry, ([lon, lat]) => {
      b[0] = Math.min(b[0], lon!);
      b[1] = Math.min(b[1], lat!);
      b[2] = Math.max(b[2], lon!);
      b[3] = Math.max(b[3], lat!);
    });
  }
  return b;
}

/** Equirectangular projection scaled by cos(mid latitude), fitted and centered in w×h minus padding. */
export function projector(b: BBox, w: number, h: number, pad: number): Project {
  const k = Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180);
  const spanX = (b[2] - b[0]) * k || 1e-9;
  const spanY = b[3] - b[1] || 1e-9;
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * s) / 2;
  const oy = (h - spanY * s) / 2;
  return ([lon, lat]) => [ox + (lon! - b[0]) * k * s, oy + (b[3] - lat!) * s];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function ring(points: Position[], project: Project, close: boolean): string {
  let out = '';
  let last = '';
  points.forEach((p, i) => {
    const [x, y] = project(p);
    const seg = `${r1(x)} ${r1(y)}`;
    if (seg === last) return; // drop points that collapse at this scale
    out += `${i === 0 ? 'M' : 'L'}${seg}`;
    last = seg;
  });
  return close ? `${out}Z` : out;
}

export function pathFor(g: Geometry, project: Project): string {
  switch (g.type) {
    case 'LineString':
      return ring(g.coordinates, project, false);
    case 'MultiLineString':
      return g.coordinates.map((l) => ring(l, project, false)).join('');
    case 'Polygon':
      return g.coordinates.map((r) => ring(r, project, true)).join('');
    case 'MultiPolygon':
      return g.coordinates.map((p) => p.map((r) => ring(r, project, true)).join('')).join('');
    default:
      return '';
  }
}

/** Area-weighted centroid of the outer ring (for labels); falls back to the bbox center. */
export function labelPoint(g: Geometry): Position {
  const outer =
    g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : null;
  if (!outer || outer.length < 4) {
    const b = bboxOf([{ type: 'Feature', properties: {}, geometry: g }]);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < outer.length - 1; i++) {
    const [x0, y0] = outer[i]!;
    const [x1, y1] = outer[i + 1]!;
    const f = x0! * y1! - x1! * y0!;
    a += f;
    cx += (x0! + x1!) * f;
    cy += (y0! + y1!) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : outer[0]!;
}
