import { describe, expect, it } from 'vitest';
import raw from '../../data/glof/routes.json?raw';

interface RouteData {
  name: string;
  path: [number, number, number, number][];
  lengthM: number;
  entranceM: number | null;
  entranceMap: 'quillcay' | 'casca' | null;
  reachesSanta: boolean;
}
const data = JSON.parse(raw) as { source: string; method: string; routes: Record<string, RouteData> };

describe('lake flow routes (scripts/glof/routes.py)', () => {
  it('has a route for every glacial lake above Huaraz and Independencia', () => {
    expect(Object.keys(data.routes).sort()).toEqual(['cuchillacocha', 'llaca', 'palcacocha', 'tullparaju']);
    expect(data.source).toContain('Terrain Tiles');
  });

  it('runs downhill from the lake to the río Santa, with increasing distances', () => {
    for (const r of Object.values(data.routes)) {
      expect(r.reachesSanta).toBe(true);
      const first = r.path[0]!;
      const last = r.path.at(-1)!;
      expect(first[2]).toBeGreaterThan(last[2] + 1000);
      for (let i = 1; i < r.path.length; i++) expect(r.path[i]![3]).toBeGreaterThan(r.path[i - 1]![3]);
      expect(last[3]).toBe(r.lengthM);
    }
  });

  it('enters the official hazard map of the basin it drains to', () => {
    for (const id of ['palcacocha', 'cuchillacocha', 'tullparaju']) {
      expect(data.routes[id]!.entranceMap).toBe('quillcay');
      expect(data.routes[id]!.entranceM!).toBeLessThan(data.routes[id]!.lengthM);
    }
    expect(data.routes.llaca!.entranceMap).toBe('casca');
  });

  it('puts the Palcacocha city entrance about 23 km from the lake (Mergili et al. 2020)', () => {
    expect(data.routes.palcacocha!.entranceM!).toBeGreaterThan(21_000);
    expect(data.routes.palcacocha!.entranceM!).toBeLessThan(24_000);
  });
});
