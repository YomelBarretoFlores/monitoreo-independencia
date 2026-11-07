import type { Panel, RiverPoint } from '../../shared/types.ts';
import { esc, fmtNum } from '../lib/format.ts';
import { riverTrend, TREND_LABEL, type Trend } from '../lib/panel.ts';
import { riverChart } from '../ui/charts.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { levelBadge, shell, type Ctx } from '../ui/shell.ts';

// Ríos: modeled discharge per river point (GloFAS). Always say it is a model.

const TREND_ICON: Record<Trend, IconName | null> = {
  sube: 'trendUp',
  baja: 'trendDown',
  estable: 'trendFlat',
  'sin-datos': null,
};

function riverCard(r: RiverPoint, w: number): string {
  const past = r.series.filter((p) => !p.forecast);
  const last = past.at(-1)?.dischargeM3s ?? null;
  const trend = riverTrend(r);
  const vsRef = last !== null && r.referenceM3s ? ((last - r.referenceM3s) / r.referenceM3s) * 100 : null;
  const vsText =
    vsRef === null
      ? ''
      : Math.abs(vsRef) < 5
        ? 'similar al promedio del último mes'
        : `${fmtNum(Math.abs(vsRef), 0)}% ${vsRef > 0 ? 'por encima' : 'por debajo'} del promedio del último mes`;
  return `<article class="card river">
    <header class="card-h"><h3>${esc(r.name)}</h3>${levelBadge(r.level)}</header>
    <div class="river-stats">
      <div><span class="big">${fmtNum(last, 1)}</span><span class="big-unit">m³/s hoy</span></div>
      <div class="trend">${TREND_ICON[trend] ? icon(TREND_ICON[trend]) : ''}${esc(TREND_LABEL[trend])}</div>
    </div>
    ${vsText ? `<p class="muted">${esc(vsText)}.</p>` : ''}
    <div class="chart-box">${riverChart(r, w)}</div>
    <ul class="legend"><li><i class="sw sw-solid"></i>Caudal estimado</li><li><i class="sw sw-dash"></i>Pronóstico</li><li><i class="sw sw-band"></i>Rango alto posible</li></ul>
    <p class="note">Caudal estimado por modelo (GloFAS), no es una medición de estación.</p>
  </article>`;
}

export function renderRivers(p: Panel | null, ctx: Ctx, width: number): string {
  return shell(p?.rivers, ctx, {
    card: false,
    empty: 'Sin puntos de río disponibles',
    tall: true,
    body: (list) => {
      const cols = width >= 900 && list.length > 1 ? 2 : 1;
      const w = Math.max(260, Math.floor((width - (cols - 1) * 20) / cols) - 42);
      return `<div class="g-${cols}">${list.map((r) => riverCard(r, w)).join('')}</div>
      <details class="method"><summary>¿Cómo se calcula el caudal?</summary>
        <p>Los valores vienen del sistema europeo GloFAS (Copernicus), que estima el caudal de los ríos con un modelo a partir de la lluvia y el terreno. Sirve para ver tendencias (si el río sube o baja), pero no reemplaza una estación de medición. El nivel compara el caudal pronosticado con lo normal del último mes.</p>
      </details>`;
    },
  });
}
