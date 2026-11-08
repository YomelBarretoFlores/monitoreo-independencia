"""Centros poblados of Independencia and Huaraz with a simple access-gap index, for the 3D columns on the map.

Inputs (public downloads, kept outside the repo; pass the folder that holds them with --raw):
  osiptel/pct.csv     OSIPTEL, "Porcentaje de cobertura móvil por centro poblado, empresa operadora y tecnología"
                      (2025-IV), https://www.datosabiertos.gob.pe (ODC-By). Master list: code, name, urban/rural, lat/lon.
  inei2017/tomo1.pdf  INEI, Directorio Nacional de Centros Poblados, Censos Nacionales 2017, tomo 1 (population, dwellings).
  padron/Padron_web.dbf  MINEDU ESCALE, padrón de instituciones educativas (30-10-2026), school coordinates.
  renipress/ren.csv   SUSALUD RENIPRESS (30-10-2026), health facility coordinates (ODC-By).

Index (0 = no gap, 100 = largest gap), equal weights over three access gaps:
  connectivity  1 - best 4G coverage of the centro poblado's area across operators (CG + CAR footprint) / 100
  education     straight-line distance to the nearest active school, capped at 5 km (about an hour on foot)
  health        straight-line distance to the nearest active public health facility, capped at 10 km
It is a transparent first index, not an official one: weights and caps are stated so they can be discussed.

Run (geopdf venv, which has pymupdf):
    python scripts/centros/build.py --raw <downloads> --out data/centros-poblados.json
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import struct
from datetime import date
from pathlib import Path

import pymupdf

DISTRICTS = {"020105": "independencia", "020101": "huaraz"}
EDU_CAP_KM = 5.0
HEALTH_CAP_KM = 10.0
PUBLIC = {"GOBIERNO REGIONAL", "MINSA", "ESSALUD", "MUNICIPALIDAD PROVINCIAL", "MUNICIPALIDAD DISTRITAL"}
REGIONS = ("Quechua", "Suni", "Puna", "Janca", "Yunga", "Chala", "Rupa Rupa", "Omagua")
OPERATORS = ("Bitel", "Claro", "Entel", "Integratel")

SOURCES = {
    "osiptel": {
        "label": "OSIPTEL, cobertura móvil por centro poblado (2025-IV)",
        "url": "https://www.datosabiertos.gob.pe/sites/default/files/Porcentaje%20de%20cobertura%20movil%20por%20centro%20poblado%20empresa%20operadora%20y%20tecnolog%C3%ADa.csv",
    },
    "inei2017": {
        "label": "INEI, Directorio Nacional de Centros Poblados, Censos 2017",
        "url": "https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1541/tomo1.pdf",
    },
    "escale": {
        "label": "MINEDU ESCALE, padrón de instituciones educativas (30-10-2026)",
        "url": "https://escale.minedu.gob.pe/documents/10156/958881/Padron_web_20261030.zip",
    },
    "renipress": {
        "label": "SUSALUD RENIPRESS, establecimientos de salud (30-10-2026)",
        "url": "https://www.datosabiertos.gob.pe/sites/default/files/RENIPRESS_30-10-2026.csv",
    },
}


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine distance between two (lon, lat) points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def pct(v: str) -> float:
    v = v.strip().rstrip("%")
    return float(v) if v else 0.0


def read_osiptel(path: Path) -> list[dict]:
    rows = csv.DictReader(io.StringIO(path.read_bytes().decode("latin-1")), delimiter=";")
    out = []
    for r in rows:
        r = {k.strip(): v for k, v in r.items() if k}
        code = r["Ubigeo"].strip()
        if code[:6] not in DISTRICTS:
            continue
        cov = max(pct(r.get(f"{op}_4G_CG+CAR", "")) for op in OPERATORS)
        out.append({
            "code": code,
            "name": r["CentroPoblado"].strip().title(),
            "district": DISTRICTS[code[:6]],
            "area": r["Clasificacion"].strip().lower(),
            "lon": float(r["Longitud"]),
            "lat": float(r["Latitud"]),
            "cov4g": round(min(cov, 100.0), 1),
        })
    return out


def parse_inei(path: Path) -> tuple[dict[str, dict], dict[str, int]]:
    """Rows of the two districts: {code: {pop, dwellings, alt}}, plus each district's printed total population."""
    lines = []
    with pymupdf.open(path) as doc:
        for page in doc:
            lines += [x.strip() for x in page.get_text().splitlines() if x.strip()]
    is_num = lambda s: s == "-" or re.fullmatch(r"\d{1,3}(?: \d{3})*", s) is not None
    val = lambda s: 0 if s == "-" else int(s.replace(" ", ""))
    rows: dict[str, dict] = {}
    totals: dict[str, int] = {}
    district = None
    i = 0
    while i < len(lines):
        s = lines[i]
        if re.fullmatch(r"\d{6}", s) and i + 1 < len(lines) and lines[i + 1].startswith("DISTRITO"):
            district = s if s in DISTRICTS else None
            if district:
                totals[district] = val(lines[i + 2])
            i += 2
            continue
        if district and re.fullmatch(r"\d{4}", s):
            j = i + 1
            name = []
            while j < len(lines) and not lines[j].startswith(REGIONS):
                name.append(lines[j])
                j += 1
            nums = lines[j + 1 : j + 8]
            if len(nums) == 7 and all(is_num(n) for n in nums):
                alt, pop, _m, _w, dw, _occ, _vac = (val(n) for n in nums)
                rows[district + s] = {"pop": pop, "dwellings": dw, "alt": alt, "inei_name": " ".join(name)}
                i = j + 8
                continue
        i += 1
    return rows, totals


