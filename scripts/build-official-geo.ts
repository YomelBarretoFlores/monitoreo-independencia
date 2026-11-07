// Builds the official map layers committed under data/:
//   data/huaraz-districts.geojson  the 12 districts of Huaraz province (IGN boundaries)
//   data/boundary.geojson          Independencia alone (same IGN polygon, full detail)
//   data/rivers.geojson            categorized rivers and streams around the district (ANA)
//
// Boundaries: Instituto Geográfico Nacional (IGN) via HDX COD-AB Peru (CC BY-IGO).
// ONPE's portal sits behind a WAF and is not scraped. Download the GeoJSON zip once:
//   https://data.humdata.org/dataset/cod-ab-per  → per_admin_boundaries.geojson.zip
// unzip it and run:
//   node scripts/build-official-geo.ts <path/to/per_admin3.geojson>
// Rivers are fetched live from ANA GeoSNIRH (Público/Rios, layer 37 "RiosQuebradas").
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from 'geojson';

type Pt = [number, number];

export const INDEPENDENCIA = '020105';
const PROVINCE_PCODE = 'PE0201';
const IGN_SOURCE = 'Instituto Geográfico Nacional (IGN) – límites distritales, vía HDX COD-AB Perú';
const IGN_URL = 'https://data.humdata.org/dataset/cod-ab-per';
const ANA_LAYER = 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico/Rios/MapServer/37';
/** lon/lat envelope around Huaraz province's central valley */
const RIVER_ENVELOPE = '-77.70,-9.60,-77.25,-9.28';

/** ~22 m for neighbours and rivers, ~11 m for Independencia itself */
const TOL_CONTEXT = 0.0002;
const TOL_DISTRICT = 0.0001;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const roundPt = (p: Pt): Pt => [round5(p[0]), round5(p[1])];

function segDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker on an open line (iterative, keeps both ends), then rounds to 5 decimals. */
export function simplifyLine(line: Pt[], tolerance: number): Pt[] {
  if (line.length <= 2) return line.map(roundPt);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1;
    let dmax = 0;
    for (let k = i + 1; k < j; k++) {
      const d = segDistance(line[k]!, line[i]!, line[j]!);
      if (d > dmax) {
        dmax = d;
        worst = k;
      }
    }
    if (worst > 0 && dmax > tolerance) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return line.filter((_, i) => keep[i]).map(roundPt);
}

/** Simplifies a closed ring; returns it untouched (rounded) if simplifying would collapse it. */
export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length <= 4) return ring.map(roundPt);
  // Split at the point farthest from the start so both halves keep the ring's shape.
  let far = 1;
  let dmax = 0;
  for (let k = 1; k < ring.length - 1; k++) {
    const d = Math.hypot(ring[k]![0] - ring[0]![0], ring[k]![1] - ring[0]![1]);
    if (d > dmax) {
      dmax = d;
      far = k;
    }
  }
  const a = simplifyLine(ring.slice(0, far + 1), tolerance);
  const b = simplifyLine(ring.slice(far), tolerance);
  const out = a.concat(b.slice(1));
  return out.length >= 4 ? out : ring.map(roundPt);
}

function simplifyPolygon(g: Polygon | MultiPolygon, tol: number): Polygon | MultiPolygon {
  const poly = (rings: Pt[][]) => rings.map((r) => simplifyRing(r, tol));
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: poly(g.coordinates as Pt[][]) }
    : { type: 'MultiPolygon', coordinates: (g.coordinates as Pt[][][]).map(poly) };
}

interface IgnProps {
  adm3_name?: string;
  adm3_pcode?: string;
  adm2_name?: string;
  adm2_pcode?: string;
  valid_on?: string | null;
  version?: string | null;
  area_sqkm?: number | null;
}

