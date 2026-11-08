"""Huaraz–Independencia map (Quillcay, ArcMap 10.5): the map body is one 300 dpi raster.

Hazard polygons are vectorized from the raster's flat fill colors. Labels, arrows,
roads and pins drawn over a hazard area take the class of the nearest hazard or
background pixel, so they do not punch holes. Legend, title and credit panels are
vector boxes on top of the raster; they are masked out because the hazard legend
repeats the exact fill colors.
"""

from __future__ import annotations

from collections import defaultdict

import cv2
import numpy as np
import pymupdf
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from common import area_m2, feature, polygons_only, tidy
from georef import Georef, fit, page_viewports

BASIN = "quillcay"
DPI = 300
HAZARD_RGB = {
    "muy-alto": (255, 0, 0),
    "alto": (222, 158, 102),
    "medio": (255, 255, 0),
    "bajo": (34, 139, 34),
}
COLOR_TOLERANCE = 10  # max per-channel difference to count as a palette color
BACKGROUND_MIN = 245  # near-white
THIN_WHITE_PX = 9  # white strokes narrower than ~6 m (label text, halos, block outlines) are overlays
FILL_HOLES_PX = 1500  # ~780 m²: arrow halos and label boxes inside a hazard area
MIN_POLYGON_PX = 200  # ~100 m²
MIN_COMPONENT_PX = 20_000  # ~1 ha: isolated specks are pins or symbols with a similar color
PANEL_MIN_PT2 = 4000  # white boxes larger than this are legend / title / credit panels

BG, UNKNOWN = 0, 255


def render_map(page: pymupdf.Page, bbox: pymupdf.Rect) -> np.ndarray:
    pix = page.get_pixmap(dpi=DPI, clip=bbox, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()


def panel_rects(page: pymupdf.Page, frame: pymupdf.Rect) -> list[pymupdf.Rect]:
    """White boxes drawn over the map frame (not the page or frame background)."""
    rects = []
    frame_area = frame.width * frame.height
    for d in page.get_drawings():
        fill = d.get("fill")
        r = d["rect"]
        area = r.width * r.height
        if fill and all(v > 0.99 for v in fill) and PANEL_MIN_PT2 <= area < 0.5 * frame_area:
            rects.append(r)
    return rects


def classify(img: np.ndarray) -> np.ndarray:
    """0 background, 1..4 hazard level (HAZARD_RGB order), 255 anything else."""
    labels = np.full(img.shape[:2], UNKNOWN, dtype=np.uint8)
    white = (img >= BACKGROUND_MIN).all(axis=2).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (THIN_WHITE_PX, THIN_WHITE_PX))
    labels[cv2.morphologyEx(white, cv2.MORPH_OPEN, kernel) == 1] = BG
    for i, rgb in enumerate(HAZARD_RGB.values(), start=1):
        close = (np.abs(img.astype(np.int16) - np.array(rgb, dtype=np.int16)) <= COLOR_TOLERANCE).all(axis=2)
        labels[close] = i
    return labels


