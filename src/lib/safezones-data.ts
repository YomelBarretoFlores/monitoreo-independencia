import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import arrowsRaw from '../../data/safe-zones/arrows.geojson?raw';
import exposureRaw from '../../data/safe-zones/exposure.json?raw';
import hazardRaw from '../../data/safe-zones/hazard.geojson?raw';
import influenceRaw from '../../data/safe-zones/influence.geojson?raw';
import pointsRaw from '../../data/safe-zones/points.geojson?raw';
import routesRaw from '../../data/safe-zones/routes.geojson?raw';
import zonesRaw from '../../data/safe-zones/zones.geojson?raw';
import type { ArrowProps, Basin, HazardProps, ParcelExposure, PlaceProps, ZoneProps } from './safezones.ts';

// The safe-zone layers (built by scripts/geopdf/extract.py). Imported only by the lazy map
// chunk, so these ~400 kB (≈100 kB gzipped) never weigh on the other views.

type Area = Polygon | MultiPolygon;
type Uid = { uid: number };

export interface SafeZoneData {
  hazard: FeatureCollection<Area, HazardProps & Uid>;
  zones: FeatureCollection<Area | Point, ZoneProps & Uid>;
  influence: FeatureCollection<Area, { basin: Basin; zone: string }>;
  routes: FeatureCollection<LineString | MultiLineString, { basin: Basin } & Uid>;
  points: FeatureCollection<Point, PlaceProps & Uid>;
  arrows: FeatureCollection<Point, ArrowProps & Uid>;
  /** Casca parcels per hazard level, and the counting rule */
  exposure: { parcels: ParcelExposure; rule: string };
}

/** Numbers every feature (uid = index) so the map can show a subset with a cheap `in` filter. */
function withUids<G extends Area | Point | LineString | MultiLineString, P>(
  raw: string,
): FeatureCollection<G, P & Uid> {
  const fc = JSON.parse(raw) as FeatureCollection<G, P & Uid>;
  fc.features.forEach((f, i) => {
    f.properties.uid = i;
  });
  return fc;
}

export function loadSafeZoneData(): SafeZoneData {
  return {
    hazard: withUids<Area, HazardProps>(hazardRaw),
    zones: withUids<Area | Point, ZoneProps>(zonesRaw),
    influence: JSON.parse(influenceRaw),
    routes: withUids<LineString | MultiLineString, { basin: Basin }>(routesRaw),
    points: withUids<Point, PlaceProps>(pointsRaw),
    arrows: withUids<Point, ArrowProps>(arrowsRaw),
    exposure: (JSON.parse(exposureRaw) as { casca: SafeZoneData['exposure'] }).casca,
  };
}
