// Official map layers: IGN district boundaries (HDX COD-AB) and ANA rivers → data/*.geojson.
import { describe, expect, it } from 'vitest';
import type { Feature, LineString, Polygon } from 'geojson';
import {
  districtCollection,
  riverCollection,
  simplifyLine,
  simplifyRing,
} from '../../scripts/build-official-geo.ts';

type Pt = [number, number];

const igName = (code: string, name: string, coords: Pt[][]): Feature<Polygon> => ({
  type: 'Feature',
  properties: {
    adm3_name: name,
    adm3_pcode: code,
    adm2_name: 'Huaraz',
    adm2_pcode: 'PE0201',
    adm1_name: 'Ancash',
    valid_on: '2020-07-14',
    version: 'v01',
    area_sqkm: 345.53274703,
  },
  geometry: { type: 'Polygon', coordinates: coords },
});

describe('simplifyLine', () => {
  it('drops points closer than the tolerance to the line and keeps the end points', () => {
    const line: Pt[] = [
      [0, 0],
      [1, 0.00001],
      [2, 0],
      [3, 1],
    ];
    expect(simplifyLine(line, 0.001)).toEqual([
      [0, 0],
      [2, 0],
      [3, 1],
    ]);
  });

  it('rounds coordinates to 5 decimals', () => {
    expect(
      simplifyLine(
        [
          [-77.123456789, -9.987654321],
          [-77.2, -9.9],
        ],
        0,
      ),
    ).toEqual([
      [-77.12346, -9.98765],
      [-77.2, -9.9],
    ]);
  });
});

describe('simplifyRing', () => {
  it('keeps the ring closed and with at least 4 positions', () => {
    const ring: Pt[] = [
      [0, 0],
      [1, 0],
      [1, 0.5],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const out = simplifyRing(ring, 0.01);
    expect(out[0]).toEqual(out.at(-1));
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out).not.toContainEqual([1, 0.5]);
  });

  it('returns a tiny ring untouched instead of collapsing it', () => {
    const tri: Pt[] = [
      [0, 0],
      [0.00001, 0],
      [0, 0.00001],
      [0, 0],
    ];
    expect(simplifyRing(tri, 1)).toEqual(tri);
  });
});

describe('districtCollection', () => {
  const square = (x: number): Pt[][] => [
    [
      [x, 0],
      [x + 1, 0],
      [x + 1, 1],
      [x, 1],
      [x, 0],
    ],
  ];
  const input = {
    type: 'FeatureCollection' as const,
    features: [
      igName('PE020105', 'Independencia', square(0)),
      igName('PE020101', 'Huaraz', square(1)),
      {
        ...igName('PE020201', 'Aija', square(5)),
        properties: { adm3_pcode: 'PE020201', adm2_pcode: 'PE0202', adm3_name: 'Aija' },
      },
    ],
  };

  it('keeps only the districts of the province, with INEI ubigeo, name and IGN provenance', () => {
    const fc = districtCollection(input, 'PE0201', '2026-11-07T00:00:00.000Z');
    expect(fc.features.map((f) => f.properties!.ubigeo)).toEqual(['020101', '020105']);
    expect(fc.features[1]!.properties).toEqual({
      ubigeo: '020105',
      name: 'Independencia',
      province: 'Huaraz',
      areaKm2: 345.53,
      validOn: '2020-07-14',
      version: 'v01',
      source: 'Instituto Geográfico Nacional (IGN) – límites distritales, vía HDX COD-AB Perú',
      sourceUrl: 'https://data.humdata.org/dataset/cod-ab-per',
      license: 'CC BY-IGO',
      builtAt: '2026-11-07T00:00:00.000Z',
    });
  });

  it('fails loudly when Independencia is missing', () => {
    expect(() =>
      districtCollection({ type: 'FeatureCollection', features: [input.features[1]!] }, 'PE0201', 'x'),
    ).toThrow(/020105/);
  });
});

describe('riverCollection', () => {
  it('maps ANA features to name + kind with ANA provenance and drops unnamed lines', () => {
    const ana = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { NOMBRE_CA: 'Río Santa', TIPO_CA: 'Río', LONG_KM: 68.2, CODIGO_CA: '1376' },
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [-77.5, -9.5],
              [-77.6, -9.4],
            ],
          },
        },
        {
          type: 'Feature' as const,
          properties: { NOMBRE_CA: null, TIPO_CA: 'Río' },
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    };
    const fc = riverCollection(ana, 'x');
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0] as Feature<LineString>;
    expect(f.properties).toMatchObject({ name: 'Río Santa', kind: 'Río', code: '1376' });
    expect(f.properties!.source).toMatch(/ANA/);
  });
});