def fill_unknown(labels: np.ndarray) -> np.ndarray:
    """Give every unknown pixel the class of its nearest known pixel."""
    known = (labels != UNKNOWN).astype(np.uint8)
    _, nearest = cv2.distanceTransformWithLabels(1 - known, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(known)
    lut = np.zeros(nearest.max() + 1, dtype=np.uint8)
    # labels of DIST_LABEL_PIXEL follow the scan order of the zero pixels
    lut[1 : len(ys) + 1] = labels[ys, xs]
    return lut[nearest]


def fill_small_holes(labels: np.ndarray) -> np.ndarray:
    """Background islands smaller than FILL_HOLES_PX inside hazard areas take the nearest hazard class."""
    hazard = (labels != BG).astype(np.uint8)
    _, comp, stats, _ = cv2.connectedComponentsWithStats(1 - hazard, connectivity=4)
    x, y, w, h, area = stats.T
    touches_edge = (x == 0) | (y == 0) | (x + w == labels.shape[1]) | (y + h == labels.shape[0])
    small = (area < FILL_HOLES_PX) & ~touches_edge
    small[0] = False  # component 0 is the hazard area itself
    out = labels.copy()
    out[small[comp]] = UNKNOWN
    return fill_unknown(out)


def drop_specks(labels: np.ndarray) -> np.ndarray:
    """Isolated hazard-colored blobs smaller than MIN_COMPONENT_PX become background."""
    hazard = (labels != BG).astype(np.uint8)
    _, comp, stats, _ = cv2.connectedComponentsWithStats(hazard, connectivity=8)
    tiny = stats[:, cv2.CC_STAT_AREA] < MIN_COMPONENT_PX
    tiny[0] = False
    out = labels.copy()
    out[tiny[comp]] = BG
    return out


def vectorize(labels: np.ndarray, to_page) -> dict[str, list[Polygon]]:
    out: dict[str, list[Polygon]] = defaultdict(list)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    for i, level in enumerate(HAZARD_RGB, start=1):
        mask = cv2.morphologyEx((labels == i).astype(np.uint8), cv2.MORPH_OPEN, kernel)
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is None:
            continue
        for idx, (_, _, child, parent) in enumerate(hierarchy[0]):
            if parent != -1 or cv2.contourArea(contours[idx]) < MIN_POLYGON_PX:
                continue
            shell = to_page(contours[idx])
            holes = []
            while child != -1:
                if cv2.contourArea(contours[child]) >= MIN_POLYGON_PX:
                    holes.append(to_page(contours[child]))
                child = hierarchy[0][child][0]
            if len(shell) >= 3:
                out[level].append(Polygon(shell, [h for h in holes if len(h) >= 3]).buffer(0))
    return out


# Safe-place pins (legend "Zonas seguras"): dominant color of each pin, sampled from the legend
PIN_RGB = {
    "acopio": ((184, 94, 255), 40),
    "salud": ((231, 7, 16), 18),
    "comando": ((89, 15, 106), 30),
    "refugio": ((239, 189, 8), 35),
    "seguridad": ((8, 92, 49), 28),
    "animales": ((50, 189, 180), 40),
    "cadaveres": ((2, 2, 0), 25),
}
PIN_WIDTH_PX = (72, 96)  # pins are ~84 x 114 px at 300 dpi
PIN_HEIGHT_PX = (80, 125)  # some pins match by the head only (~90 px)
PIN_TIP_RATIO = 114 / 84  # tip below the top of the pin, as a multiple of its width
BLACK_OPEN_PX = 9  # black pins: drop thin text and arrows touching the pin first
BLACK_REJOIN_PX = 25


def detect_pins(img: np.ndarray) -> list[tuple[str, float, float]]:
    """(kind, x, y) of each pin tip in raster pixels."""
    pins = []
    signed = img.astype(np.int16)
    thin = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (BLACK_OPEN_PX, BLACK_OPEN_PX))
    for kind, (rgb, tol) in PIN_RGB.items():
        mask = (np.abs(signed - np.array(rgb, dtype=np.int16)).max(axis=2) <= tol).astype(np.uint8)
        close = 9
        if max(rgb) < 20:
            # the opening also splits the black head along its white symbol: rejoin with a wider close
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, thin)
            close = BLACK_REJOIN_PX
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((close, close), np.uint8))
        n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for x, y, w, h, area in stats[1:n]:
            fits = PIN_WIDTH_PX[0] <= w <= PIN_WIDTH_PX[1] and PIN_HEIGHT_PX[0] <= h <= PIN_HEIGHT_PX[1]
            if fits and area >= 0.2 * w * h:
                pins.append((kind, x + w / 2, y + PIN_TIP_RATIO * w))
    return pins


def extract(path: str, debug: bool = False) -> tuple[dict[str, list[dict]], dict]:
    doc = pymupdf.open(path)
    page = doc[0]
    vp = page_viewports(doc, page)[0]
    georef: Georef = fit(vp, page.rect.height)
    x0, y0, x1, y1 = vp.bbox
    h = page.rect.height
    frame = pymupdf.Rect(min(x0, x1), h - max(y0, y1), max(x0, x1), h - min(y0, y1))
    img = render_map(page, frame)
    scale = 72 / DPI

    panels = panel_rects(page, frame)
    for r in panels:  # legend, title and credit boxes repeat the map colors
        a = max(0, int((r.x0 - frame.x0) / scale)), max(0, int((r.y0 - frame.y0) / scale))
        b = int((r.x1 - frame.x0) / scale) + 1, int((r.y1 - frame.y0) / scale) + 1
        img[a[1] : b[1], a[0] : b[0]] = 255
    labels = drop_specks(fill_small_holes(fill_unknown(classify(img))))

    def to_lonlat(px: np.ndarray) -> np.ndarray:
        px = px.reshape(-1, 2).astype(float)
        page_pts = np.column_stack([frame.x0 + px[:, 0] * scale, frame.y0 + px[:, 1] * scale])
        return georef.many(page_pts)

    parts = vectorize(labels, to_lonlat)
    hazard = [
        feature(tidy(polygons_only(unary_union(polys)), min_area_m2=100), {"basin": BASIN, "level": level})
        for level, polys in parts.items()
    ]
    pins = detect_pins(img)
    points = [
        feature(Point(to_lonlat(np.array([x, y]))[0]), {"basin": BASIN, "group": "seguro", "kind": kind})
        for kind, x, y in pins
    ]
    report = {
        "georefResidualM": round(georef.residual_m, 2),
        "rasterPx": list(img.shape[:2]),
        "metresPerPx": round(8500 * 0.0254 / DPI, 2),
        "panelsMasked": len(panels),
        "hazardHa": {lvl: round(sum(area_m2(p) for p in polys) / 10_000, 2) for lvl, polys in parts.items()},
        "pins": {k: sum(1 for p in pins if p[0] == k) for k in PIN_RGB},
    }
    if debug:
        report["_debug"] = {"img": img, "labels": labels, "pins": pins}
    return {"hazard": hazard, "points": points}, report
