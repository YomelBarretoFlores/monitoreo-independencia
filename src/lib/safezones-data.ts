import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import hazardRaw from '../../data/safe-zones/hazard.geojson?raw';
import influenceRaw from '../../data/safe-zones/influence.geojson?raw';
import pointsRaw from '../../data/safe-zones/points.geojson?raw';
import routesRaw from '../../data/safe-zones/routes.geojson?raw';
import zonesRaw from '../../data/safe-zones/zones.geojson?raw';
import type { Basin, HazardProps, PlaceProps, ZoneProps } from './safezones.ts';

// The safe-zone layers (built by scripts/geopdf/extract.py). Imported only by the lazy map
// chunk, so these ~380 kB (≈90 kB gzipped) never weigh on the other views.

type Area = Polygon | MultiPolygon;
type Uid = { uid: number };

export interface SafeZoneData {
  hazard: FeatureCollection<Area, HazardProps>;
  zones: FeatureCollection<Area | Point, ZoneProps & Uid>;
  influence: FeatureCollection<Area, { basin: Basin; zone: string }>;
  routes: FeatureCollection<LineString | MultiLineString, { basin: Basin }>;
  points: FeatureCollection<Point, PlaceProps & Uid>;
}

/** Numbers every feature so the map can show a subset with a cheap `in` filter. */
function withUids<G extends Polygon | MultiPolygon | Point, P>(raw: string): FeatureCollection<G, P & Uid> {
  const fc = JSON.parse(raw) as FeatureCollection<G, P & Uid>;
  fc.features.forEach((f, i) => {
    f.properties.uid = i;
  });
  return fc;
}

export function loadSafeZoneData(): SafeZoneData {
  return {
    hazard: JSON.parse(hazardRaw),
    zones: withUids<Area | Point, ZoneProps>(zonesRaw),
    influence: JSON.parse(influenceRaw),
    routes: JSON.parse(routesRaw),
    points: withUids<Point, PlaceProps>(pointsRaw),
  };
}
