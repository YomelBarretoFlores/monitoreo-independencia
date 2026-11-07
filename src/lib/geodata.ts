import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import districtsRaw from '../../data/huaraz-districts.geojson?raw';
import riversRaw from '../../data/rivers.geojson?raw';

// Official static map layers built by scripts/build-official-geo.ts:
// IGN district boundaries of Huaraz province and ANA rivers. Provenance is in each feature.

export const INDEPENDENCIA = '020105';

export const districts = JSON.parse(districtsRaw) as FeatureCollection<Polygon | MultiPolygon>;
export const rivers = JSON.parse(riversRaw) as FeatureCollection<LineString | MultiLineString>;

export const district = districts.features.find((f) => f.properties?.ubigeo === INDEPENDENCIA) ?? null;

export const GEO_CREDITS =
  'Límites distritales: Instituto Geográfico Nacional (IGN), vía HDX COD-AB Perú (CC BY-IGO). Ríos y lagunas: Autoridad Nacional del Agua (ANA), GeoSNIRH.';