/** Districts of one province (IGN pcode "PE0201"), sorted by ubigeo, with provenance. */
export function districtCollection(
  admin3: FeatureCollection,
  provincePcode: string,
  builtAt: string,
  tolerance = TOL_CONTEXT,
): FeatureCollection<Polygon | MultiPolygon> {
  const features = admin3.features
    .filter((f) => (f.properties as IgnProps | null)?.adm2_pcode === provincePcode)
    .map((f): Feature<Polygon | MultiPolygon> => {
      const p = f.properties as IgnProps;
      const ubigeo = String(p.adm3_pcode).replace(/^PE/, '');
      return {
        type: 'Feature',
        properties: {
          ubigeo,
          name: p.adm3_name ?? ubigeo,
          province: p.adm2_name ?? null,
          areaKm2: p.area_sqkm ? Math.round(p.area_sqkm * 100) / 100 : null,
          validOn: p.valid_on ?? null,
          version: p.version ?? null,
          source: IGN_SOURCE,
          sourceUrl: IGN_URL,
          license: 'CC BY-IGO',
          builtAt,
        },
        geometry: simplifyPolygon(f.geometry as Polygon | MultiPolygon, tolerance),
      };
    })
    .sort((a, b) => String(a.properties!.ubigeo).localeCompare(String(b.properties!.ubigeo)));
  if (!features.some((f) => f.properties!.ubigeo === INDEPENDENCIA)) {
    throw new Error(`No se encontró el distrito ${INDEPENDENCIA} en los límites del IGN`);
  }
  return { type: 'FeatureCollection', features };
}

interface AnaProps {
  NOMBRE_CA?: string | null;
  TIPO_CA?: string | null;
  CODIGO_CA?: string | null;
  LONG_KM?: number | null;
}

/** ANA "RiosQuebradas" features → name, kind (Río / Quebrada) and code, with provenance. */
export function riverCollection(
  ana: FeatureCollection,
  builtAt: string,
): FeatureCollection<LineString | MultiLineString> {
  const features = ana.features
    .filter((f) => (f.properties as AnaProps | null)?.NOMBRE_CA && f.geometry)
    .map((f): Feature<LineString | MultiLineString> => {
      const p = f.properties as AnaProps;
      const g = f.geometry as LineString | MultiLineString;
      return {
        type: 'Feature',
        properties: {
          name: p.NOMBRE_CA,
          kind: p.TIPO_CA ?? null,
          code: p.CODIGO_CA ?? null,
          source: 'Autoridad Nacional del Agua (ANA) – GeoSNIRH, ríos y quebradas',
          sourceUrl: ANA_LAYER,
          builtAt,
        },
        geometry:
          g.type === 'LineString'
            ? { type: 'LineString', coordinates: simplifyLine(g.coordinates as Pt[], TOL_CONTEXT) }
            : {
                type: 'MultiLineString',
                coordinates: (g.coordinates as Pt[][]).map((l) => simplifyLine(l, TOL_CONTEXT)),
              },
      };
    });
  return { type: 'FeatureCollection', features };
}

async function fetchRivers(): Promise<FeatureCollection> {
  const q = new URLSearchParams({
    geometry: RIVER_ENVELOPE,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NOMBRE_CA,TIPO_CA,CODIGO_CA,LONG_KM',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const res = await fetch(`${ANA_LAYER}/query?${q}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`ANA respondió HTTP ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

const count = (g: Geometry) => JSON.stringify(g).length;

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Uso: node scripts/build-official-geo.ts <ruta/a/per_admin3.geojson>');
  const admin3 = JSON.parse(readFileSync(input, 'utf8')) as FeatureCollection;
  const builtAt = new Date().toISOString();
  const data = (f: string) => resolve(fileURLToPath(new URL(`../data/${f}`, import.meta.url)));

  const districts = districtCollection(admin3, PROVINCE_PCODE, builtAt);
  writeFileSync(data('huaraz-districts.geojson'), JSON.stringify(districts) + '\n');
  const own = districtCollection(admin3, PROVINCE_PCODE, builtAt, TOL_DISTRICT).features.find(
    (f) => f.properties!.ubigeo === INDEPENDENCIA,
  )!;
  writeFileSync(data('boundary.geojson'), JSON.stringify(own) + '\n');
  const rivers = riverCollection(await fetchRivers(), builtAt);
  writeFileSync(data('rivers.geojson'), JSON.stringify(rivers) + '\n');

  console.log(`huaraz-districts.geojson: ${districts.features.length} distritos`);
  console.log(`boundary.geojson: ${own.geometry.type}, ${count(own.geometry)} bytes de geometría`);
  console.log(`rivers.geojson: ${rivers.features.map((f) => f.properties!.name).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
