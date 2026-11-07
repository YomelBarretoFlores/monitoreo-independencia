# rediseno-ui: sober redesign with sidebar, bento summary and an official district map

Objective: replace the long single-scroll page with a sidebar app (one view per section), a bento-grid summary and a map built from official boundaries, in a sober editorial style.
Branch: `feat/redesign` (from `feat/mvp`). Delivery: `ask-on-risk`, local only. Test runner: `npm test` (vitest), `npm run typecheck`, `npm run build`.

## Specs

- S1 Layout (verbatim): "no me gusta el diseño que tiene, se ve confuso, demasiado ruido visual, debe de tener sidebar, etc." → persistent left sidebar (district identity as plain text, label "Propuesta de sistema de monitoreo", nav: Resumen, Lluvias y clima, Ríos y lagunas, El Niño, Emergencias y sismos, Mapa, Noticias, Gestión municipal, Fuentes; last update + "Actualizar" at the bottom). One view per item via hash routes instead of one long scroll.
- S2 Map (verbatim): "Debe de ser un mapa real del distrito de independencia, sácalo de fuentes oficiales el mapa, ONPE, etc." → district outline and neighbouring Huaraz districts from the official IGN boundaries (HDX COD-AB Peru, CC BY-IGO; ONPE's portal sits behind a WAF and is not scraped), rivers from ANA GeoSNIRH, provenance recorded in the data files and the UI. Third-party basemap only as an optional toggle.
- S3 Style (verbatim): "No quiero un diseño genérico, no gradientes, emojis infantiles, etc, nada que se vea genérico generado por una IA." → no gradients, no emojis or unicode symbols as icons (⚠ ✓ ✕ ↗ go), no colored left borders, no pill overload, no glow shadows; one thin-line SVG icon set; warm off-white background, white hairline cards, one accent; semantic colors only as dots, thin bars or short labels; one type family with a strict scale and tabular figures; sentence case.
- S4 Responsive and organization (verbatim): "Debe de ser responsivo, mejor organización de la inforamción, cards tipo bento grid, etc." → Resumen as a 12-column bento grid of uneven tiles (map + level with reasons; rain 72 h; SENAMHI warnings; rivers trend; El Niño; emergencies 7 d; nearby quakes; 3 latest news; investments KPI), each answering one question and linking to its view. Tablet: sidebar collapses to an icon rail. Phone: top bar with a drawer; single column at 360 px with a 16 px gutter and no horizontal scroll.
- S5 (carried from monitoreo-mvp S3/S5) Proposal, not official: no municipal logos or names that claim to be the Municipalidad; never bypass WAFs or captchas.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S5 | inline | done: `scripts/build-official-geo.ts` + tests; data/huaraz-districts, boundary (IGN), rivers (ANA); OSM script removed; RED→GREEN observed | fefc15c |
| T2 | S1, S3, S4, S5 | inline | done: sidebar / rail / drawer, hash router (`src/lib/router.ts`, tests), IBM Plex Sans, own line icons | 4bbc938 |
| T3 | S3, S4 | inline | done: 12-col bento, status tile with static IGN map (`src/lib/geo.ts`, tests) | 4bbc938 |
| T4 | S2, S3 | inline | done: Leaflet vector map from IGN/ANA layers, "Mapa base" toggle | 4bbc938 |
| T5 | S3, S4 | inline | done: views restyled, unicode icons and pills removed; Chrome: desktop, 960, 390 and 360 px, no horizontal scroll in any view, no console errors | 4bbc938 |

Route evidence: T1 is ~200 lines and T2–T5 share the shell and tokens, so no writer trigger holds; all inline.

## Log

- L1 (2026-11-07) User request, relayed verbatim by the resultados-ancash session handoff: "no me gusta el diseño que tiene, se ve confuso, demasiado ruido visual, debe de tener sidebar, etc." / "Debe de ser un mapa real del distrito de independencia, sácalo de fuentes oficiales el mapa, ONPE, etc." / "No quiero un diseño genérico, no gradientes, emojis infantiles, etc, nada que se vea genérico generado por una IA." / "Debe de ser responsivo, mejor organización de la inforamción, cards tipo bento grid, etc."
- L2 (2026-11-07) Map source research (fetched):
  - HDX `cod-ab-per` (source: Instituto Geográfico Nacional – IGN, CC BY-IGO, modified 2026-01-26): `per_admin3` has all 12 Huaraz districts; Independencia = `PE020105`, valid_on 2020-07-14, version v01, 345.53 km².
  - CENEPRED SIGRID `FEN/ER_NINO2027_BD/MapServer/5` also returns the district polygon (ubigeo 020105, 345.89 km²) but it is a risk layer, not a boundary product → IGN preferred.
  - ANA GeoSNIRH `Público/Rios/MapServer/37` (RiosQuebradas, categorized water bodies): río Santa, río Quellcayhuanca, río Pira, quebrada Honda inside the Huaraz envelope.
  - The population estimate (88 999, 2025, INEI) used to come from OSM tags on the old boundary; it moves to a server constant so the official boundary carries only IGN data.
- L3 (2026-11-07) Checks: typecheck clean, 104 tests, build OK. Chrome (real API data): every view at 360/390 px has scrollWidth = viewport; drawer opens/closes and focuses the current item; basemap toggle loads tiles and makes neighbours transparent. Review: 4bbc938 escalated as item 5 (font dependency swap) → independent verifier, then native review consent.

