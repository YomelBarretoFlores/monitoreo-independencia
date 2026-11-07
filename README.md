# Monitoreo Independencia

Propuesta de sistema de monitoreo para la Municipalidad Distrital de Independencia (Huaraz, Áncash).
Reúne en una sola página, en tema claro, datos públicos que se actualizan solos: lluvias y avisos,
ríos, lagunas glaciares, Fenómeno El Niño, emergencias, sismos, noticias, normas legales, riesgo,
gestión municipal (inversiones y contrataciones) y resultados electorales del distrito.

## Fuentes

| Sección | Fuente | Frecuencia |
|---|---|---|
| Avisos de lluvia | SENAMHI (avisos + capa geográfica que dice si cubren el distrito) | 60 min |
| Pronóstico | Open-Meteo | 60 min |
| Ríos (caudal modelado, no medido) | GloFAS vía Open-Meteo Flood API | 3 h |
| Lagunas glaciares | Datos fijos (ANA, OSM) + pronóstico Open-Meteo en cada laguna | 60 min |
| El Niño | ENFEN (comunicados) + NOAA ONI | 6 h / 24 h |
| Emergencias | INDECI – COEN (RSS, filtrado a Áncash) | 30 min |
| Sismos | IGP (150 km a la redonda) | 30 min |
| Noticias | Google News + Huaraz Noticias + Ancash Noticias | 30 min |
| Normas legales | El Peruano | 12 h |
| Riesgo y población | CENEPRED – escenario FEN 2027 | 24 h |
| Inversiones, contrataciones, elecciones | Importados de `resultados-ancash` (MEF, Infobras, OECE, ONPE) | fijo |

No se usan fuentes con login, captcha o protección anti-robots. Quedan fuera: estaciones de SENAMHI
(Cloudflare Turnstile), telemetría de Palcacocha (INAIGEM no la publica), Consulta Amigable del MEF.

## Comandos

```bash
npm run dev:server   # API + recolectores en http://localhost:8787 (PGlite en .datos/)
npm run dev          # interfaz en http://localhost:5173 (usa /api del servidor); ?demo = datos de ejemplo
npm test             # vitest: parsers, reglas del nivel general, API e interfaz
npm run typecheck
npm run build
npm run collect -- --out panel.json   # consulta todas las fuentes una vez e imprime su estado
npm start            # producción: sirve dist/ y la API
node scripts/import-resultados.ts      # regenera data/inversiones.json y data/elecciones.json
node scripts/build-official-geo.ts <per_admin3.geojson>  # regenera límites IGN y ríos ANA (ver cabecera del script)
```

Variables: `PORT` (8787), `DATABASE_URL` (opcional; sin ella PGlite en `DATA_DIR`, por defecto `.datos/`),
`DIST_DIR` (`dist`), `COLLECT=0` para no consultar fuentes.

## Estructura

- `shared/types.ts`: contrato entre servidor e interfaz (`GET /api/panel` → `Panel`).
- `server/`: recolectores (`collectors/`), guardado de la última respuesta buena por fuente
  (`snapshots`), nivel general (`summary.ts`, umbrales documentados ahí), HTTP (`app.ts`).
- `src/`: interfaz sin framework con barra lateral y una vista por tema (rutas `#resumen`, `#lluvias`, `#rios`, `#nino`, `#emergencias`, `#mapa`, `#noticias`, `#gestion`, `#fuentes`); disposición de cada vista en `src/views.ts`, lógica pura en `src/lib/` (probada), secciones en `src/sections/`.
- `data/`: datos fijos versionados (lagunas, inversiones, elecciones; límites distritales del IGN y ríos de la ANA, con su fuente en cada archivo).

Los umbrales del nivel general son una propuesta inicial, no valores oficiales: conviene calibrarlos
con SENAMHI e INDECI. El mapa se dibuja con capas oficiales (límites del IGN, ríos de la ANA); el mapa base de Esri Light Gray Canvas es opcional (revisar sus términos antes de producción).
