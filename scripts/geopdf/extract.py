"""Build data/safe-zones/*.geojson from the two alluvion safe-zone GeoPDFs.

Setup (once, outside the repo):
    python3 -m venv /tmp/geopdf-venv
    /tmp/geopdf-venv/bin/pip install -r scripts/geopdf/requirements.txt
Run from the repo root:
    /tmp/geopdf-venv/bin/python scripts/geopdf/extract.py \
        --huaraz "2. HUARAZ- MAPA DE ZONAS SEGURAS.pdf" \
        --casca "1. CASCA_MAPA DE ZONAS SEGURAS.pdf"
Tests:
    /tmp/geopdf-venv/bin/python -m unittest discover -s scripts/geopdf
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))

import casca  # noqa: E402
import huaraz  # noqa: E402
from common import write_collection  # noqa: E402
from shapely.geometry import shape  # noqa: E402

SOURCES = {
    "quillcay": {
        "title": "Mapa de zonas seguras y rutas de evacuación ante aluviones en Huaraz e Independencia (Áncash) – zona baja, subcuenca río Quillcay",
        "author": "Oficina de Gestión del Riesgo de Desastres y Defensa Civil de la Municipalidad Provincial de Huaraz, con la Municipalidad Distrital de Independencia",
        "inputs": "INAIGEM, MTC, ANA y catastro de las municipalidades de Huaraz e Independencia",
        "date": "2025-05",
        "scale": "1:8 500",
        "pdf": "https://sinia.minam.gob.pe/sites/default/files/archivos/public/docs/MAPA%20DE%20ZONAS%20SEGURAS%20Y%20RUTAS%20DE%20EVACUACI%C3%93N_FIN.pdf",
        "page": "https://sinia.minam.gob.pe/mapas/mapa-zonas-seguras-rutas-evacuacion-ante-aluviones-huaraz-independencia",
        "method": "Peligro vectorizado desde la imagen del mapa (0,72 m por píxel); lugares seguros detectados por el color de cada ícono.",
    },
    "casca": {
        "title": "Mapa de zonas seguras y peligro por aluvión – unidad hidrográfica Casca",
        "author": "Instituto Nacional de Investigación en Glaciares y Ecosistemas de Montaña (INAIGEM)",
        "date": "2026-08",
        "scale": "1:5 500",
        "pdf": None,
        "page": None,
        "method": "Capas vectoriales del GeoPDF; atributos de las zonas desde el cuadro del mapa.",
    },
}

LAYERS = ("hazard", "zones", "influence", "routes", "points")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--huaraz", required=True, help="Huaraz–Independencia (Quillcay) GeoPDF")
    parser.add_argument("--casca", required=True, help="Casca GeoPDF (INAIGEM)")
    parser.add_argument("--out", default="data/safe-zones", help="output directory")
    parser.add_argument("--boundary", default="data/boundary.geojson", help="Independencia boundary (IGN)")
    args = parser.parse_args()

    q_layers, q_report = huaraz.extract(args.huaraz)
    c_layers, c_report = casca.extract(args.casca)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    built = datetime.now(timezone.utc).isoformat(timespec="seconds")
    district = shape(json.loads(Path(args.boundary).read_text(encoding="utf-8"))["geometry"])
    sizes = {}
    for layer in LAYERS:
        features = q_layers.get(layer, []) + c_layers.get(layer, [])
        if layer in ("zones", "points"):
            for f in features:
                f["properties"]["independencia"] = district.contains(shape(f["geometry"]).representative_point())
        basins = sorted({f["properties"]["basin"] for f in features})
        source = {"builtAt": built, "maps": {b: SOURCES[b] for b in basins}}
        sizes[layer] = write_collection(out / f"{layer}.geojson", features, source)
    print(json.dumps({"quillcay": q_report, "casca": c_report, "bytes": sizes}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
