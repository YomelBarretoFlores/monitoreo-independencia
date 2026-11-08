"""Georeference a GeoPDF map frame: page coordinates -> (lon, lat).

A GeoPDF viewport (ISO 32000 /VP with a /Measure of subtype /GEO) gives
control points: LPTS in the viewport's unit square and GPTS as (lat, lon).
Over a few kilometres the projected map grid (UTM) and lon/lat differ by an
affine map to within millimetres, so an affine fit by least squares is exact
enough and needs no projection library.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

_NUM = r"-?\d+(?:\.\d+)?"


@dataclass(frozen=True)
class Viewport:
    bbox: tuple[float, float, float, float]  # PDF user space (origin bottom-left), as written
    lpts: list[tuple[float, float]]
    gpts: list[tuple[float, float]]  # (lat, lon)


def _numbers(text: str) -> list[float]:
    return [float(n) for n in re.findall(_NUM, text)]


def parse_viewports(vp_source: str) -> list[Viewport]:
    """Parse every /Viewport in the page's /VP array (the raw PDF object text)."""
    out: list[Viewport] = []
    for chunk in vp_source.split("/Viewport")[1:]:
        bbox = _numbers(re.search(r"/BBox\s*\[([^\]]*)\]", chunk).group(1))
        lpts = _numbers(re.search(r"/LPTS\s*\[([^\]]*)\]", chunk).group(1))
        gpts = _numbers(re.search(r"/GPTS\s*\[([^\]]*)\]", chunk).group(1))
        out.append(
            Viewport(
                bbox=tuple(bbox),
                lpts=list(zip(lpts[0::2], lpts[1::2])),
                gpts=list(zip(gpts[0::2], gpts[1::2])),
            )
        )
    return out


def inline_measures(vp_source: str, resolve) -> str:
    """Replace indirect '/Measure N 0 R' references with the referenced object's text."""
    return re.sub(r"/Measure\s+(\d+)\s+0\s+R", lambda m: "/Measure" + resolve(int(m.group(1))), vp_source)


def page_viewports(doc, page) -> list[Viewport]:
    """Viewports of a PyMuPDF page, with indirect /Measure objects resolved."""
    return parse_viewports(inline_measures(doc.xref_get_key(page.xref, "VP")[1], doc.xref_object))


@dataclass(frozen=True)
class Georef:
    """Affine map from page coordinates (PyMuPDF: origin top-left, y down) to lon/lat."""

    coef: np.ndarray  # 3x2: [x, y, 1] @ coef = [lon, lat]
    residual_m: float  # worst control-point misfit, metres

    def __call__(self, x: float, y: float) -> tuple[float, float]:
        lon, lat = np.array([x, y, 1.0]) @ self.coef
        return float(lon), float(lat)

    def many(self, pts: np.ndarray) -> np.ndarray:
        """(n, 2) page points -> (n, 2) lon/lat."""
        ones = np.ones((len(pts), 1))
        return np.hstack([pts, ones]) @ self.coef


def fit(viewport: Viewport, page_height: float) -> Georef:
    x0, y0, x1, y1 = viewport.bbox
    page_pts = []
    for u, v in viewport.lpts:
        # LPTS are fractions of the viewport BBox as written (y0 may be above y1)
        px = x0 + u * (x1 - x0)
        py_pdf = y0 + v * (y1 - y0)
        page_pts.append((px, page_height - py_pdf))
    a = np.hstack([np.array(page_pts), np.ones((len(page_pts), 1))])
    b = np.array([(lon, lat) for lat, lon in viewport.gpts])
    coef, *_ = np.linalg.lstsq(a, b, rcond=None)
    misfit = a @ coef - b
    lat0 = np.radians(b[:, 1].mean())
    metres = np.hypot(misfit[:, 0] * 111_320 * np.cos(lat0), misfit[:, 1] * 110_574)
    return Georef(coef=coef, residual_m=float(metres.max()))


def utm_to_lonlat(easting: float, northing: float, zone: int = 18, south: bool = True) -> tuple[float, float]:
    """WGS84 UTM -> lon/lat (Snyder's series; sub-metre within a zone)."""
    a = 6378137.0
    f = 1 / 298.257223563
    k0 = 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x = easting - 500_000
    y = northing - (10_000_000 if south else 0)
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - np.sqrt(1 - e2)) / (1 + np.sqrt(1 - e2))
    phi = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * np.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * np.sin(4 * mu)
        + (151 * e1**3 / 96) * np.sin(6 * mu)
        + (1097 * e1**4 / 512) * np.sin(8 * mu)
    )
    c = ep2 * np.cos(phi) ** 2
    t = np.tan(phi) ** 2
    n = a / np.sqrt(1 - e2 * np.sin(phi) ** 2)
    r = a * (1 - e2) / (1 - e2 * np.sin(phi) ** 2) ** 1.5
    d = x / (n * k0)
    lat = phi - (n * np.tan(phi) / r) * (
        d**2 / 2
        - (5 + 3 * t + 10 * c - 4 * c**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t + 298 * c + 45 * t**2 - 252 * ep2 - 3 * c**2) * d**6 / 720
    )
    lon = (d - (1 + 2 * t + c) * d**3 / 6 + (5 - 2 * c + 28 * t - 3 * c**2 + 8 * ep2 + 24 * t**2) * d**5 / 120) / np.cos(phi)
    return float((zone - 1) * 6 - 180 + 3 + np.degrees(lon)), float(np.degrees(lat))
