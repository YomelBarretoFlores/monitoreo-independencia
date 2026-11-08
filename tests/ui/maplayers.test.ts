// Map layers: base map choices, the CENEPRED risk overlays (ArcGIS export per tile) and terrain.
import { describe, expect, it } from 'vitest';
import { BASEMAPS, RISK_LAYERS, riskTileTemplate, TERRAIN } from '../../src/lib/maplayers.ts';

describe('riskTileTemplate', () => {
  it('asks CENEPRED for one transparent 256 px PNG of the layer per tile, in Web Mercator', () => {
    const template = riskTileTemplate(2);
    // MapLibre substitutes the literal placeholder with each tile's bounds
    expect(template).toContain('bbox={bbox-epsg-3857}&');
    const url = new URL(template.replace('{bbox-epsg-3857}', '0,0,1,1'));
    expect(url.origin + url.pathname).toBe(
      'https://sigrid.cenepred.gob.pe/arcgis/rest/services/FEN/ER_NINO2027_BD/MapServer/export',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bbox: '0,0,1,1',
      layers: 'show:2',
      bboxSR: '3857',
      imageSR: '3857',
      size: '256,256',
      transparent: 'true',
      format: 'png32',
      f: 'image',
    });
  });
});

describe('TERRAIN', () => {
  it('uses keyless terrarium elevation tiles with an attribution', () => {
    expect(TERRAIN.tiles).toEqual([
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    ]);
    expect(TERRAIN.encoding).toBe('terrarium');
    expect(TERRAIN.attribution).toMatch(/Terrain Tiles/);
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
