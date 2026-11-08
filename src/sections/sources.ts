import type { Panel, Section } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
import { CENTROS_SOURCES } from '../lib/centros.ts';
import { SOURCES as GLOF_SOURCES } from '../lib/glof.ts';
import { BASEMAPS } from '../lib/maplayers.ts';
import { MAP_SOURCES, monthYear } from '../lib/safezones.ts';
import { ago, link, offlineBox, skeleton, type Ctx } from '../ui/shell.ts';

// Fuentes: every section's SourceMeta in one table.

const SECTIONS: [keyof Panel, string][] = [
  ['warnings', 'Avisos de lluvia'],
  ['forecast', 'Pronóstico del tiempo'],
  ['rivers', 'Ríos'],
  ['lakes', 'Lagunas glaciares'],
  ['elNino', 'El Niño'],
  ['emergencies', 'Emergencias'],
  ['earthquakes', 'Sismos'],
  ['news', 'Noticias'],
  ['legal', 'Normas legales'],
  ['risk', 'Riesgo'],
  ['management', 'Gestión municipal'],
  ['elections', 'Elecciones'],
];

const every = (m: number | null) =>
  m === null
    ? 'Dato fijo'
    : m < 60
      ? `Cada ${m} min`
      : m % 60 === 0
        ? `Cada ${fmtNum(m / 60)} h`
        : `Cada ${m} min`;

const ESRI_URL = 'https://www.esri.com/';
const IGN_URL = 'https://data.humdata.org/dataset/cod-ab-per';
const ANA_URL = 'https://geosnirh.ana.gob.pe/';
const TERRAIN_URL = 'https://registry.opendata.aws/terrain-tiles/';

/** Fixed data and map layers: they do not refresh, so they are listed apart from the live sources. */
function staticSources(): string {
  const row = (section: string, sources: string, use: string) =>
    `<tr><td>${esc(section)}</td><td>${sources}</td><td>${esc(use)}</td></tr>`;
  const list = (items: { label: string; url: string | null; year?: number | string }[]) =>
    `<ul class="src-list">${items
      .map(
        (s) =>
          `<li>${link(s.url, esc(s.label))}${s.year ? ` <span class="muted">(${esc(String(s.year))})</span>` : ''}</li>`,
      )
      .join('')}</ul>`;
  const rows = [
    row(
      'Límites y ríos',
      list([
        {
          label: 'Instituto Geográfico Nacional (IGN), límites distritales vía HDX COD-AB Perú',
          url: IGN_URL,
        },
        { label: 'Autoridad Nacional del Agua (ANA), ríos y lagunas, GeoSNIRH', url: ANA_URL },
      ]),
      'Mapa del distrito',
    ),
    row(
      'Mapas base y relieve',
      list([
        {
          label: `Esri: ${BASEMAPS.filter((b) => b.tiles.length)
            .map((b) => b.label)
            .join(', ')}`,
          url: ESRI_URL,
        },
        { label: 'AWS Terrain Tiles (Mapzen): relieve 3D y cauce de cada laguna', url: TERRAIN_URL },
      ]),
      'Mapa, vista 3D y simulación del aluvión',
    ),
    row(
      'Zonas seguras ante aluvión',
      list(
        MAP_SOURCES.map((m) => ({
          label: `${m.title} (${m.author})`,
          url: m.pdf ?? m.page,
          year: monthYear(m.date),
        })),
      ),
      'Capas de peligro, zonas seguras y rutas de evacuación',
    ),
    row(
      'Brechas por centro poblado',
      list(Object.values(CENTROS_SOURCES)),
      'Columnas 3D e índice de brechas',
    ),
    row(
      'Simulación del aluvión',
      list(Object.values(GLOF_SOURCES).filter((s) => s.url !== TERRAIN_URL)),
      'Tiempos, caudales, volúmenes de las lagunas y población expuesta',
    ),
  ].join('');
  return `<div class="card">
    <div class="card-h"><h3>Mapas y datos fijos</h3></div>
    <p class="muted">No se actualizan solos: se regeneran con los scripts del repositorio cuando la fuente publica una versión nueva.</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Tabla de mapas y datos fijos">
      <table class="table table-sources">
        <thead><tr><th scope="col">Sección</th><th scope="col">Fuentes</th><th scope="col">Dónde se usa</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

export function renderSources(p: Panel | null, ctx: Ctx): string {
  if (!p) return (ctx.state === 'offline' ? offlineBox() : skeleton(5)) + staticSources();
  const rows = SECTIONS.map(([key, label]) => {
    const { meta } = p[key] as Section<unknown>;
    const state = meta.ok
      ? '<span class="lv lv-normal"><i class="dot" aria-hidden="true"></i>Funciona</span>'
      : `<span class="lv lv-emergencia"><i class="dot" aria-hidden="true"></i>Falló</span>${meta.error ? `<span class="muted err">${esc(meta.error)}</span>` : ''}`;
    return `<tr>
      <td>${esc(label)}</td>
      <td>${link(meta.url, esc(meta.name))}</td>
      <td>${meta.updatedAt ? `${ago(meta.updatedAt, ctx.now)}<span class="muted">${esc(fmtDateTime(meta.updatedAt))}</span>` : 'Nunca'}</td>
      <td>${every(meta.everyMinutes)}</td>
      <td>${state}</td>
    </tr>`;
  }).join('');
  return `<div class="card">
    <div class="table-scroll" tabindex="0" role="region" aria-label="Tabla de fuentes">
      <table class="table table-sources">
        <thead><tr><th scope="col">Sección</th><th scope="col">Fuente</th><th scope="col">Última actualización</th><th scope="col">Frecuencia</th><th scope="col">Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <details class="method"><summary>¿Qué datos no están y por qué?</summary>
      <p>Solo se usan fuentes públicas que se pueden consultar sin usuario ni verificación humana. No se incluyen: las estaciones de SENAMHI (protegidas con verificación anti-robots), la telemetría de la laguna Palcacocha (INAIGEM no la publica), la Consulta Amigable del MEF (bloquea consultas automáticas) y SINPAD (fuera de servicio).</p>
    </details>
  </div>${staticSources()}`;
}
