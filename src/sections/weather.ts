import type { DayForecast, Panel, WeatherWarning } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtDay, fmtNum, limaToday, timeUntil } from '../lib/format.ts';
import { levelRank } from '../lib/levels.ts';
import { rainNextDays } from '../lib/panel.ts';
import { hourlyChart, rainChart } from '../ui/charts.ts';
import { levelBadge, link, shell, type Ctx } from '../ui/shell.ts';

// Lluvias y clima: SENAMHI warnings, daily/hourly rain and temperatures.

function warningCard(w: WeatherWarning, now: number): string {
  const start = Date.parse(w.start);
  const end = Date.parse(w.end);
  const when =
    end <= now
      ? '<span class="pill pill-muted">Terminado</span>'
      : start > now
        ? `<span class="pill pill-info">Empieza ${esc(timeUntil(w.start, now))}</span>`
        : '<span class="pill pill-live">Vigente ahora</span>';
  return `<li class="warn lv-${w.level}">
    <div class="warn-top">${levelBadge(w.level, w.levelLabel)}${when}</div>
    <p class="warn-title">${esc(w.title)}</p>
    <p class="warn-meta">Aviso N° ${esc(w.number)} · del ${esc(fmtDateTime(w.start))} al ${esc(fmtDateTime(w.end))}</p>
    ${link(w.url, 'Ver aviso en SENAMHI <span aria-hidden="true">↗</span>', 'more')}
  </li>`;
}

export function renderWarnings(p: Panel | null, ctx: Ctx): string {
  return shell(p?.warnings, ctx, {
    title: 'Avisos de SENAMHI para el distrito',
    empty: 'Sin avisos vigentes',
    emptyHint: 'SENAMHI no tiene avisos meteorológicos que cubran Independencia en este momento.',
    body: (list) => {
      const sorted = [...list].sort((a, b) => levelRank(b.level) - levelRank(a.level) || a.start.localeCompare(b.start));
      return `<ul class="warns">${sorted.map((w) => warningCard(w, ctx.now)).join('')}</ul>`;
    },
  });
}

const rainWord = (mm: number) => (mm >= 10 ? 'lluvia fuerte' : mm >= 3 ? 'lluvia moderada' : mm >= 0.5 ? 'lluvia ligera' : 'sin lluvia');

/** Compact day-by-day strip: rain, chance and min/max temperature. */
export function dayStrip(days: DayForecast[], today: string): string {
  return `<ol class="strip">${days
    .map(
      (d) => `<li class="${d.date === today ? 'is-today' : ''}">
        <span class="strip-day">${d.date === today ? 'Hoy' : esc(fmtDay(d.date))}</span>
        <span class="strip-rain" title="${esc(rainWord(d.precipMm))}"><span class="drop" style="--rain:${Math.min(1, d.precipMm / 15)}" aria-hidden="true"></span>${fmtNum(d.precipMm, d.precipMm < 10 ? 1 : 0)}<small>mm</small></span>
        ${d.precipProbPct !== null ? `<span class="strip-prob">${fmtNum(d.precipProbPct)}%</span>` : ''}
        <span class="strip-temp"><b>${fmtNum(d.tMaxC)}°</b> / ${fmtNum(d.tMinC)}°</span>
      </li>`,
    )
    .join('')}</ol>`;
}

export function renderForecast(p: Panel | null, ctx: Ctx, width: number): string {
  const w = Math.max(260, width - 42);
  return shell(p?.forecast, ctx, {
    title: 'Lluvia prevista en Independencia',
    empty: 'Sin pronóstico',
    tall: true,
    body: (fc) => {
      const today = limaToday(ctx.now);
      const next3 = rainNextDays(fc.daily, today, 3);
      const next7 = rainNextDays(fc.daily, today, 7);
      const upcoming = fc.daily.filter((d) => d.date >= today);
      const peak = upcoming.reduce<DayForecast | null>((a, d) => (!a || d.precipMm > a.precipMm ? d : a), null);
      return `<p class="lead">Se esperan <strong>${fmtNum(next3, 0)} mm</strong> de lluvia en los próximos 3 días y <strong>${fmtNum(next7, 0)} mm</strong> en la semana.${
        peak && peak.precipMm >= 1 ? ` El día más lluvioso sería el <strong>${esc(fmtDay(peak.date))}</strong> (${fmtNum(peak.precipMm, 0)} mm).` : ''
      }</p>
      <div class="chart-box">${rainChart(fc.daily, today, w)}</div>
      <ul class="legend"><li><i class="sw sw-past"></i>Lluvia que cayó</li><li><i class="sw sw-fc"></i>Pronóstico</li><li><i class="sw sw-today"></i>Hoy</li></ul>
      <h4 class="sub-h">Próximas 48 horas</h4>
      <div class="chart-box">${hourlyChart(fc.hourly, w)}</div>
      <h4 class="sub-h">Próximos 7 días</h4>
      ${dayStrip(upcoming.slice(0, 7), today)}
      <details class="method"><summary>¿De dónde sale el pronóstico?</summary>
        <p>Es el pronóstico del modelo Open-Meteo para el centro del distrito (${fmtNum(fc.point[0], 3)}, ${fmtNum(fc.point[1], 3)}). La lluvia de los días pasados también es una estimación del modelo, no una medición de estación. Como referencia: más de 10 mm en un día es lluvia fuerte para Huaraz.</p>
      </details>`;
    },
  });
}
