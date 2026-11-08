// Map layers: base map choices and the CENEPRED risk overlays (ArcGIS export per tile).
import { describe, expect, it } from 'vitest';
import { BASEMAPS, RISK_LAYERS, riskTileUrl, tileBbox3857 } from '../../src/lib/maplayers.ts';

const E = 20037508.342789244;

describe('tileBbox3857', () => {
  it('covers the whole world at zoom 0 and the north-west quarter for tile 0/0 at zoom 1', () => {
    const z0 = tileBbox3857(0, 0, 0);
    expect(z0.map((v) => Math.round(v))).toEqual([-E, -E, E, E].map(Math.round));
    const z1 = tileBbox3857(0, 0, 1);
    expect(z1.map((v) => Math.round(v))).toEqual([-E, 0, 0, E].map(Math.round));
  });
});

describe('riskTileUrl', () => {
  it('asks CENEPRED for one transparent 256 px PNG of the layer over the tile, in Web Mercator', () => {
    const url = new URL(riskTileUrl(2, 0, 0, 1));
    expect(url.origin + url.pathname).toBe(
      'https://sigrid.cenepred.gob.pe/arcgis/rest/services/FEN/ER_NINO2027_BD/MapServer/export',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      layers: 'show:2',
      bboxSR: '3857',
      imageSR: '3857',
      size: '256,256',
      transparent: 'true',
      format: 'png32',
      f: 'image',
    });
    expect(url.searchParams.get('bbox')!.split(',').map(Number).map(Math.round)).toEqual(
      [-E, 0, 0, E].map(Math.round),
    );
  });
});

describe('BASEMAPS', () => {
  it('offers the official vector map plus satellite, terrain and streets', () => {
    expect(BASEMAPS.map((b) => [b.id, b.label])).toEqual([
      ['oficial', 'Oficial'],
      ['satelite', 'Satélite'],
      ['relieve', 'Relieve'],
      ['calles', 'Calles'],
    ]);
    expect(BASEMAPS[0]!.tiles).toEqual([]);
    for (const b of BASEMAPS.slice(1)) {
      expect(b.tiles.length).toBeGreaterThan(0);
      for (const t of b.tiles) expect(t).toMatch(/^https:\/\/.+\{z\}\/\{y\}\/\{x\}$/);
      expect(b.attribution).toMatch(/Esri/);
    }
  });
});

describe('RISK_LAYERS', () => {
  it('lists both CENEPRED susceptibility maps with the official five-class legend', () => {
    expect(RISK_LAYERS.map((r) => [r.id, r.layer, r.label])).toEqual([
      ['movimientos', 2, 'Movimientos en masa'],
      ['inundaciones', 1, 'Inundaciones'],
    ]);
    for (const r of RISK_LAYERS)
      expect(r.legend).toEqual([
        ['Muy bajo', '#37a800'],
        ['Bajo', '#99e600'],
        ['Medio', '#ffff00'],
        ['Alto', '#ffa900'],
        ['Muy alto', '#ff0000'],
      ]);
  });
});