def read_dbf(path: Path, enc: str = "cp850"):
    with path.open("rb") as f:
        head = f.read(32)
        n, hl, rl = struct.unpack("<IHH", head[4:12])
        fields = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D:
                break
            fields.append((d[:11].split(b"\0")[0].decode(), d[16]))
        f.seek(hl)
        for _ in range(n):
            rec = f.read(rl)
            if rec[:1] == b"*":
                continue
            pos = 1
            row = {}
            for name, length in fields:
                row[name] = rec[pos : pos + length].decode(enc, "replace").strip()
                pos += length
            yield row


def schools(path: Path) -> list[tuple[float, float]]:
    pts = []
    for r in read_dbf(path):
        if r["D_DPTO"] == "ANCASH" and r["D_ESTADO"] in ("Activo", "Activa") and r["NLAT_IE"] and r["NLONG_IE"]:
            pts.append((float(r["NLONG_IE"]), float(r["NLAT_IE"])))
    return pts


def health(path: Path) -> list[tuple[float, float]]:
    pts = []
    text = path.read_bytes().decode("utf-8-sig", "replace")
    for r in csv.DictReader(io.StringIO(text), delimiter=";"):
        if r["DEPARTAMENTO"] != "ANCASH" or r["ESTADO"] != "ACTIVO" or r["INSTITUCION"] not in PUBLIC:
            continue
        try:
            lat, lon = float(r["NORTE"]), float(r["ESTE"])  # columns hold decimal lat/lon despite their names
        except ValueError:
            continue
        if -11 < lat < -8 and -79 < lon < -76:
            pts.append((lon, lat))
    return pts


def gap_index(cov4g: float, school_km: float, health_km: float) -> dict[str, float]:
    parts = {
        "conectividad": 1 - cov4g / 100,
        "educacion": min(school_km / EDU_CAP_KM, 1.0),
        "salud": min(health_km / HEALTH_CAP_KM, 1.0),
    }
    return {k: round(v * 100, 1) for k, v in parts.items()} | {"indice": round(sum(parts.values()) / 3 * 100, 1)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    centros = read_osiptel(args.raw / "osiptel/pct.csv")
    inei, totals = parse_inei(args.raw / "inei2017/tomo1.pdf")
    for d, total in totals.items():
        parsed = sum(v["pop"] for k, v in inei.items() if k.startswith(d))
        if parsed != total:
            raise SystemExit(f"INEI parse mismatch for {d}: rows sum {parsed}, printed total {total}")
    sch = schools(args.raw / "padron/Padron_web.dbf")
    hea = health(args.raw / "renipress/ren.csv")

    out = []
    for c in centros:
        p = (c["lon"], c["lat"])
        school_km = min(km(p, q) for q in sch)
        health_km = min(km(p, q) for q in hea)
        row = inei.get(c["code"], {})
        out.append(
            c
            | {"pop": row.get("pop"), "dwellings": row.get("dwellings"), "alt": row.get("alt")}
            | {"schoolKm": round(school_km, 2), "healthKm": round(health_km, 2)}
            | gap_index(c["cov4g"], school_km, health_km)
        )
    out.sort(key=lambda r: r["code"])
    doc = {
        "builtAt": date.today().isoformat(),
        "method": (
            "Índice de brechas de acceso (0 = sin brecha, 100 = brecha máxima), promedio simple de tres brechas: "
            f"conectividad (1 − mejor cobertura 4G del área del centro poblado entre operadores, huella CG + CAR), "
            f"educación (distancia en línea recta a la institución educativa activa más cercana, tope {EDU_CAP_KM:g} km) y "
            f"salud (distancia en línea recta al establecimiento de salud público activo más cercano, tope {HEALTH_CAP_KM:g} km). "
            "Población y viviendas: Censos 2017; los centros poblados sin fila en el censo quedan sin población."
        ),
        "sources": SOURCES,
        "totals2017": {DISTRICTS[k]: v for k, v in totals.items()},
        "centros": out,
    }
    args.out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    joined = sum(1 for r in out if r["pop"] is not None)
    print(f"{len(out)} centros ({sum(r['district'] == 'independencia' for r in out)} Independencia), {joined} with 2017 population; {len(sch)} schools, {len(hea)} public health facilities")


if __name__ == "__main__":
    main()
