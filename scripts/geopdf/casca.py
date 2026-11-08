"""Casca map (INAIGEM, ArcGIS Pro): every layer is vector and named (PDF optional content)."""

from __future__ import annotations

import re
from collections import defaultdict

import pymupdf
from shapely import make_valid
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from common import area_m2, distance_m, feature, fill_polygon, stroke_line, tidy
from georef import Georef, fit, page_viewports, utm_to_lonlat

BASIN = "casca"
HAZARD_FILL = {(255, 0, 0): "muy-alto", (255, 170, 0): "alto", (255, 255, 0): "medio"}
EXPOSED_FILL = {(0, 132, 168): "educacion", (201, 49, 0): "salud", (113, 201, 110): "estadio"}
ROUTE_STROKE = (85, 255, 0)  # inner line of the two-stroke route symbol
HATCH_STROKE = (115, 255, 223)  # safe-zone hatch; its clip path is the zone outline
TABLE_ROW = re.compile(
    r"^(ZS-\d+) ([\d.]+) (\d+) min (\d+) min ([\d,]+\.\d+) ([\d,]+\.\d+) ([\d,]+\.\d+) ([\d.]+)$"
)
MAX_TABLE_OFFSET_M = 60


def _rgb(c) -> tuple[int, int, int] | None:
    return tuple(round(v * 255) for v in c) if c else None


def _num(text: str) -> float:
    return float(text.replace(",", ""))


def read_table(page: pymupdf.Page, drawings: list[dict]) -> list[dict]:
    frame = [d["rect"] for d in drawings if d.get("layer") == "Table Frame"]
    x0, y0 = min(r.x0 for r in frame), min(r.y0 for r in frame)
    x1, y1 = max(r.x1 for r in frame), max(r.y1 for r in frame)
    lines: dict[int, list] = defaultdict(list)
    for w in page.get_text("words"):
        if x0 <= w[0] <= x1 and y0 <= w[1] <= y1:
            lines[round(w[3])].append(w)
    rows = []
    for key in sorted(lines):
        text = " ".join(w[4] for w in sorted(lines[key], key=lambda w: w[0]))
        m = TABLE_ROW.match(text)
        if m:
            zid, area, tmax, tavg, east, north, alt, infl = m.groups()
            rows.append(
                {
                    "id": zid,
                    "areaHa": float(area),
                    "maxEvacMin": int(tmax),
                    "avgEvacMin": int(tavg),
                    "altitudeM": round(_num(alt), 1),
                    "influenceHa": float(infl),
                    "point": utm_to_lonlat(_num(east), _num(north)),
                }
            )
    return rows


def _zone_outlines(drawings_ext: list[dict], georef: Georef) -> list[Polygon]:
    """Clip paths that shape the safe-zone hatch, deduplicated."""
    stack: list[tuple[int, int]] = []
    seen: set[int] = set()
    shapes = []
    for i, d in enumerate(drawings_ext):
        level = d.get("level", 0)
        while stack and stack[-1][0] >= level:
            stack.pop()
        if d["type"] == "clip":
            stack.append((level, i))
            continue
        if d["type"] == "group" or not stack or _rgb(d.get("color")) != HATCH_STROKE:
            continue
        clip = stack[-1][1]
        if clip in seen:
            continue
        seen.add(clip)
        shapes.append(fill_polygon(drawings_ext[clip]["items"], georef))
    unique: dict[tuple, object] = {}
    for s in shapes:
        if not s.is_empty:
            unique.setdefault(tuple(round(v, 6) for v in s.bounds), s)
    return list(unique.values())


GAP_DEG = 3 / 110_574  # ~3 m: wider than the gaps between outline segments


MAX_INFLUENCE_AREA_ERR = 0.05  # the table's influence area must match within 5 %
MAX_INFLUENCE_DISTANCE_M = 400


def _enclosed_areas(lines) -> list[Polygon]:
    """Areas enclosed by a broken outline (empty for open strokes)."""
    holes = [Polygon(h) for poly in _polys(lines.buffer(GAP_DEG)) for h in poly.interiors]
    return [make_valid(h.buffer(GAP_DEG, join_style="mitre")) for h in holes if area_m2(h) >= 10]


def _polys(geom):
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


