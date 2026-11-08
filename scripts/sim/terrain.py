"""Terrain and flow path for the Palcacocha alluvion simulator.

Downloads AWS Terrain Tiles (terrarium PNG, public, no key) over the valley from Laguna
Palcacocha to the río Santa at Huaraz, mosaics them, and writes:

- elevation.glb: little-endian uint16 elevations in metres, row-major, north row first,
  resampled to a coarse grid for the 3D mesh. The .glb extension is only how the teardown kit's
  bundler recognises a binary asset (inline base64 in the film, a file next to the live page);
  the content is not glTF;
- terrain.json: grid size, bounds, elevation range and the flow path.

The flow path is not drawn by hand. It follows steepest descent on the full-resolution
DEM, after priority-flood depression filling with a small epsilon so flats drain, starting
at the lake and ending where it meets the río Santa valley floor.

Run (inside the geopdf venv, which has numpy and opencv):
    python scripts/sim/terrain.py --out sims/palcacocha-shared
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import box, shape

DATA = Path(__file__).resolve().parents[2] / "data"

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ZOOM = 13
# lon/lat bounds: Palcacocha (NE) to the Quillcay mouth at the río Santa (SW)
WEST, EAST, SOUTH, NORTH = -77.56, -77.355, -9.555, -9.375
# coarse mesh step in degrees (~77 m)
MESH_STEP = 0.0007
LAKE = (-77.3791, -9.3957)  # lon, lat: centre of the lake (data/lagunas.json)
# the trace stops on the río Santa floor; Huaraz's Plaza de Armas sits near 3 050 m
SANTA_MAX_ELEV = 3045.0
SANTA_MAX_LON = -77.53
EPS = 1e-3
HAZARD = DATA / "safe-zones/hazard.geojson"


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2**z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile_to_lonlat(x: float, y: float, z: int) -> tuple[float, float]:
    n = 2**z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


def fetch(url: str) -> np.ndarray:
    req = urllib.request.Request(url, headers={"User-Agent": "monitoreo-independencia terrain build"})
    with urllib.request.urlopen(req, timeout=30) as r:
        buf = np.frombuffer(r.read(), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)  # BGR
    b, g, rr = (img[..., i].astype(np.float64) for i in range(3))
    return rr * 256 + g + b / 256 - 32768


def mosaic() -> tuple[np.ndarray, tuple[float, float, float, float]]:
    """Full-resolution DEM over the bounds, plus its exact tile-aligned pixel origin."""
    x0, y0 = lonlat_to_tile(WEST, NORTH, ZOOM)
    x1, y1 = lonlat_to_tile(EAST, SOUTH, ZOOM)
    tx = range(int(x0), int(x1) + 1)
    ty = range(int(y0), int(y1) + 1)
    rows = [np.hstack([fetch(TILE_URL.format(z=ZOOM, x=x, y=y)) for x in tx]) for y in ty]
    full = np.vstack(rows)
    return full, (tx.start, ty.start, x0, y0)


def sample(full: np.ndarray, origin, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Bilinear sample of the mosaic at lon/lat."""
    tx0, ty0, *_ = origin
    n = 2**ZOOM
    px = ((lon + 180) / 360 * n - tx0) * 256
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - ty0) * 256
    return cv2.remap(full.astype(np.float32), px.astype(np.float32), py.astype(np.float32), cv2.INTER_LINEAR)


def fill_depressions(dem: np.ndarray) -> np.ndarray:
    """Priority-flood with epsilon (Barnes et al. 2014): every cell drains to the border."""
    h, w = dem.shape
    out = dem.copy()
    seen = np.zeros_like(dem, dtype=bool)
    heap: list[tuple[float, int, int]] = []
    for r in range(h):
        for c in (0, w - 1):
            heapq.heappush(heap, (out[r, c], r, c))
            seen[r, c] = True
    for c in range(1, w - 1):
        for r in (0, h - 1):
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


def inside(pt: tuple[float, float], ring: list) -> bool:
    """Ray casting point-in-polygon on one ring."""
    x, y = pt
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def quillcay_rings() -> list:
    """Outer rings of the Quillcay hazard polygons (the official map's flood extent)."""
    rings = []
    for f in json.loads(HAZARD.read_text())["features"]:
        if f["properties"].get("basin") != "quillcay":
            continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        rings += [[tuple(p[:2]) for p in poly[0]] for poly in polys]
    return rings


def rings_of(geom, tol: float) -> list:
    """Exterior rings of a (multi)polygon, simplified and rounded to 5 decimals."""
    g = geom.simplify(tol, preserve_topology=True)
    polys = [g] if g.geom_type == "Polygon" else list(getattr(g, "geoms", []))
    return [[[round(x, 5), round(y, 5)] for x, y in p.exterior.coords] for p in polys if not p.is_empty]


