# glof-mapa: alluvion simulation inside the real map, tour and hover fixes

Objective: replace the separate three.js simulator with an alluvion animation on the app's MapLibre map (real imagery, 3D terrain, same filters), backed only by published times. Also finish the centros-poblados tour and fix the link-button hover.
Branch: `feat/3d-showcase` (continues showcase-3d). Delivery: work-unit commits; merge, push and deploy stay the user's decision. Test runner: `npm test`, `npm run typecheck`, `npm run build`; a Playwright smoke run in scratch for the map controls. Plan: `~/.claude/plans/indexed-swimming-beaver.md` (approved).

## Specs

- S1 (verbatim): "Sobre la simulación, se ve mala, poco realista, se podría traer el mapa y allí mismo hacer simulación?, igual con sus filtros de satelital, etc." → the alluvion animates on the app map over satellite imagery and terrain, with the existing base maps and layers. The separate teardown page is retired.
- S2 (verbatim): "Y en la simulación verifica que todos sus controles funcionen y no haya bugs." → every control is exercised by an automated browser run, with no console errors.
- S3 (verbatim): "cómo haz medido el tiempo, la velocidad?, tienen que ser estudios verídicos, etc." / "Mira, en internet el tiempo es muy diferente a lo que tú estimas." → times come only from published studies. Ranges are shown where sources differ. The UI explains the "30 min" (an evacuation window) and the "15 min" (no source) figures.
- S4 (verbatim): "no hay opciones para ver la simulación de diferentes lagunas sus desbordes" → there is a lake selector:
  - Palcacocha is timed;
  - Tullparaju and Cuchillacocha animate their route only, "comparable" per Baer 2016, with no minutes;
  - lakes with no study are listed without an animation.
