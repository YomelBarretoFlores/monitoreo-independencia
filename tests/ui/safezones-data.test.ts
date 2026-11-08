// Contract of data/safe-zones/*.geojson (extracted from the two GeoPDFs by scripts/geopdf).
import type { Feature, FeatureCollection } from 'geojson';
import arrowsRaw from '../../data/safe-zones/arrows.geojson?raw';
import exposureRaw from '../../data/safe-zones/exposure.json?raw';
import hazardRaw from '../../data/safe-zones/hazard.geojson?raw';
import influenceRaw from '../../data/safe-zones/influence.geojson?raw';
import pointsRaw from '../../data/safe-zones/points.geojson?raw';
import routesRaw from '../../data/safe-zones/routes.geojson?raw';
import zonesRaw from '../../data/safe-zones/zones.geojson?raw';
import { describe, expect, it } from 'vitest';
import { EXPOSED_KINDS, HAZARD_LEVELS, MAP_SOURCES, SAFE_KINDS } from '../../src/lib/safezones.ts';

type Fc = FeatureCollection & { source: { builtAt: string; maps: Record<string, Record<string, unknown>> } };
const read = (raw: string) => JSON.parse(raw) as Fc;

const hazard = read(hazardRaw);
const zones = read(zonesRaw);
const influence = read(influenceRaw);
const routes = read(routesRaw);
const points = read(pointsRaw);
const arrows = read(arrowsRaw);