def overlays() -> dict:
    """Map layers the simulator draws on the terrain, from the app's own data files."""
    window = box(WEST, SOUTH, EAST, NORTH)
    hazard = {}
    for f in json.loads(HAZARD.read_text())["features"]:
        if f["properties"].get("basin") == "quillcay":
            hazard[f["properties"]["level"]] = rings_of(shape(f["geometry"]).intersection(window), 0.00003)
    boundary = rings_of(shape(json.loads((DATA / "boundary.geojson").read_text())["geometry"]), 0.0002)
    santa = []
    for f in json.loads((DATA / "rivers.geojson").read_text())["features"]:
        if f["properties"]["name"] == "Río Santa":
            g = shape(f["geometry"]).intersection(window).simplify(0.0001)
            for line in [g] if g.geom_type == "LineString" else list(getattr(g, "geoms", [])):
                santa.append([[round(x, 5), round(y, 5)] for x, y in line.coords])
    safe = [
        [round(c, 5) for c in f["geometry"]["coordinates"][:2]] + [f["properties"]["kind"]]
        for f in json.loads((DATA / "safe-zones/points.geojson").read_text())["features"]
        if f["properties"]["basin"] == "quillcay" and f["properties"]["group"] == "seguro"
    ]
    return {"hazard": hazard, "boundary": boundary, "santa": santa, "safe": safe}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    full, origin = mosaic()
    tx0, ty0, *_ = origin
    lon_of = lambda c: tile_to_lonlat(tx0 + (c + 0.5) / 256, 0, ZOOM)[0]
    lat_of = lambda r: tile_to_lonlat(0, ty0 + (r + 0.5) / 256, ZOOM)[1]

    # crop the mosaic to the bounds (flow is traced inside the same window as the mesh)
    fx0, fy0 = lonlat_to_tile(WEST, NORTH, ZOOM)
    fx1, fy1 = lonlat_to_tile(EAST, SOUTH, ZOOM)
    c0, r0 = int((fx0 - tx0) * 256), int((fy0 - ty0) * 256)
    c1, r1 = int((fx1 - tx0) * 256), int((fy1 - ty0) * 256)
    dem = full[r0:r1, c0:c1]
    filled = fill_depressions(dem)

    lx, ly = lonlat_to_tile(*LAKE, ZOOM)
    start = (int((ly - ty0) * 256) - r0, int((lx - tx0) * 256) - c0)

    def stop(r: int, c: int) -> bool:
        return dem[r, c] <= SANTA_MAX_ELEV and lon_of(c + c0) <= SANTA_MAX_LON

    cells = trace(filled, start, stop)
    pts = [(lon_of(c + c0), lat_of(r + r0), float(dem[r, c])) for r, c in cells]
    # thin the path to about one vertex per 60 m, keeping the ends
    thin = [pts[0]]
    for p in pts[1:-1]:
        q = thin[-1]
        if math.hypot((p[0] - q[0]) * 109_800, (p[1] - q[1]) * 110_600) >= 60:
            thin.append(p)
    thin.append(pts[-1])
    seg = lambda a, b: math.hypot((b[0] - a[0]) * 109_800, (b[1] - a[1]) * 110_600)
    length = sum(seg(a, b) for a, b in zip(pts, pts[1:]))
    # distance along the path of each kept vertex, and where the path enters the official hazard map
    along = [0.0]
    for a, b in zip(thin, thin[1:]):
        along.append(along[-1] + seg(a, b))
    rings = quillcay_rings()
    entrance = next(i for i, p in enumerate(thin) if any(inside(p[:2], r) for r in rings))

    lons = np.arange(WEST, EAST + 1e-9, MESH_STEP)
    lats = np.arange(NORTH, SOUTH - 1e-9, -MESH_STEP)
    glon, glat = np.meshgrid(lons, lats)
    mesh = sample(full, origin, glon, glat)
    elev = np.clip(np.round(mesh), 0, 65535).astype("<u2")
    (args.out / "elevation.glb").write_bytes(elev.tobytes())
    meta = {
        "source": "AWS Terrain Tiles (Mapzen terrarium), zoom 13, https://registry.opendata.aws/terrain-tiles/",
        "method": "Mesh: bilinear resample of the zoom-13 mosaic. Flow path: steepest descent on the full-resolution DEM after priority-flood filling, from the lake centre to the río Santa floor.",
        "bounds": [WEST, SOUTH, EAST, NORTH],
        "step": MESH_STEP,
        "cols": len(lons),
        "rows": len(lats),
        "elev": [int(elev.min()), int(elev.max())],
        "lake": list(LAKE),
        "path": [[round(a, 5), round(b, 5), round(z), round(d)] for (a, b, z), d in zip(thin, along)],
        "pathLengthM": round(along[-1]),
        "entranceM": round(along[entrance]),
        "entranceNote": "First path vertex inside the Quillcay hazard map (Mapa de zonas seguras Huaraz–Independencia).",
        "overlays": overlays(),
    }
    (args.out / "terrain.json").write_text(json.dumps(meta, separators=(",", ":")) + "\n")
    print(f"mesh {meta['cols']}x{meta['rows']} elev {meta['elev']} path {len(thin)} pts {along[-1]/1000:.1f} km (raw {length/1000:.1f}), entrance {meta['entranceM']} m at {thin[entrance]}, ends at {thin[-1]}")


if __name__ == "__main__":
    main()
