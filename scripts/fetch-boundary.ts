// Downloads the district outline (OSM relation 1953273, pe:ubigeo=020105) and writes
// data/boundary.geojson. Run once: node scripts/fetch-boundary.ts
// Tries Overpass (`out geom`) first, with a short backoff when it is busy, then the OSM API
// (relation/full), which returns the same geometry as nodes + ways.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export const RELATION = 1953273;
const UA = 'MonitoreoIndependencia/0.1 (scripts/fetch-boundary.ts)';
type Pt = [number, number]; // [lon, lat]

interface OsmWays {
  tags: Record<string, string>;
  ways: Pt[][];
}

export function waysFromOverpass(json: unknown): OsmWays {
  const rel = (json as { elements?: Record<string, unknown>[] }).elements?.find((e) => e.type === 'relation');
  if (!rel) throw new Error('Overpass no devolvió la relación');
  const members = rel.members as { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
  return {
    tags: (rel.tags as Record<string, string>) ?? {},
    ways: members
      .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry?.length)
      .map((m) => m.geometry!.map((g) => [g.lon, g.lat] as Pt)),
  };
}

export function waysFromOsmApi(json: unknown): OsmWays {
  const els = (json as { elements: Record<string, unknown>[] }).elements;
  const nodes = new Map<number, Pt>();
  const ways = new Map<number, number[]>();
  let rel: Record<string, unknown> | undefined;
  for (const e of els) {
    if (e.type === 'node') nodes.set(e.id as number, [e.lon as number, e.lat as number]);
    else if (e.type === 'way') ways.set(e.id as number, e.nodes as number[]);
    else if (e.type === 'relation') rel = e;
  }
  if (!rel) throw new Error('La API de OSM no devolvió la relación');
  const members = rel.members as { type: string; ref: number; role: string }[];
  return {
    tags: (rel.tags as Record<string, string>) ?? {},
    ways: members
      .filter((m) => m.type === 'way' && m.role === 'outer')
      .map((m) => (ways.get(m.ref) ?? []).map((id) => nodes.get(id)!).filter(Boolean)),
  };
}

const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
const signedArea = (r: Pt[]) =>
  r.slice(1).reduce((s, p, i) => s + (r[i]![0] * p[1] - p[0] * r[i]![1]), 0) / 2;

/** Joins outer ways into closed rings, counter-clockwise as RFC 7946 asks for exterior rings */
export function assembleRings(input: Pt[][]): Pt[][] {
  const pool = input.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings: Pt[][] = [];
  while (pool.length) {
    let ring = pool.shift()!;
    while (!same(ring[0]!, ring.at(-1)!)) {
      const end = ring.at(-1)!;
      const i = pool.findIndex((w) => same(w[0]!, end) || same(w.at(-1)!, end));
      if (i < 0) throw new Error('No se pudo cerrar el contorno: faltan tramos');
      const w = pool.splice(i, 1)[0]!;
      ring = ring.concat((same(w[0]!, end) ? w : w.reverse()).slice(1));
    }
    if (ring.length < 4) continue;
    rings.push(signedArea(ring) < 0 ? ring.reverse() : ring);
  }
  if (!rings.length) throw new Error('El contorno no tiene anillos');
  return rings;
}

export function boundaryFeature(
  tags: Record<string, string>,
  rings: Pt[][],
): Feature<Polygon | MultiPolygon> {
  const geometry: Polygon | MultiPolygon =
    rings.length === 1
      ? { type: 'Polygon', coordinates: [rings[0]!] }
      : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
  return {
    type: 'Feature',
    properties: {
      name: tags.name ?? 'Independencia',
      ubigeo: tags['pe:ubigeo'] ?? '020105',
      osmRelation: RELATION,
      ...(tags.population
        ? { population: Number(tags.population), populationDate: tags['population:date'] ?? null }
        : {}),
      ...(tags['source:population'] ? { populationSource: tags['source:population'] } : {}),
      attribution: '© OpenStreetMap contributors (ODbL)',
      source: `https://www.openstreetmap.org/relation/${RELATION}`,
      fetchedAt: new Date().toISOString(),
    },
    geometry,
  };
}

async function get(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, ...init?.headers },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

async function main() {
  let osm: OsmWays | undefined;
  const query = `[out:json][timeout:60];rel(${RELATION});out geom;`;
  for (const wait of [0, 10, 30]) {
    if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
    try {
      osm = waysFromOverpass(
        await get('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
        }),
      );
      console.log('Contorno descargado de Overpass');
      break;
    } catch (e) {
      console.warn(`Overpass: ${(e as Error).message}`);
    }
  }
  if (!osm) {
    osm = waysFromOsmApi(await get(`https://api.openstreetmap.org/api/0.6/relation/${RELATION}/full.json`));
    console.log('Contorno descargado de la API de OpenStreetMap');
  }
  const feature = boundaryFeature(osm.tags, assembleRings(osm.ways));
  const out = resolve(fileURLToPath(new URL('../data/boundary.geojson', import.meta.url)));
  writeFileSync(out, JSON.stringify(feature) + '\n');
  const n =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates[0]!.length
      : feature.geometry.coordinates.length;
  console.log(
    `data/boundary.geojson: ${feature.geometry.type} (${n} ${feature.geometry.type === 'Polygon' ? 'puntos' : 'anillos'})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
