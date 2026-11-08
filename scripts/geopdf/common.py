"""Geometry helpers shared by the two extractors: PDF paths -> shapely, GeoJSON output."""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Sequence
from pathlib import Path

import numpy as np
from shapely import make_valid
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from georef import Georef

# ~1 m at Huaraz latitude: a 0.2 mm line on the 1:5 500 map is already 1.1 m wide
SIMPLIFY_DEG = 0.000009
DECIMALS = 6
_LAT0 = math.radians(-9.5)
M_PER_DEG_LON = 111_320 * math.cos(_LAT0)
M_PER_DEG_LAT = 110_574


def subpaths(items: Sequence[tuple]) -> list[list[tuple[float, float]]]:
    """Split PyMuPDF drawing items into continuous point sequences."""
    out: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for item in items:
        kind = item[0]
        if kind == "re":
            r = item[1]
            out.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            continue
        if kind == "qu":
            q = item[1]
            out.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
            continue
        start, end = item[1], item[-1]  # 'l': p1, p2 ; 'c': p1, c1, c2, p2
        if current and (abs(current[-1][0] - start.x) > 1e-3 or abs(current[-1][1] - start.y) > 1e-3):
            out.append(current)
            current = []
        if not current:
            current.append((start.x, start.y))
        current.append((end.x, end.y))
    if current:
        out.append(current)
    return out


def to_lonlat(points: Sequence[tuple[float, float]], georef: Georef) -> np.ndarray:
    return georef.many(np.asarray(points, dtype=float))


def fill_polygon(items: Sequence[tuple], georef: Georef) -> BaseGeometry:
    """A filled PDF path as a polygon. Holes come from even-odd overlap of the rings."""
    rings = [to_lonlat(r, georef) for r in subpaths(items) if len(r) >= 3]
    shape: BaseGeometry | None = None
    for ring in rings:
        poly = make_valid(Polygon(ring))
        shape = poly if shape is None else shape.symmetric_difference(poly)
    return polygons_only(shape) if shape is not None else MultiPolygon()


def stroke_line(items: Sequence[tuple], georef: Georef) -> BaseGeometry:
    lines = [LineString(to_lonlat(r, georef)) for r in subpaths(items) if len(r) >= 2]
    return MultiLineString(lines) if len(lines) != 1 else lines[0]


def polygons_only(geom: BaseGeometry) -> BaseGeometry:
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    parts = [g for g in getattr(geom, "geoms", []) if isinstance(g, (Polygon, MultiPolygon))]
    return unary_union(parts) if parts else MultiPolygon()


def area_m2(geom: BaseGeometry) -> float:
    """Planar area in m² (local equirectangular scale; error < 0.1 % over a few km)."""
    return geom.area * M_PER_DEG_LON * M_PER_DEG_LAT


def distance_m(a: BaseGeometry, b: BaseGeometry) -> float:
    return a.distance(b) * math.sqrt(M_PER_DEG_LON * M_PER_DEG_LAT)


def tidy(geom: BaseGeometry, min_area_m2: float = 0.0) -> BaseGeometry:
    """Simplify, keep valid, and drop polygon slivers smaller than min_area_m2."""
    geom = make_valid(geom.simplify(SIMPLIFY_DEG, preserve_topology=True))
    if isinstance(geom, (Polygon, MultiPolygon)) or hasattr(geom, "geoms"):
        polys = [p for p in _iter_polygons(geom) if area_m2(p) >= min_area_m2]
        if polys or isinstance(geom, (Polygon, MultiPolygon)):
            return unary_union(polys) if polys else MultiPolygon()
    return geom


def _iter_polygons(geom: BaseGeometry) -> Iterable[Polygon]:
    if isinstance(geom, Polygon):
        yield geom
    elif hasattr(geom, "geoms"):
        for g in geom.geoms:
            yield from _iter_polygons(g)


def _round(coords):
    if isinstance(coords, (float, int)):
        return round(float(coords), DECIMALS)
    return [_round(c) for c in coords]


def feature(geom: BaseGeometry, properties: dict) -> dict:
    g = mapping(geom)
    return {"type": "Feature", "properties": properties, "geometry": {"type": g["type"], "coordinates": _round(g["coordinates"])}}


def write_collection(path: Path, features: list[dict], source: dict) -> int:
    """Compact GeoJSON with the provenance as a foreign member; returns bytes written."""
    text = json.dumps({"type": "FeatureCollection", "source": source, "features": features}, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text + "\n", encoding="utf-8")
    return len(text.encode("utf-8"))
