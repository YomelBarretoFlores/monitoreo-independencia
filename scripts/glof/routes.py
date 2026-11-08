"""Flow routes from the glacial lakes above Huaraz and Independencia down to the río Santa.

For each lake in data/lagunas.json the route follows steepest descent on AWS Terrain Tiles (terrarium,
zoom 13, public, no key), after priority-flood depression filling with a small epsilon so flats drain.
It starts at the lake's centre and stops where it meets the río Santa (ANA line in data/rivers.geojson).
The route is not drawn by hand. Where it enters an official safe-zone hazard map (Quillcay or Casca,
data/safe-zones/hazard.geojson) the distance is kept as the "city entrance".

Writes data/glof/routes.json. Run (geopdf venv: numpy, opencv, shapely):
    python scripts/glof/routes.py
"""

from __future__ import annotations

import heapq
import json
import math
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import Point, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = DATA / "glof/routes.json"
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ZOOM = 13
# lon/lat window: every lake (NE) to the río Santa at Huaraz (W)
WEST, EAST, SOUTH, NORTH = -77.56, -77.32, -9.56, -9.37
EPS = 1e-3
SANTA_REACH_M = 120
KEEP_EVERY_M = 50
M_PER_DEG_LON = 109_800
M_PER_DEG_LAT = 110_600


def lonlat_to_tile(lon: float, lat: float) -> tuple[float, float]:
    n = 2**ZOOM
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def tile_to_lon(x: float) -> float:
    return x / 2**ZOOM * 360 - 180


def tile_to_lat(y: float) -> float:
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2**ZOOM))))


def fetch(x: int, y: int) -> np.ndarray:
    req = urllib.request.Request(TILE_URL.format(z=ZOOM, x=x, y=y), headers={"User-Agent": "monitoreo-independencia glof routes"})
    with urllib.request.urlopen(req, timeout=30) as r:
        img = cv2.imdecode(np.frombuffer(r.read(), dtype=np.uint8), cv2.IMREAD_COLOR)
    b, g, red = (img[..., i].astype(np.float64) for i in range(3))
    return red * 256 + g + b / 256 - 32768


def mosaic() -> tuple[np.ndarray, float, float]:
    """DEM cropped to the window, plus the tile coordinates of its top-left pixel."""
    x0, y0 = lonlat_to_tile(WEST, NORTH)
    x1, y1 = lonlat_to_tile(EAST, SOUTH)
    tx = range(int(x0), int(x1) + 1)
    ty = range(int(y0), int(y1) + 1)
    full = np.vstack([np.hstack([fetch(x, y) for x in tx]) for y in ty])
    c0, r0 = int((x0 - tx.start) * 256), int((y0 - ty.start) * 256)
    c1, r1 = int((x1 - tx.start) * 256), int((y1 - ty.start) * 256)
    return full[r0:r1, c0:c1], tx.start + c0 / 256, ty.start + r0 / 256


def fill_depressions(dem: np.ndarray) -> np.ndarray:
    """Priority-flood with epsilon (Barnes et al. 2014): every cell drains to the border."""
    h, w = dem.shape
    out = dem.copy()
    seen = np.zeros(dem.shape, dtype=bool)
    heap: list[tuple[float, int, int]] = []
    for r in range(h):
        for c in range(w):
            if r in (0, h - 1) or c in (0, w - 1):
                heapq.heappush(heap, (out[r, c], r, c))
                seen[r, c] = True
    while heap:
        z, r, c = heapq.heappop(heap)
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if (dr or dc) and 0 <= rr < h and 0 <= cc < w and not seen[rr, cc]:
                    seen[rr, cc] = True
                    out[rr, cc] = max(out[rr, cc], z + EPS)
                    heapq.heappush(heap, (out[rr, cc], rr, cc))
    return out


def trace(filled: np.ndarray, start: tuple[int, int], stop) -> list[tuple[int, int]]:
    """Steepest descent (D8, distance-weighted) from start until stop(r, c) or a border."""
    h, w = filled.shape
    r, c = start
    path = [(r, c)]
    while not stop(r, c):
        best, nxt = 0.0, None
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if (dr or dc) and 0 <= rr < h and 0 <= cc < w:
                    drop = (filled[r, c] - filled[rr, cc]) / math.hypot(dr, dc)
                    if drop > best:
                        best, nxt = drop, (rr, cc)
        if nxt is None:
            break
        r, c = nxt
        path.append(nxt)
    return path


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot((b[0] - a[0]) * M_PER_DEG_LON, (b[1] - a[1]) * M_PER_DEG_LAT)


def main() -> None:
    dem, ox, oy = mosaic()
    filled = fill_depressions(dem)
    lon_of = lambda c: tile_to_lon(ox + (c + 0.5) / 256)
    lat_of = lambda r: tile_to_lat(oy + (r + 0.5) / 256)

    santa = unary_union([
        shape(f["geometry"]) for f in json.loads((DATA / "rivers.geojson").read_text())["features"] if f["properties"]["name"] == "Río Santa"
    ])
    santa_reach = SANTA_REACH_M / M_PER_DEG_LAT
    hazard = {}
    for f in json.loads((DATA / "safe-zones/hazard.geojson").read_text())["features"]:
        hazard.setdefault(f["properties"]["basin"], []).append(shape(f["geometry"]))
    hazard = {basin: unary_union(geoms) for basin, geoms in hazard.items()}

    lakes = json.loads((DATA / "lagunas.json").read_text())["lagunas"]
    routes = {}
    for lake in lakes:
        lat, lon = lake["point"]  # lagunas.json stores [lat, lon]
        lx, ly = lonlat_to_tile(lon, lat)
        start = (int((ly - oy) * 256), int((lx - ox) * 256))
        cells = trace(filled, start, lambda r, c: santa.distance(Point(lon_of(c), lat_of(r))) <= santa_reach)
        pts = [(lon_of(c), lat_of(r), float(dem[r, c])) for r, c in cells]
        kept = [pts[0]]
        for p in pts[1:-1]:
            if metres(kept[-1][:2], p[:2]) >= KEEP_EVERY_M:
                kept.append(p)
        kept.append(pts[-1])
        along = [0.0]
        for a, b in zip(kept, kept[1:]):
            along.append(along[-1] + metres(a[:2], b[:2]))
        entrance = None
        for basin, geom in hazard.items():
            hit = next((i for i, p in enumerate(kept) if geom.contains(Point(p[:2]))), None)
            if hit is not None and (entrance is None or along[hit] < entrance[1]):
                entrance = (basin, along[hit])
        end = kept[-1]
        routes[lake["id"]] = {
            "name": lake["name"],
            "path": [[round(x, 5), round(y, 5), round(z), round(d)] for (x, y, z), d in zip(kept, along)],
            "lengthM": round(along[-1]),
            "entranceM": round(entrance[1]) if entrance else None,
            "entranceMap": entrance[0] if entrance else None,
            "reachesSanta": santa.distance(Point(end[:2])) <= santa_reach,
        }
        print(f"{lake['id']}: {along[-1] / 1000:.1f} km, entrance {entrance}, santa {routes[lake['id']]['reachesSanta']}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "AWS Terrain Tiles (Mapzen terrarium), zoom 13, https://registry.opendata.aws/terrain-tiles/; lakes from data/lagunas.json; río Santa from ANA (data/rivers.geojson)",
        "method": "Steepest descent on the DEM after priority-flood filling, from the lake centre to the río Santa; the entrance is the first vertex inside an official safe-zone hazard map.",
        "routes": routes,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