def extract(path: str) -> tuple[dict[str, list[dict]], dict]:
    doc = pymupdf.open(path)
    page = doc[0]
    vp = page_viewports(doc, page)[0]
    georef = fit(vp, page.rect.height)
    drawings = page.get_drawings()
    by_layer: dict[str, list[dict]] = defaultdict(list)
    for d in drawings:
        by_layer[d.get("layer") or ""].append(d)

    # hazard levels, dissolved per level
    hazard_parts: dict[str, list] = defaultdict(list)
    for d in by_layer["Peligro"]:
        level = HAZARD_FILL.get(_rgb(d.get("fill")))
        if level:
            hazard_parts[level].append(fill_polygon(d["items"], georef))
    hazard = [
        feature(tidy(unary_union(parts), min_area_m2=5), {"basin": BASIN, "level": level})
        for level, parts in hazard_parts.items()
    ]

    # safe zones: outlines matched to the table rows by their coordinates
    rows = read_table(page, drawings)
    outlines = _zone_outlines(page.get_drawings(extended=True), georef)
    parts_by_zone: dict[str, list] = defaultdict(list)
    unmatched = 0
    for shape in outlines:
        best = min(rows, key=lambda r: distance_m(shape, Point(r["point"])))
        if distance_m(shape, Point(best["point"])) <= MAX_TABLE_OFFSET_M:
            parts_by_zone[best["id"]].append(shape)
        else:
            unmatched += 1
    zones, checks = [], []
    for row in rows:
        parts = parts_by_zone.get(row["id"])
        props = {k: v for k, v in row.items() if k != "point"} | {"basin": BASIN}
        if parts:
            geom = tidy(unary_union(parts))
            checks.append((row["id"], round(area_m2(geom) / 10_000, 3), row["areaHa"]))
        else:
            geom = Point(row["point"])  # outline not found: keep the table point
        zones.append(feature(geom, props))

    # influence areas: purple outlines drawn as many short segments; close the gaps and
    # take the enclosed area, then attach it to the zone whose table point it contains
    candidates = []
    for d in by_layer["Área de Influencia"]:
        candidates += _enclosed_areas(stroke_line(d["items"], georef))
    influence, influence_checks = [], []
    used: set[int] = set()
    for row in rows:
        zone_geom = Point(row["point"])
        best, best_err = None, MAX_INFLUENCE_AREA_ERR
        for i, cand in enumerate(candidates):
            if i in used or distance_m(cand, zone_geom) > MAX_INFLUENCE_DISTANCE_M:
                continue
            err = abs(area_m2(cand) / 10_000 - row["influenceHa"]) / row["influenceHa"]
            if err < best_err:
                best, best_err = i, err
        if best is not None:
            used.add(best)
            area = candidates[best]
            influence.append(feature(tidy(area), {"basin": BASIN, "zone": row["id"]}))
            influence_checks.append((row["id"], round(area_m2(area) / 10_000, 3), row["influenceHa"]))

    routes = [
        feature(tidy(stroke_line(d["items"], georef)), {"basin": BASIN})
        for d in by_layer["Ruta Evacuación Elem. Expuesto"]
        if d["type"] == "s" and _rgb(d.get("color")) == ROUTE_STROKE
    ]

    exposed = []
    for d in by_layer["Elementos Expuestos"]:
        kind = EXPOSED_FILL.get(_rgb(d.get("fill")))
        if kind:
            r = d["rect"]  # map pin: the location is the tip, bottom centre
            exposed.append(feature(Point(georef((r.x0 + r.x1) / 2, r.y1)), {"basin": BASIN, "group": "expuesto", "kind": kind}))

    report = {
        "georefResidualM": round(georef.residual_m, 2),
        "tableRows": len(rows),
        "zoneOutlines": len(outlines),
        "unmatchedOutlines": unmatched,
        "zonesWithoutOutline": [r["id"] for r in rows if r["id"] not in parts_by_zone],
        "areaCheckHa": checks,
        "hazard": {k: len(v) for k, v in hazard_parts.items()},
        "influenceCheckHa": influence_checks,
        "routes": len(routes),
        "exposed": len(exposed),
    }
    return {"hazard": hazard, "zones": zones, "influence": influence, "routes": routes, "points": exposed}, report
