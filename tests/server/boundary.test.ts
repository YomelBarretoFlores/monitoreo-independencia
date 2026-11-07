// Ring assembly for the district outline (OSM relation 1953273 → GeoJSON).
import { describe, expect, it } from 'vitest';
import {
  assembleRings,
  boundaryFeature,
  waysFromOsmApi,
  waysFromOverpass,
} from '../../scripts/fetch-boundary.ts';

type Pt = [number, number];
const signedArea = (r: Pt[]) =>
  r.slice(1).reduce((s, p, i) => s + (r[i]![0] * p[1] - p[0] * r[i]![1]), 0) / 2;

describe('assembleRings', () => {
  it('joins open ways end to end (reversing when needed) into one closed counter-clockwise ring', () => {
    const ways: Pt[][] = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ], // reversed
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ];
    const rings = assembleRings(ways);
    expect(rings).toHaveLength(1);
    const r = rings[0]!;
    expect(r[0]).toEqual(r.at(-1));
    expect(r).toHaveLength(5);
    expect(signedArea(r)).toBeGreaterThan(0);
  });

  it('keeps separate closed rings and fails on a ring that cannot be closed', () => {
    const sq = (x: number): Pt[] => [
      [x, 0],
      [x, 1],
      [x + 1, 1],
      [x + 1, 0],
      [x, 0],
    ];
    expect(assembleRings([sq(0), sq(5)])).toHaveLength(2);
    expect(() =>
      assembleRings([
        [
          [0, 0],
          [1, 0],
        ],
        [
          [5, 5],
          [6, 6],
        ],
      ]),
    ).toThrow(/cerrar/);
  });
});

describe('sources', () => {
  it('reads way geometry from Overpass "out geom" and from the OSM API', () => {
    const overpass = {
      elements: [
        {
          type: 'relation',
          tags: { name: 'Independencia' },
          members: [
            {
              type: 'way',
              role: 'outer',
              geometry: [
                { lat: 0, lon: 0 },
                { lat: 0, lon: 1 },
              ],
            },
            { type: 'way', role: 'inner', geometry: [{ lat: 9, lon: 9 }] },
          ],
        },
      ],
    };
    expect(waysFromOverpass(overpass)).toEqual({
      tags: { name: 'Independencia' },
      ways: [
        [
          [0, 0],
          [1, 0],
        ],
      ],
    });

    const api = {
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 0, lon: 1 },
        { type: 'way', id: 10, nodes: [1, 2] },
        {
          type: 'relation',
          id: 1953273,
          tags: { name: 'Independencia' },
          members: [{ type: 'way', ref: 10, role: 'outer' }],
        },
      ],
    };
    expect(waysFromOsmApi(api)).toEqual({
      tags: { name: 'Independencia' },
      ways: [
        [
          [0, 0],
          [1, 0],
        ],
      ],
    });
  });

  it('builds a Feature with OSM attribution', () => {
    const f = boundaryFeature({ name: 'Independencia', 'pe:ubigeo': '020105' }, [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ]);
    expect(f.geometry.type).toBe('Polygon');
    expect(f.properties).toMatchObject({
      name: 'Independencia',
      ubigeo: '020105',
      attribution: '© OpenStreetMap contributors (ODbL)',
    });
  });
});