- S5 (verbatim): "el recorrido no avisa cuando termina." → the tour shows a completion or stop notice.
- S6 (verbatim): "debería de haber un botón de restablecer o algo así para que el mapa se coloque a su posición original." → a "Restablecer vista" control returns to the initial view and stops the tour and the simulation.
- S7 (verbatim): "Y sobre el recorrido solo es de algunos que muestra el recorrido cierto?" → the tour covers 10 villages by default, with an option for all of them.
- S8 (verbatim): "el botón de abrir la simulación 3D al hacer hover también se vuelve blanco, lo mismo para ver el PDF, quizás pase lo mismo en muchos otros botones o URL." → link buttons stay readable on hover, everywhere.
- S10 (verbatim): "sobre la página de fuentes, están todas?, por ejemplo creo que usaste OSIPTEL incluso." → the Fuentes page also lists the fixed and map sources: centros poblados, alluvion studies, GeoPDF maps, IGN, ANA, base maps and terrain.
- S11 (verbatim): "sobre el mapa, cuando haga hover sobre los controles quisiera que salga como un tooltip para que el usuario sepa para qué sirve." → every map control shows a tooltip on hover and on keyboard focus.
- S12 (verbatim): "Y haz eliminado todo lo que generaste con la skill de teardown cierto?" → nothing generated with teardown remains: no code, no output folder, no ignore rule.
- S13 (verbatim): "creo que colocar pausa la simulación a veces se traba, revisa eso también." → play/pause responds to every real click.
- S9 (carried): proposal, not official; no logos or authority names; every figure has a source; no WAF bypass; UI in Spanish, code in English; good practices and performance.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S8 | inline | done: reproduced dark-on-dark hover on `a.btn` in Chrome; `a:not([class]):hover` + `.btn` text-decoration none; re-hovered: readable | see git log |
| T2 | S5, S6, S7 | inline | done: `tourStops(centros, 'top'|'all')` (RED→GREEN 2 tests): 10 villages or every centro; tour menu; chip "n de N", "Recorrido terminado…" or "Recorrido detenido."; ResetControl (fitBounds, 3D off, tour stopped, popup closed). Chrome: menu, progress, stop and reset checked; the full-run end notice is pending the T5 smoke run | see git log |
| T3 | S4 | inline | done: `scripts/glof/routes.py` → `data/glof/routes.json` (53 KB): Palcacocha 25.7 km, entrance 22.4 km Quillcay; Cuchillacocha 29.0 / 25.7; Tullparaju 28.3 / 25.0; Llaca 14.1 km, entrance 9.4 km into the Casca map; all reach the río Santa. Contract test 4/4 | see git log |
| T4 | S3, S4 | inline | done: `src/lib/palcacocha.ts` → `src/lib/glof.ts`; LAKES (timed / comparable / no-study, volume + source), scenario r1941 (Mergili 36–70 min, stops at the city), Somos range 1.05–1.32 h, ARRIVAL_EVIDENCE (79, 63–79, 36–70, 30 = evacuation, 15 = no source), `floodGradient`, `cityRevealAt` (RED→GREEN 6 new tests; 185 total). Unverifiable Guardian URL dropped; the NASA URL was verified | see git log |
| T5 | S1, S2, S3, S4 | inline | done: `src/sections/glof-sim.ts` (line-gradient flood on each lake route over imagery and terrain, front marker, Quillcay/Casca hazard reveal, camera following downstream, strip under the map: lake, scenario, play, scrub, speed, follow, readouts with published range); "Aluvión" control; card with ARRIVAL_EVIDENCE and lakes (RED→GREEN 5 tests); helpers pointAlong, bearingAlong, playRate, simEnd (RED→GREEN 3); teardown page removed (`sims/`, `public/simulador`, `scripts/sim`, `build:sim`). Playwright smoke 33/33 (every control, lakes, scenarios, base maps, reset, remount, full tour end notice, hover colours, zero console errors) | see git log |
| T6 | S1 | inline | optional: record the map version as a video, if the user wants it | — |
| T7 | S10 | inline | done: a "Mapas y datos fijos" table on Fuentes (IGN, ANA, Esri, AWS Terrain Tiles, both GeoPDF maps, OSIPTEL, INEI 2017, ESCALE, RENIPRESS, every alluvion study), shown even before the panel loads; `CENTROS_SOURCES` kept in sync with the data file (RED→GREEN 4 tests). Chrome: 25 sources listed | see git log |
| T8 | S11 | inline | done: `bindTooltips` shows an immediate tooltip on hover and keyboard focus for all 10 controls (ours with descriptive data-tip; MapLibre's from their title, moved so the native one does not double); probe: 10/10 with text, 0 native titles, focus works; pause probe still 0/20 misses | see git log |
| T9 | S13 | inline | done: RED: real mouse press (90 ms) missed 20/20, because the play button's content was replaced every frame; GREEN 0/20 after redrawing only on state change, with icons set to pointer-events none | see git log |
| T10 | S12 | inline | done: deleted `teardown-out/` (the 30 MB local video), its .gitignore rule and the scratch renders; `git grep teardown` finds nothing outside the odd/ history notes. The teardown skill itself stays installed (it is the user's tool, not project output) | see git log |

## Log

- L1 (2026-11-08, user, verbatim): "Me gusta, pero del punto 2, el recorrido no avisa cuando termina. Además, debería de haber un botón de restablecer o algo así para que el mapa se coloque a su posición original. Y sobre el recorrido solo es de algunos que muestra el recorrido cierto? Y sobre la simulación, cómo haz medido el tiempo, la velocidad?, tienen que ser estudios verídicos, etc. Y además, no hay opciones para ver la simulación de diferentes lagunas sus desbordes, etc. Mira, en internet el tiempo es muy diferente a lo que tú estimas. Sobre la simulación, se ve mala, poco realista, se podría traer el mapa y allí mismo hacer simulación?, igual con sus filtros de satelital, etc. Y en la simulación verifica que todos sus controles funcionen y no haya bugs. Por último el botón de abrir la simulación 3D al hacer hover también se vuelve blanco, lo mismo para ver el PDF, quizás pase lo mismo en muchos otros botones o URL." Then: "Sí, empieza, arma el plan completo /plan" (plan approved).
- L2: Evidence:
  - Somos 2016 says "about 1 h and 20 min to arrive at the city" (checked in the paper text).
  - Mergili 2020: 1941 reconstruction gives 36–70 min, and "no travel times or velocities are documented for the 1941 event".
  - "15 min": NASA Earth Observatory 2003 forecast and Wikipedia, both without a source.
  - "30 min": an evacuation window quoted by a GORE official (The Guardian 2018).
  - Tullparaju and Cuchillacocha: Frey 2018 and Baer 2016 give no minutes.
  - Llaca, Shallap and Rajucolta: no timed study.
- L3: Hover root cause: `a:hover` (0,1,1) in `src/styles/base.css` beats `.btn` (0,1,0) on `color`.
- L4: Sources check: the NASA EO page 3343 holds the "15 minutes" forecast (verified by search). The original URL of The Guardian 2018 article could not be confirmed (only syndicated copies), so the 30 min figure cites GORE Áncash 2021 alone.
- L5: Map version review in Chrome: the strip covered the bottom half of the map and the open Capas panel covered the top, so the strip moved under the map (inside the card, so it joins full screen) and Capas folds on open. Mark labels shortened (they overlapped). The smoke check for the 1941 marks was tautological at first; fixed and rerun on the final code.
- L6: The independent verifier found S1–S9 met, plus one blocker: `a:not([class]):hover` raised the specificity to (0,2,1), so "Fuente:" links (`.src a`) changed hover colour. Fixed with `a:where(:not([class])):hover`; recheck: `.src a` hover rgb(59,63,70), equal to the baseline, and `a.btn` stays readable. Advisories fixed: Baer 2016 title, the NASA URL (now science.nasa.gov), the countdown now shows the published range instead of an unpublished midpoint, larger touch targets. Smoke rerun 33/33.
- L7 (2026-11-08, user, verbatim): "Bien, todo correcto entonces?, sobre la página de fuentes, están todas?, por ejemplo creo que usaste OSIPTEL incluso. Y sobre el mapa, cuando haga hover sobre los controles quisiera que salga como un tooltip para que el usuario sepa para qué sirve. Y haz eliminado todo lo que generaste con la skill de teardown cierto? Y creo que colocar pausa la simulación a veces se traba, revisa eso también."
- L8: The pause bug was missed by the earlier smoke run because Playwright's click() presses and releases instantly. The new probe holds the press for 90 ms, as a person does.
- L9: Second independent verifier (S10, S11 and S13 pass; S12 failed): `sims/palcacocha-shared/__pycache__/score.cpython-313.pyc` was left on disk, ignored by git. Removed `sims/` entirely. Advisory fixed: the ANA link now points to the RiosQuebradas layer, not the server's IIS default page. Advisories left: the Casca GeoPDF has no public link yet (data); the strip's scenario buttons keep native titles (outside the map controls).
- L10 (2026-11-08, user, verbatim): "Bien, ahora primero verifica que toda la web sea responsiva. Si lo es entonces une la rama, subes y despliegas a prod."
- L11: Responsive check, Playwright, every route at 360, 390, 768, 1024 and 1440 px, a fresh browser per width. Found and fixed:
  - `#gestion` KPI tiles overflowed at 360, 390 and 768 px (page 377/360), because the nowrap status chip "Requieren seguimiento" widened the tile. Fixed with `.kpi { min-width: 0 }` and wrapping `.kpi-sub .lv`.
  - A map tooltip stayed on screen after a tap. It now shows on a mouse hover or `:focus-visible` only.
  - "Aluvión" or the card used before the map loaded did nothing; it now opens once loaded.

  After the fixes: no page overflow at any width. `#resumen` flags only the district SVG's clipped paths (no scroll; the screenshot is fine). Revisiting the map 8+8 times: 0 failures. An earlier "map failed" in the probe was the headless browser's GPU (failed full-page captures), not the app.
- L12: Deployed on 2026-11-08. `main` fast-forwarded to 12f32af and pushed, and `feat/3d-showcase` was pushed. Vercel production is Ready (monitoreo-independencia-oisg044h0). Production checks:
  - `/` returns 200 and `/api/panel` returns 200; `/simulador/palcacocha.html` returns 404, as intended.
  - At 1400 and 390 px the simulation opens and plays, Fuentes lists OSIPTEL, RENIPRESS, Somos-Valenzuela and Terrain Tiles, there is no overflow and the console shows no errors.
