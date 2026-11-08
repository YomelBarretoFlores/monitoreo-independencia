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
| Zonas seguras ante aluvión | GeoPDF de Quillcay (MPH con la MDI, SINIA) y de Casca (INAIGEM), extraídos a `data/safe-zones/` | fijo |

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
npm run build:vercel # salida para Vercel en .vercel/output (Build Output API)
node scripts/import-resultados.ts      # regenera data/inversiones.json y data/elecciones.json
node scripts/build-official-geo.ts <per_admin3.geojson>  # regenera límites IGN y ríos ANA (ver cabecera del script)
```

Zonas seguras ante aluvión (`data/safe-zones/`): se regeneran desde los dos GeoPDF con Python, en un
entorno aparte (versiones fijas en `scripts/geopdf/requirements.txt`):

```bash
python3 -m venv /tmp/geopdf-venv && /tmp/geopdf-venv/bin/pip install -r scripts/geopdf/requirements.txt
/tmp/geopdf-venv/bin/python scripts/geopdf/extract.py --huaraz "<Quillcay.pdf>" --casca "<Casca.pdf>"
/tmp/geopdf-venv/bin/python -m unittest discover -s scripts/geopdf
```

Variables: `PORT` (8787), `DATABASE_URL` (opcional; sin ella PGlite en `DATA_DIR`, por defecto `.datos/`),
`DIST_DIR` (`dist`), `COLLECT=0` para no consultar fuentes.

## Desplegar en Vercel

En Vercel no hay un proceso que corra todo el tiempo, así que los datos se actualizan así:

- **Al consultar:** cada vez que alguien abre el panel, `/api/panel` responde con lo último guardado y,
  después de responder, consulta las fuentes vencidas (`waitUntil`).
- **Cron diario:** a las 06:00 de Lima, `/api/cron/collect` consulta lo que esté vencido, para los días
  sin visitas. El plan Hobby solo permite un cron al día; para cada 30 minutos hace falta el plan Pro.

Pasos:

1. En Vercel, importar el repositorio de GitHub. `vercel.json` ya define el build (`npm run build:vercel`)
   y la salida (`.vercel/output`); no hay que elegir framework.
2. Crear una base Postgres. Lo más simple: Storage → Neon desde el Marketplace de Vercel, que agrega
   `DATABASE_URL` sola. Usar la cadena con *pooling* y una región cercana a São Paulo (`gru1`, la región
   de las funciones).
3. Agregar la variable `CRON_SECRET` con un valor aleatorio largo (por ejemplo `openssl rand -hex 32`).
   Vercel la envía al llamar al cron; sin ella el endpoint del cron no existe.
4. Desplegar. Al abrir el panel por primera vez aparecerán las secciones vacías; las fuentes se llenan
   en menos de un minuto y se ven al recargar.

`npm run build:vercel` y `vercel build` reproducen el build en local, sin desplegar. El `Dockerfile` y
`npm start` siguen sirviendo para un servidor propio (con el recolector corriendo todo el tiempo).

## Estructura

- `shared/types.ts`: contrato entre servidor e interfaz (`GET /api/panel` → `Panel`).
- `server/`: recolectores (`collectors/`), guardado de la última respuesta buena por fuente
  (`snapshots`), nivel general (`summary.ts`, umbrales documentados ahí), HTTP (`app.ts`); en Vercel,
  entrada `vercel.ts` y actualización al consultar `refresh.ts` (empaquetado por `scripts/build-vercel.ts`).
- `src/`: interfaz sin framework con barra lateral y una vista por tema (rutas `#resumen`, `#lluvias`, `#rios`, `#nino`, `#emergencias`, `#mapa`, `#noticias`, `#gestion`, `#fuentes`); disposición de cada vista en `src/views.ts`, lógica pura en `src/lib/` (probada), secciones en `src/sections/`.
- `data/`: datos fijos versionados (lagunas, inversiones, elecciones; límites distritales del IGN y ríos de la ANA; zonas seguras ante aluvión en `safe-zones/`; cada archivo lleva su fuente).
- Mapa: `src/sections/map.ts` es una fachada liviana; el motor (MapLibre, `map-view.ts`), el panel de filtros (`safezones-panel.ts`) y los datos de aluvión (`src/lib/safezones-data.ts`) se descargan solo al abrir `#mapa`.

Los umbrales del nivel general son una propuesta inicial, no valores oficiales: conviene calibrarlos
con SENAMHI e INDECI. El mapa se dibuja con capas oficiales (límites del IGN, ríos de la ANA, peligro y zonas seguras de los mapas de aluvión); los mapas base de Esri y el relieve 3D (Terrain Tiles, AWS) son opcionales (revisar los términos de Esri antes de producción).
