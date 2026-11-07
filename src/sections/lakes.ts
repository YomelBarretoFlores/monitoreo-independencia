import type { GlacialLake, Panel } from '../../shared/types.ts';
import { esc, fmtNum, limaToday } from '../lib/format.ts';
import { icon } from '../ui/icons.ts';
import { shell, type Ctx } from '../ui/shell.ts';
import { dayStrip } from './weather.ts';

// Lagunas glaciares: Palcacocha first, facts, risk note and the weather forecast at each lake.

function lakeCard(l: GlacialLake, today: string): string {
  const total = l.forecast.reduce((s, d) => s + d.precipMm, 0);
  const minT = Math.min(...l.forecast.map((d) => d.tMinC ?? Infinity));
  return `<article class="card lake${l.id === 'palcacocha' ? ' lake-main' : ''}">
    <header class="card-h"><h3>${esc(l.name)}</h3>${
      l.liveMonitoring
        ? '<span class="tag-text">Con monitoreo en vivo</span>'
        : '<span class="tag-text">Sin datos en tiempo real</span>'
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

const OPPORTUNITY = () => `<aside class="callout">
  <div class="callout-icon">${icon('idea')}</div>
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
      return `<div class="g-${cols} lakes">${sorted.map((l) => lakeCard(l, today)).join('')}</div>`;
    },
  });
  return `${body}${OPPORTUNITY()}`;
}
