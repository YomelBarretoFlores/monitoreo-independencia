import type { Panel } from '../../shared/types.ts';
import { esc, fmtDate, fmtNum } from '../lib/format.ts';
import { oniPhase } from '../lib/panel.ts';
import { oniChart } from '../ui/charts.ts';
import { levelBadge, link, shell, type Ctx } from '../ui/shell.ts';

// Fenómeno El Niño: ENFEN official status, communiqués and the NOAA ONI history.

const PHASE_TEXT = {
  calido: 'El océano está más caliente de lo normal: condición de El Niño.',
  neutro: 'El océano está dentro de lo normal: condición neutra.',
  frio: 'El océano está más frío de lo normal: condición de La Niña.',
} as const;

export function renderElNino(p: Panel | null, ctx: Ctx, width: number): string {
  return shell(p?.elNino, ctx, {
    card: false,
    empty: 'Sin información de El Niño',
    tall: true,
    body: (n) => {
      const two = width >= 860;
      const chartW = Math.max(260, (two ? Math.floor((width - 20) * 0.6) : width) - 42);
      const last = n.oni.at(-1);
      const status = n.enfenStatus
        ? `<div class="nino-status lv-${n.enfenLevel}">
            ${levelBadge(n.enfenLevel)}
            <p class="nino-name">${esc(n.enfenStatus)}</p>
            <p class="muted">Estado oficial del sistema de alerta ante El Niño en la costa peruana, que también anticipa lluvias en la sierra de Áncash.</p>
          </div>`
        : '<p class="muted">ENFEN no publicó un estado reciente.</p>';
      const comms = n.communiques.length
        ? `<ul class="links">${n.communiques
            .map((c) => `<li>${link(c.url, esc(c.title))}<span class="muted"> · ${esc(fmtDate(c.date))}</span></li>`)
            .join('')}</ul>`
        : '<p class="muted">Sin comunicados recientes.</p>';
      return `<div class="grid nino" style="--cols:${two ? '2fr 3fr' : '1fr'}">
        <article class="card">
          <header class="card-h"><h3>Lo que dice ENFEN</h3></header>
          ${status}
          <h4 class="sub-h">Últimos comunicados</h4>
          ${comms}
        </article>
        <article class="card">
          <header class="card-h"><h3>Temperatura del océano (índice ONI)</h3></header>
          ${last ? `<p class="lead">Última medición (${esc(last.season)} ${last.year}): <strong>${last.anomaly > 0 ? '+' : ''}${fmtNum(last.anomaly, 2)} °C</strong>. ${esc(PHASE_TEXT[oniPhase(last.anomaly)])}</p>` : ''}
          <div class="chart-box">${oniChart(n.oni, chartW)}</div>
          <p class="muted">Si las barras pasan la línea de +0.5, el océano está más caliente de lo normal (El Niño); por debajo de −0.5, más frío (La Niña).</p>
          <ul class="legend"><li><i class="sw sw-warm"></i>Cálido</li><li><i class="sw sw-neutral"></i>Normal</li><li><i class="sw sw-cool"></i>Frío</li></ul>
        </article>
      </div>
      <details class="method"><summary>¿Qué es el índice ONI?</summary>
        <p>El ONI de la NOAA (EE. UU.) es el promedio de 3 meses de la diferencia de temperatura del mar en el Pacífico central frente a lo normal. Cada barra es una temporada (por ejemplo, ASO = agosto, septiembre y octubre). ENFEN es la comisión peruana que declara oficialmente las alertas de El Niño Costero.</p>
      </details>`;
    },
  });
}
