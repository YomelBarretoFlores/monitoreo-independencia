import { describe, expect, it } from 'vitest';
import raw from '../../data/centros-poblados.json?raw';
import {
  centroPopup,
  columnHeightM,
  columnSideM,
  type CentrosData,
  gapColor,
  GAP_STOPS,
  toColumns,
  tourStops,
} from '../../src/lib/centros.ts';
import { LAKE_POINT } from '../../src/lib/palcacocha.ts';

const data = JSON.parse(raw) as CentrosData;
const independencia = data.centros.filter((c) => c.district === 'independencia');

describe('centros poblados data', () => {
  it('lists the centros poblados of both districts with a source for each input', () => {
    expect(independencia).toHaveLength(144);
    expect(data.centros.filter((c) => c.district === 'huaraz')).toHaveLength(168);
    for (const s of Object.values(data.sources)) expect(s.url).toMatch(/^https:\/\//);
  });

  it('keeps every index between 0 and 100 and every point near Huaraz', () => {
    for (const c of data.centros) {
      expect(c.indice).toBeGreaterThanOrEqual(0);
      expect(c.indice).toBeLessThanOrEqual(100);
      expect(c.lon).toBeGreaterThan(-77.8);
      expect(c.lon).toBeLessThan(-77.2);
      expect(c.lat).toBeGreaterThan(-9.8);
      expect(c.lat).toBeLessThan(-9.3);
    }
  });

  it('joins the 2017 census without exceeding the district totals', () => {
    const pop = independencia.reduce((n, c) => n + (c.pop ?? 0), 0);
    expect(pop).toBeLessThanOrEqual(data.totals2017.independencia);
    expect(pop).toBeGreaterThan(data.totals2017.independencia * 0.95);
    const centenario = data.centros.find((c) => c.code === '0201050001')!;
    expect(centenario.area).toBe('urbano');
    expect(centenario.pop).toBe(60_683);
  });
});

describe('3D columns', () => {
  it('makes the column taller with a larger gap and wider with more people', () => {
    expect(columnHeightM(100)).toBeGreaterThan(columnHeightM(10));
    expect(columnHeightM(0)).toBeGreaterThan(0);
    expect(columnSideM(60_000)).toBeGreaterThan(columnSideM(20));
    expect(columnSideM(null)).toBe(columnSideM(0));
  });

  it('draws one closed square per centro poblado, centred on its point', () => {
    const fc = toColumns(data.centros);
    expect(fc.features).toHaveLength(data.centros.length);
    const f = fc.features[0]!;
    const ring = f.geometry.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const c = data.centros[0]!;
    const cx = (ring[0]![0]! + ring[2]![0]!) / 2;
    const cy = (ring[0]![1]! + ring[2]![1]!) / 2;
    expect(cx).toBeCloseTo(c.lon, 5);
    expect(cy).toBeCloseTo(c.lat, 5);
    expect(f.properties.height).toBe(columnHeightM(c.indice));
    expect(f.properties.color).toBe(gapColor(c.indice));
  });

  it('colours the gap on a sequential scale', () => {
    expect(gapColor(0)).toBe(GAP_STOPS[0]![1]);
    expect(gapColor(100)).toBe(GAP_STOPS[GAP_STOPS.length - 1]![1]);
    expect(gapColor(-5)).toBe(gapColor(0));
  });

  it('shows the inputs of the index in the popup, escaped', () => {
    const c = { ...data.centros[0]!, name: '<b>X</b>' };
    const html = centroPopup(c);
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).toContain('4G');
    expect(html).toContain('km');
  });
});

describe('camera tour', () => {
  const stops = tourStops(data.centros);

  it('goes from the urban centre to the villages with the largest gaps and ends at the lake', () => {
    expect(stops[0]!.label).toContain('Centenario');
    expect(stops.at(-1)!.center).toEqual(LAKE_POINT);
    const villages = stops.slice(1, -1);
    expect(villages.length).toBe(3);
    const ids = villages.map((s) => data.centros.find((c) => c.code === s.code)!);
    for (const c of ids) {
      expect(c.district).toBe('independencia');
      expect(c.area).toBe('rural');
    }
    expect(ids[0]!.indice).toBeGreaterThanOrEqual(ids[1]!.indice);
  });
});