/** Both maps lie within this lon/lat box (frames of the two GeoPDFs) */
const BOX = { minLon: -77.55, maxLon: -77.49, minLat: -9.55, maxLat: -9.47 };
function coords(f: Feature): number[][] {
  const out: number[][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') out.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((f.geometry as { coordinates: unknown }).coordinates);
  return out;
}

describe('provenance', () => {
  it('every file names its source maps, and they match MAP_SOURCES', () => {
    for (const fc of [hazard, zones, influence, routes, points, arrows]) {
      expect(fc.type).toBe('FeatureCollection');
      expect(Date.parse(fc.source.builtAt)).not.toBeNaN();
      for (const [basin, map] of Object.entries(fc.source.maps)) {
        const known = MAP_SOURCES.find((s) => s.basin === basin)!;
        expect(map).toMatchObject({
          title: known.title,
          author: known.author,
          date: known.date,
          scale: known.scale,
          pdf: known.pdf,
          page: known.page,
        });
        expect(map.method).toEqual(expect.any(String));
      }
    }
  });
});

describe('geometry', () => {
  it('lies inside the two map frames, with coordinates rounded to 6 decimals', () => {
    for (const fc of [hazard, zones, influence, routes, points, arrows])
      for (const f of fc.features)
        for (const [lon, lat] of coords(f)) {
          expect(lon).toBeGreaterThan(BOX.minLon);
          expect(lon).toBeLessThan(BOX.maxLon);
          expect(lat).toBeGreaterThan(BOX.minLat);
          expect(lat).toBeLessThan(BOX.maxLat);
          expect(Math.abs(lon * 1e6 - Math.round(lon * 1e6))).toBeLessThan(1e-6);
        }
  });
});

describe('hazard', () => {
  it('has one dissolved area per basin and level: four levels in Quillcay, three in Casca', () => {
    const keys = hazard.features.map((f) => `${f.properties!.basin}:${f.properties!.level}`).sort();
    expect(keys).toEqual([
      'casca:alto',
      'casca:medio',
      'casca:muy-alto',
      'quillcay:alto',
      'quillcay:bajo',
      'quillcay:medio',
      'quillcay:muy-alto',
    ]);
    const levels = HAZARD_LEVELS.map((l) => l.id) as string[];
    for (const f of hazard.features) {
      expect(levels).toContain(f.properties!.level);
      expect(f.geometry.type).toMatch(/Polygon$/);
    }
  });
});

describe('Casca zones', () => {
  it('are the 37 rows of the source table (ZS-24 does not exist in it), all in Independencia', () => {
    const ids = zones.features.map((f) => f.properties!.id as string);
    expect(ids).toHaveLength(37);
    expect(ids).not.toContain('ZS-24');
    expect(ids).toContain('ZS-1');
    expect(ids).toContain('ZS-38');
    for (const f of zones.features) {
      expect(f.properties).toMatchObject({
        basin: 'casca',
        areaHa: expect.any(Number),
        maxEvacMin: expect.any(Number),
        avgEvacMin: expect.any(Number),
        altitudeM: expect.any(Number),
        influenceHa: expect.any(Number),
        independencia: true,
      });
      expect(f.geometry.type).toMatch(/Polygon$/);
    }
    // a spot check against the PDF table: ZS-1 1.822 ha, 7 min max, 5 min average
    expect(zones.features.find((f) => f.properties!.id === 'ZS-1')!.properties).toMatchObject({
      areaHa: 1.822,
      maxEvacMin: 7,
      avgEvacMin: 5,
      influenceHa: 3.039,
    });
  });

  it('influence areas point at existing zones', () => {
    const ids = new Set(zones.features.map((f) => f.properties!.id));
    expect(influence.features.length).toBeGreaterThan(0);
    for (const f of influence.features) expect(ids.has(f.properties!.zone)).toBe(true);
  });

  it('evacuation routes are lines', () => {
    expect(routes.features.length).toBeGreaterThan(0);
    for (const f of routes.features) expect(f.geometry.type).toMatch(/LineString$/);
  });
});

describe('places', () => {
  it('Quillcay pins are safe places and Casca pins are exposed elements, with known kinds', () => {
    const safe = SAFE_KINDS.map((k) => k.id) as string[];
    const exposed = EXPOSED_KINDS.map((k) => k.id) as string[];
    for (const f of points.features) {
      const p = f.properties!;
      expect(f.geometry.type).toBe('Point');
      expect(typeof p.independencia).toBe('boolean');
      if (p.basin === 'quillcay') {
        expect(p.group).toBe('seguro');
        expect(safe).toContain(p.kind);
      } else {
        expect(p.group).toBe('expuesto');
        expect(exposed).toContain(p.kind);
      }
    }
    const count = (basin: string) => points.features.filter((f) => f.properties!.basin === basin).length;
    expect(count('quillcay')).toBe(37);
    expect(count('casca')).toBe(25);
  });
});

describe('evacuation arrows', () => {
  it('are Quillcay points with a compass bearing, mostly along the four map axes', () => {
    expect(arrows.features.length).toBeGreaterThan(100);
    for (const f of arrows.features) {
      expect(f.geometry.type).toBe('Point');
      expect(f.properties!.basin).toBe('quillcay');
      const b = f.properties!.bearing as number;
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
    // the source map is rotated, but its arrows follow its own axes: bearings cluster in 4 groups
    const groups = new Set(
      arrows.features.map((f) => Math.round((f.properties!.bearing as number) / 90) % 4),
    );
    expect(groups.size).toBe(4);
  });
});

describe('exposed parcels (Casca)', () => {
  it('count the 3 478 parcels of the map legend once each, by hazard level, with provenance', () => {
    const exposure = JSON.parse(exposureRaw) as {
      source: { maps: Record<string, { title: string }> };
      casca: { parcels: Record<string, number>; rule: string };
    };
    const p = exposure.casca.parcels;
    expect(p.total).toBe(3478);
    expect(p['muy-alto']! + p.alto! + p.medio! + p.fuera!).toBe(p.total);
    expect(p['muy-alto']).toBeGreaterThan(0);
    expect(exposure.casca.rule).toMatch(/una vez/);
    expect(exposure.source.maps.casca!.title).toBe(MAP_SOURCES.find((s) => s.basin === 'casca')!.title);
  });

  it('influence areas never repeat a zone', () => {
    const zonesWithArea = influence.features.map((f) => f.properties!.zone);
    expect(new Set(zonesWithArea).size).toBe(zonesWithArea.length);
  });
});
