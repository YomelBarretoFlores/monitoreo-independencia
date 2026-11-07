// Projection of the official boundaries into a static SVG (summary tile).
import { describe, expect, it } from 'vitest';
import type { Feature } from 'geojson';
import { bboxOf, pathFor, projector } from '../../src/lib/geo.ts';

const square: Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-77.6, -9.6],
        [-77.4, -9.6],
        [-77.4, -9.4],
        [-77.6, -9.4],
        [-77.6, -9.6],
      ],
    ],
  },
};

describe('bboxOf', () => {
  it('returns [minLon, minLat, maxLon, maxLat] over every feature', () => {
    const line: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-77.7, -9.5],
          [-77.5, -9.3],
        ],
      },
    };
    expect(bboxOf([square, line])).toEqual([-77.7, -9.6, -77.4, -9.3]);
  });
});

describe('projector', () => {
  it('puts north up, keeps the aspect ratio (cos lat) and centers the shape inside the padding', () => {
    const p = projector([-77.6, -9.6, -77.4, -9.4], 200, 100, 10);
    const [x0, y0] = p([-77.6, -9.4]); // north-west
    const [x1, y1] = p([-77.4, -9.6]); // south-east
    expect(y0).toBeCloseTo(10);
    expect(y1).toBeCloseTo(90);
    // 0.2° of longitude at -9.5° is ~0.986 of 0.2° of latitude
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(Math.cos((9.5 * Math.PI) / 180), 3);
    expect((x0 + x1) / 2).toBeCloseTo(100);
  });
});

describe('pathFor', () => {
  it('draws closed polygons and open lines', () => {
    const p = projector([-77.6, -9.6, -77.4, -9.4], 100, 100, 0);
    expect(pathFor(square.geometry, p)).toMatch(/^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){3,}Z$/);
    expect(
      pathFor(
        {
          type: 'LineString',
          coordinates: [
            [-77.6, -9.6],
            [-77.4, -9.4],
          ],
        },
        p,
      ),
    ).toMatch(/^M[\d.]+ [\d.]+L[\d.]+ [\d.]+$/);
  });
});
