# monitoreo-mvp: monitoring system for the mayor of Independencia (Huaraz, Áncash)

Objective: centralize live public data (rain, rivers, glacial lakes, El Niño, emergencies, news, management) in one light-themed web system, shown to the mayor as a proposal.
Branch: `feat/mvp`. Delivery: local only until the user approves a remote/deploy. Test runner: `npm test` (vitest), `npm run typecheck`, `npm run build`.

## Specs

- S1 Purpose (verbatim): "Quisiera que extraigas datos que te diré y los coloques en un dashboard moderno y de tema claro para que el alcalde del distrito de Independencia vizualice y se de valor todo." / "Es para ayudar sobre el tema de las lluvias y el fenómeno del niño."
- S2 Sources (verbatim): "Sacar datos de ríos, noticias sobre el distrito de independencia y así el alcalde tenga toda esa información actualizada" / "quiero que toda la información de diferentes fuentes se centralice en un sistema." / "no solo esos datos que menciono de ríos o noticias, sino que puedes traer muchos más datos importantes para el distrito de Independencia y sea de valor para el alcalde." / "Quiero todo tipo de información que sea de ayuda para el alcalde del distrito de Independencia."
- S3 Separate system (verbatim): "Esto debe de ser aparte porque es para el alcalde de Independencia y se le va a mostrar como propuesta." / "quizás una sistema completo de monitoreo." / "debe de ser aparte, un repositorio aparte e Independiente."
- S4 Reuse (verbatim): "Creo que incluso en el sistema de resultados ancash hay información útil para Independencia." → import Independencia's investments, SEACE processes and election results from `../resultados-ancash/src/data/` (ONPE ubigeo `020102`, INEI `020105`, obras `prov:2, dist:15` to verify).
- S5 (assumption, from the research in L2) Data only from sources a server can fetch without login, captcha or WAF; never bypass protections. Each section shows its source, last update and failures.
- S6 (assumption) UI copy in Spanish for a non-technical reader; answer first, method in collapsible details. No login in the MVP (public data only).

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T0 | S3 | inline | done: scaffold, shared contract `shared/types.ts` | |
| T1 | S2, S4, S5 | delegated writer (parallel with T2) | done: 11 live collectors + 2 static datasets; 47 server tests | feat(server) |
| T2 | S1, S6 | delegated writer (parallel with T1) | done: 46 UI tests, Chrome check desktop + 360 px | feat(ui) |
| T3 | S1–S6 | inline | done: 12/12 sources live, no console errors, README, Dockerfile | chore |

## Log

- L1 (2026-11-07) User request, verbatim: see S1–S4 (pasted request plus "Quiero todo tipo de información que sea de ayuda para el alcalde del distrito de Independencia. Esto debe de ser aparte porque es para el alcalde de Independencia y se le va a mostrar como propuesta. Quizás me equivoqué al decir dashboard, quizás una sistema completo de monitoreo. Como te dije, debe de ser aparte, un repositorio aparte e Independiente. Creo que incluso en el sistema de resultados ancash hay información útil para Independencia.").
- L2 (2026-11-07) Source research (verified by fetching):
  - Usable server-side:
    - SENAMHI warning polygons (GeoServer `g_aviso:view_aviso`, GetFeatureInfo JSON)
    - Open-Meteo forecast
    - Open-Meteo flood API (GloFAS discharge; verified ~9 m³/s at -9.51,-77.53)
    - ENFEN `wp-json`
    - NOAA ONI `oni.ascii.txt`
    - INDECI COEN RSS `portal.indeci.gob.pe/emergencias/feed/`
    - IGP `ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb/<year>`
    - Google News RSS
    - huaraznoticias.com and ancashnoticias.com feeds
    - El Peruano `busquedas.elperuano.pe/api/v1/normas?query=`
    - CENEPRED `sigrid.cenepred.gob.pe/arcgis/rest/services/FEN/ER_NINO2027_BD/MapServer/{4,5}` (ubigeo 020105)
    - ANA GeoSNIRH lakes layer
    - OSM relation 1953273 (`pe:ubigeo=020105`)
  - Blocked or unavailable:
    - SENAMHI station data (Cloudflare Turnstile)
    - INAIGEM Palcacocha telemetry (no public feed)
    - MEF Consulta Amigable (Imperva)
    - SINPAD (down)
- L3 (2026-11-07) Seam check: typecheck clean, 93 tests, build OK; server with real network reached 12/12 sources OK; page rendered in Chrome with no console errors. Decisions: CARTO tiles now need a key → Esri Light Gray Canvas; PGlite moved to dependencies so the image runs without Postgres (snapshots are a rebuildable cache); summary thresholds are an MVP proposal, not official. Pending (user decisions): GitHub remote, deploy/domain, INAIGEM agreement for Palcacocha data.
