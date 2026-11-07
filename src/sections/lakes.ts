import type { GlacialLake, Panel } from '../../shared/types.ts';
import { esc, fmtNum, limaToday } from '../lib/format.ts';
import { shell, type Ctx } from '../ui/shell.ts';
import { dayStrip } from './weather.ts';

// Lagunas glaciares: Palcacocha first, facts, risk note and the weather forecast at each lake.

function lakeCard(l: GlacialLake, today: string): string {
  const total = l.forecast.reduce((s, d) => s + d.precipMm, 0);
  const minT = Math.min(...l.forecast.map((d) => d.tMinC ?? Infinity));
  return `<article class="card lake${l.id === 'palcacocha' ? ' lake-main' : ''}">
    <header class="card-h"><h3>${esc(l.name)}</h3>${
      l.liveMonitoring
        ? '<span class="badge badge-live">Con monitoreo en vivo</span>'
        : '<span class="badge badge-muted">Sin datos en tiempo real</span>'
    }</header>
    <dl class="facts">
      <div><dt>Altitud</dt><dd>${l.elevationM !== null ? `${fmtNum(l.elevationM)} m` : '—'}</dd></div>
      <div><dt>Área</dt><dd>${l.areaKm2 !== null ? `${fmtNum(l.areaKm2, 2)} km²` : '—'}</dd></div>
      <div class="wide"><dt>Cuenca</dt><dd>${esc(l.basin)}</dd></div>
    </dl>
    <p class="lake-risk">${esc(l.riskNote)}</p>
    ${
      l.forecast.length
        ? `<h4 class="sub-h">Clima previsto en la laguna (7 días)</h4>
      <p class="muted">${fmtNum(total, 0)} mm de lluvia o nieve en la semana${Number.isFinite(minT) ? `; mínima de ${fmtNum(minT)} °C` : ''}.</p>
      ${dayStrip(l.forecast, today)}`
        : ''
    }
  </article>`;
}

const OPPORTUNITY = `<aside class="callout">
  <div class="callout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18.4 5.6l-2.1 2.1M21 12h-3M8 16a4 4 0 1 1 8 0c0 1.5-1 2.2-1.5 3h-5C9 18.2 8 17.5 8 16zM10 21h4"/></svg></div>
  <div>
    <p class="callout-title">Oportunidad: ver aquí la alerta temprana de Palcacocha</p>
    <p>Hoy ninguna institución publica en internet el nivel del agua de las lagunas en tiempo real. La laguna Palcacocha sí cuenta con sensores y un sistema de alerta temprana. Proponemos un <strong>convenio con INAIGEM y la ANA</strong> para integrar esos datos en este panel, de modo que el alcalde vea cualquier cambio en el mismo lugar que el resto de la información.</p>
  </div>
</aside>`;

export function renderLakes(p: Panel | null, ctx: Ctx, width: number): string {
  const body = shell(p?.lakes, ctx, {
    card: false,
    empty: 'Sin lagunas registradas',
    tall: true,
    body: (list) => {
      const today = limaToday(ctx.now);
      const sorted = [...list].sort((a, b) => Number(b.id === 'palcacocha') - Number(a.id === 'palcacocha'));
      const cols = width >= 980 ? 2 : 1;
      return `<div class="grid g-${cols} lakes">${sorted.map((l) => lakeCard(l, today)).join('')}</div>`;
    },
  });
  return `${OPPORTUNITY}${body}`;
}
