# showcase-3d: alluvion simulator (teardown) and 3D data on the map

Objective: two 3D pieces for the proposal to the new Independencia mayor. (1) An interactive simulator and video of a Palcacocha → Quillcay alluvion built with the `teardown` skill. (2) 3D columns per centro poblado on the existing MapLibre map, plus an automatic camera tour.
Branch: `feat/3d-showcase` (from `main` 52903b1). Delivery: work-unit commits on the branch; the user decides merge, push and deploy. Test runner: `npm test`, `npm run typecheck`, `npm run build`; teardown review by frame sheets (`capture.mjs --stills beats`).

## Specs

- S1 (verbatim): "mi amigo estaba diciendo si podríamos hacer algo 3D, en qué se podría hacer?, tengo una skill instalada llamada teardown que quizás podría ayudar" / "Sí, empieza, primero haremos esos dos puntos que mencionas". Point 1, as proposed and accepted:
  - path: laguna Palcacocha, dam rupture, quebrada Cojup, río Quillcay, arrival at Huaraz and Independencia;
  - one input, the time since rupture; panels for flow and arrival time per sector; show how the early-warning system acts;
  - an interactive page and a video to open the meeting;
  - figures from published studies, verified first;
  - labelled "ilustrativo, no es un modelo oficial".
- S2 (verbatim, same message), point 2 as proposed and accepted:
  - "Columnas 3D sobre cada centro poblado, con altura según el índice de brechas del frente 1, sobre el terreno real";
  - "Un recorrido automático de la cámara: casco urbano, caseríos, lagunas".
  - Assumption: S2 needs only the per-centro-poblado indicators and index that drive the columns. The full front 1 (methodology page, benchmark against neighbouring districts) waits for S5.
- S3 (carried):
  - a proposal, not official: no municipal logos; credits as text; no authority names in the UI;
  - every figure with its source;
  - never bypass WAFs or captchas;
  - UI copy in Spanish, code in English.
- S4 (carried, verbatim from the previous feature): "siguiendo las buenas prácticas de desarrollo de software, además, con buen rendimiento y optimización." The simulator page stays under 1 MB and loads only when opened. Pure logic is tested.
- S5 (verbatim): "luego al finalizar veremos si implementamos todo lo que mencionaste al inicio": fronts 1–3 (gaps, budget, exposure) are out of scope until the user decides.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S3 | delegated (research: many web lookups) | done: ANA 2016 bathymetry, Somos-Valenzuela 2016 Table 6 (3 scenarios), INDECI 2015 exposure, GORE 2021 warning time, Defensoría 2026 SAT status, Mergili 2020 (~23 km), Huggel 2020 (1941) → `src/lib/palcacocha.ts` SOURCES | (in T3 commit) |
| T2 | S2, S3 | delegated (research: many web lookups) | done: OSIPTEL 2025 per centro poblado (coords, urban/rural, 4G; ODC-By) as master list; INEI 2017 directory PDF (population, dwellings; 136 CP); MVCS DATASS API (rural water 7101 / sanitation 7102); ESCALE padrón (schools, coords); RENIPRESS (health, coords). No per-CP 2025 census yet | — |
| T3 | S1, S3, S4 | inline | done: `scripts/sim/terrain.py` (AWS terrain, flow path by steepest descent 25.1 km, entrance 22.2 km into the official hazard map; overlays from app data), model `src/lib/palcacocha.ts` (RED→GREEN 11 tests), `sims/palcacocha-{shared,live,film}`, `npm run build:sim` → `public/simulador/palcacocha.html` (799 KB) + `elevation.glb` (151 KB); Mapa card `src/sections/simulator.ts` (RED→GREEN 4 tests); Chrome: scenarios, views, layers, no console errors | see git log |
| T4 | S1 | inline | pending: film script, score and the final MP4 | — |
| T5 | S2, S3, S4 | inline | pending: gap index data and 3D columns on the map, with a legend and sources | — |
| T6 | S2 | inline | pending: automatic camera tour (casco urbano → caseríos → lagunas) | — |

## Log

- L1 (2026-11-08, user, verbatim): "Bien, me gusta todo lo que mencionas, no lo olvides. Pero, mi amigo estaba diciendo si podríamos hacer algo 3D, en qué se podría hacer?, tengo una skill instalada llamada teardown que quizás podría ayudar, hay algo que se pueda hacer o no?" → then "Sí, empieza, primero haremos esos dos puntos que mencionas, luego al finalizar veremos si implementamos todo lo que mencionaste al inicio."
- L2: teardown checked: it builds 3D simulators of machines from real dimensions, with one input, an auto tour, and 60 fps video plus score. node_modules, ffmpeg and python3 are present. A fluid flow over terrain stretches the kit, which is built for mechanisms, so adapt it from the closest example.
- L3: T1 research: Somos-Valenzuela 2016 is the only source with arrival times and discharges at the dam, city entrance and exit (large 1.32 h / 1980 m³/s; exit 2.1 h / 920 m³/s). Between those points the simulator interpolates (linear front, log-linear peak), and the UI says so. SAT: 30 min warning (GORE 2021). Defensoría NP 268-2026: no maintenance for more than 3 years.
- L4: Cross-check: the DEM flow path enters the official Quillcay hazard map 22.2 km from the lake; Mergili 2020 gives "about 23 km" lake → Huaraz.
- L5: T2 research: per-centro-poblado sources found (see T2). Scratch downloads (426 MB) are kept outside the repo for T5 and removed after it.
- L6: Camera: the Cordillera's parallel SW–NE ridges block side views; every view looks up-valley from the SW, and a guard keeps the line of sight above the terrain.
