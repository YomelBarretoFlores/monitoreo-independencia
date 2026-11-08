# zonas-seguras: alluvion safe zones from the two GeoPDFs on a realistic 3D map

Objective: turn the Huaraz–Independencia (Quillcay) and Casca safe-zone GeoPDFs into map data, show them on a MapLibre map with satellite imagery over real terrain, with filters and a sources section linking the PDFs.
Branch: `feat/safe-zones` (from `main` 4df76cc). Delivery: work-unit commits on the branch; merge and push stay the user's decision (as in previous features). Test runner: `npm test`, `npm run typecheck`, `npm run build`.

## Specs

- S1 (verbatim): "Puedes replicar todo eso en la web con el mapas ultra realistas?" → replicate the content of both PDFs (hazard levels, safe zones, evacuation routes, exposed elements) as map layers; "ultra realistas" = satellite imagery draped over real terrain with tilt/rotate (3D), replacing Leaflet with MapLibre GL JS (approved: "comienza con el trabajo").
- S2 (verbatim): "Y abajo mencionas las fuentes, o colocar el link para ver los pdf." → a sources block under the map naming who made each map, date, and a link to view each PDF. Huaraz–Independencia: SINIA (MINAM) public PDF. Casca: source unknown; user: "Sobre el PDF de Casca aún no lo sé, si no encuenrtas la fuente más adelante te lo diré yo." → no link until known (state it plainly, do not host the 234 MB file).
- S3 (verbatim): "ambos pdf se deben de aprovechar, no solo porque uno es de Huaraz debe de obviar el alcalde de Independencia." → both maps are first-class layers; the Huaraz map is credited as made with the Municipalidad Distrital de Independencia (it names its mayor and risk-management head).
- S4 (verbatim): "Quizás puedas colocar filtros, etc." → filters: hazard level, safe-zone type, basin (Quillcay / Casca), max evacuation time (where the source gives it), search by zone; a click shows the zone's details.
- S5 (verbatim): "siguiendo las buenas prácticas de desarrollo de software, además, con buen rendimiento y optimización." → reproducible extraction script with provenance in the data files, tests for pure logic, the map engine and the zone data loaded only when the Mapa view opens (code splitting), simplified geometry with rounded coordinates.
- S6 (carried) Proposal, not official: no municipal logos; credits as text. Never bypass WAFs or captchas. UI copy in Spanish, code in English.
- S7 (assumption) Existing map features keep working: IGN district boundary and neighbours, ANA rivers, base maps Oficial / Satélite / Relieve / Calles, CENEPRED susceptibility overlays with legends, "Capas" panel collapsed on phones.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S3, S5 | inline | done: `scripts/geopdf/` (georef, casca, huaraz, extract; pinned requirements; unittest 5 OK) → `data/safe-zones/{hazard,zones,influence,routes,points}.geojson` (377 kB, ≈90 kB gz) with provenance; model `src/lib/safezones.ts` + loader; vitest 19 OK (model + data contract) | (this commit) |
| T2 | S1, S5, S7 | inline | pending: Leaflet → MapLibre (lazy chunk), parity with current layers, 3D terrain toggle | |
| T3 | S1, S4 | inline | pending: safe-zone layers, filters, details popup | |
| T4 | S2, S3, S6 | inline | pending: sources block with PDF links and credits | |

Route evidence: no writer trigger (units depend on each other: T3 needs T1 data and T2 engine); all inline.

## Log

- L1 (2026-11-08) User, verbatim: "Bien, qué es lo que harías con estos dos pdf? Puedes replicar todo eso en la web con el mapas ultra realistas? Y abajo mencionas las fuentes, o colocar el link para ver los pdf. Además, ambos pdf se deben de aprovechar, no solo porque uno es de Huaraz debe de obviar el alcalde de Independencia. Quizás puedas colocar filtros, etc." Then: "Bien, recordemos que esto, todo este trabajo es para presentar al nuevo alcalde provincial de Independencia Yimy Anaya. Sobre el PDF de Casca aún no lo sé, si no encuenrtas la fuente más adelante te lo diré yo. Dicho esto, comienza con el trabajo, pero siguiendo las buenas prácticas de desarrollo de software, además, con buen rendimiento y optimización."
- L2 (2026-11-08) Evidence:
  - Huaraz PDF = SINIA file (same 3,025,394 bytes): https://sinia.minam.gob.pe/sites/default/files/archivos/public/docs/MAPA%20DE%20ZONAS%20SEGURAS%20Y%20RUTAS%20DE%20EVACUACI%C3%93N_FIN.pdf. Made by the Huaraz provincial risk office (OGRDyDC) with Independencia, May 2025, 1:8 500, ArcMap 10.5, GeoPDF (GPTS), but the map body is one 300 dpi raster (62 strips): hazard polygons, icons and roads must be vectorized from colors.
  - Casca PDF: INAIGEM, Aug 2026, 1:5 500, ArcGIS Pro 3.6, GeoPDF with named vector layers (Peligro, Zona Segura, Área de Influencia, Ruta Evacuación, Elementos Expuestos, Ríos, Vías). 38 safe zones with a table (area, evacuation time, coordinates UTM 18S, altitude); 4 sample zones fall inside the IGN Independencia boundary. Weight: 101 JPEG imagery tiles, 221 MB.
  - Mayor name "Yimy Anaya": not found on the web (2026-11-08); the app shows no authority names, so it does not block.
  - maplibre-gl: 6.17.0 published 2026-11-07 → pin 6.15.0 (2026-10-18). Terrain: AWS Terrain Tiles (terrarium, keyless) answer 200.
- L3 (2026-11-08) T1 evidence:
  - Casca: georef residual 0.0 m; 37 zones (ZS-24 does not exist in the source table — corrected the earlier "38" told to the user); every zone area matches the table to ±0.002 ha; 30/37 influence areas matched by area (≤5 %, most ≤0.3 %), 7 left without polygon (table value still shown); 19 routes; 25 exposed elements (18 schools, 6 health, 1 stadium); all 37 zones inside the IGN Independencia boundary.
  - Huaraz–Independencia: georef residual 0.39 m; raster 6823×4771 px (0.72 m/px); hazard vectorized (muy alto 182.4 ha, alto 38.0, medio 10.5, bajo 22.0) after masking 5 legend/title panels, nearest-class fill of overlays, thin-white removal and <1 ha speck removal; 37 pins by color (seguridad 14, acopio 6, refugio 6, salud 4, cadáveres 3, comando 2, animales 2) — visually checked on the render; 17 in Independencia, 20 in Huaraz district. Evacuation arrows of this map are not extracted.
  - Credits: no authority names in the app (the PDF names the previous administration; the proposal is for the new mayor); institutions only.
