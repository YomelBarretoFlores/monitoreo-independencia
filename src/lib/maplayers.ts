// Map layer catalog (no DOM): base map choices and the CENEPRED risk overlays.

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_CREDIT =
  'Mapa base © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> y colaboradores';

export interface Basemap {
  id: 'oficial' | 'satelite' | 'relieve' | 'calles';
  label: string;
  /** XYZ tile URLs drawn bottom to top; empty for the official vector map (no third-party tiles) */
  tiles: string[];
  attribution: string;
  /** Imagery is dark: labels drawn on top need a light halo */
  dark?: boolean;
}

export const BASEMAPS: readonly Basemap[] = [
  { id: 'oficial', label: 'Oficial', tiles: [], attribution: '' },
  {
    id: 'satelite',
    label: 'Satélite',
    tiles: [
      `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
      `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    ],
    attribution: `Imágenes © Esri, Maxar, Earthstar Geographics y colaboradores`,
    dark: true,
  },
  {
    id: 'relieve',
    label: 'Relieve',
    tiles: [`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`],
    attribution: ESRI_CREDIT,
  },
  {
    id: 'calles',
    label: 'Calles',
    tiles: [`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`],
    attribution: ESRI_CREDIT,
  },
];

const CENEPRED = 'https://sigrid.cenepred.gob.pe/arcgis/rest/services/FEN/ER_NINO2027_BD/MapServer';

/** Official CENEPRED legend (colors read from the service's /legend swatches, 2026-11-08) */
const SUSCEPTIBILITY: [string, string][] = [
  ['Muy bajo', '#37a800'],
  ['Bajo', '#99e600'],
  ['Medio', '#ffff00'],
  ['Alto', '#ffa900'],
  ['Muy alto', '#ff0000'],
];

export interface RiskLayer {
  id: 'movimientos' | 'inundaciones';
  /** Sublayer id in the CENEPRED MapServer */
  layer: number;
  label: string;
  hint: string;
  legend: [string, string][];
}

export const RISK_LAYERS: readonly RiskLayer[] = [
  {
    id: 'movimientos',
    layer: 2,
    label: 'Movimientos en masa',
    hint: 'Huaicos y deslizamientos',
    legend: SUSCEPTIBILITY,
  },
  {
    id: 'inundaciones',
    layer: 1,
    label: 'Inundaciones',
    hint: 'Desborde de ríos y quebradas',
    legend: SUSCEPTIBILITY,
  },
];

export const RISK_CREDIT =
  'Susceptibilidad: <a href="https://sigrid.cenepred.gob.pe/" target="_blank" rel="noopener">CENEPRED</a>, escenario El Niño 2027';

/**
 * CENEPRED's map service has no tile cache or WMS: each tile is one export request.
 * MapLibre fills `{bbox-epsg-3857}` with the tile's Web Mercator bounds.
 */
export function riskTileTemplate(layer: number): string {
  const q = new URLSearchParams({
    bboxSR: '3857',
    imageSR: '3857',
    size: '256,256',
    layers: `show:${layer}`,
    transparent: 'true',
    format: 'png32',
    f: 'image',
  });
  // the placeholder must stay literal (URLSearchParams would escape its braces)
  return `${CENEPRED}/export?bbox={bbox-epsg-3857}&${q}`;
}

/** Elevation for the 3D view: AWS Terrain Tiles (Mapzen terrarium encoding, public, no key). */
export const TERRAIN = {
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium' as const,
  tileSize: 256,
  maxzoom: 15,
  attribution:
    'Relieve: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a> (Mapzen, AWS)',
  /** Vertical exaggeration: the valley floor reads better slightly stretched */
  exaggeration: 1.4,
};
