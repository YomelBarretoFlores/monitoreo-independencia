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
- S9 (carried): proposal, not official; no logos or authority names; every figure has a source; no WAF bypass; UI in Spanish, code in English; good practices and performance.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S8 | inline | done: reproduced dark-on-dark hover on `a.btn` in Chrome; `a:not([class]):hover` + `.btn` text-decoration none; re-hovered: readable | see git log |
| T2 | S5, S6, S7 | inline | pending: tour notice, progress and length; reset control | — |
| T3 | S4 | inline | pending: `scripts/glof/routes.py` → `data/glof/routes.json` + contract test | — |
| T4 | S3, S4 | inline | pending: `src/lib/glof.ts` (lakes, scenarios with ranges, evidence, gradient) + tests | — |
| T5 | S1, S2, S3, S4 | inline | pending: `src/sections/glof-sim.ts` on the map, control strip, card; retire the teardown page | — |
| T6 | S1 | inline | optional: record the map version as a video, if the user wants it | — |

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
