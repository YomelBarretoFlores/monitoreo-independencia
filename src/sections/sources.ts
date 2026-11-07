import type { Panel, Section } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
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
  m === null ? 'Dato fijo' : m < 60 ? `Cada ${m} min` : m % 60 === 0 ? `Cada ${fmtNum(m / 60)} h` : `Cada ${m} min`;

export function renderSources(p: Panel | null, ctx: Ctx): string {
  if (!p) return ctx.state === 'offline' ? offlineBox() : skeleton(5);
  const rows = SECTIONS.map(([key, label]) => {
    const { meta } = p[key] as Section<unknown>;
    const state = meta.ok
      ? '<span class="status st-done">✓ Funciona</span>'
      : `<span class="status st-bad">✕ Falló</span>${meta.error ? `<span class="muted err">${esc(meta.error)}</span>` : ''}`;
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
  </div>`;
}
