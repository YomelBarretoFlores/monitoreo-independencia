import type { DayForecast, ElNino, RiverPoint } from '../../shared/types.ts';
import { axisTicks, linePath, niceMax, scale, ticks } from '../lib/chart.ts';
import { esc, fmtDateShort, fmtDay, fmtHour, fmtNum } from '../lib/format.ts';

// Hand-built inline SVG charts. Each takes the pixel width of its container so text stays
// at its real size (no viewBox scaling), and carries a <title>/<desc> for screen readers.

let uid = 0;
const nextId = () => `ch${++uid}`;

function svgOpen(w: number, h: number, title: string, desc: string): string {
  const id = nextId();
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}t ${id}d">
    <title id="${id}t">${esc(title)}</title><desc id="${id}d">${esc(desc)}</desc>`;
}

function yAxis(max: number, y: (v: number) => number, x0: number, x1: number, unit: string, digits = 0): string {
  const ts = axisTicks(max);
  const d = Math.max(digits, ts.some((t) => !Number.isInteger(t)) ? 1 : 0);
  return ts
    .map(
      (t, i) => `<line class="grid" x1="${x0}" x2="${x1}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="ax" x="${x0 - 6}" y="${y(t) + 4}" text-anchor="end">${fmtNum(t, d)}${i === ts.length - 1 ? ` ${unit}` : ''}</text>`,
    )
    .join('');
}

/** 21-day rain bars: past days muted, forecast in the accent color, today marked. */
export function rainChart(daily: DayForecast[], today: string, w: number): string {
  const h = 220;
  const m = { l: 52, r: 8, t: 14, b: 30 };
  const iw = w - m.l - m.r;
  const n = daily.length || 1;
  const band = iw / n;
  const max = niceMax(Math.max(...daily.map((d) => d.precipMm), 0));
  const y = scale([0, max], [h - m.b, m.t]);
  const step = Math.max(1, Math.ceil(30 / band));
  const ti = daily.findIndex((d) => d.date === today);
  const bars = daily
    .map((d, i) => {
      const x = m.l + i * band + band * 0.16;
      const bw = Math.max(2, band * 0.68);
      const fc = d.date >= today;
      const top = y(d.precipMm);
      const label = d.date === today ? 'Hoy' : String(Number(d.date.slice(8, 10)));
      const showLabel = d.date === today || (i % step === 0 && Math.abs(i - ti) >= step);
      return `<g><title>${esc(fmtDay(d.date))}: ${fmtNum(d.precipMm, 1)} mm${fc ? ' (pronóstico)' : ''}</title>
        <rect class="${fc ? 'bar-fc' : 'bar-past'}${d.date === today ? ' bar-today' : ''}" x="${x}" y="${top}" width="${bw}" height="${Math.max(0, h - m.b - top)}" rx="2"/></g>
        ${showLabel ? `<text class="ax${d.date === today ? ' ax-strong' : ''}" x="${x + bw / 2}" y="${h - m.b + 18}" text-anchor="middle">${label}</text>` : ''}`;
    })
    .join('');
  const todayLine =
    ti >= 0 ? `<line class="today-line" x1="${m.l + ti * band}" x2="${m.l + ti * band}" y1="${m.t}" y2="${h - m.b}"/>` : '';
  const total = daily.filter((d) => d.date >= today).reduce((s, d) => s + d.precipMm, 0);
  return `${svgOpen(w, h, 'Lluvia por día', `Lluvia diaria de los últimos 7 días y pronóstico de los próximos 14. Total pronosticado: ${fmtNum(total, 0)} mm.`)}
    ${yAxis(max, y, m.l, w - m.r, 'mm')}${todayLine}${bars}
    <line class="base" x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}"/></svg>`;
}

/** Next 48 h of hourly rain. */
export function hourlyChart(hourly: { time: string; precipMm: number }[], w: number): string {
  const h = 130;
  const m = { l: 52, r: 8, t: 10, b: 26 };
  const iw = w - m.l - m.r;
  const n = hourly.length || 1;
  const band = iw / n;
  const max = niceMax(Math.max(...hourly.map((p) => p.precipMm), 0));
  const y = scale([0, max], [h - m.b, m.t]);
  const every = band * 6 >= 44 ? 6 : 12;
  const bars = hourly
    .map((p, i) => {
      const top = y(p.precipMm);
      const x = m.l + i * band;
      const hh = Number(fmtHour(p.time).slice(0, 2));
      return `<rect class="bar-fc" x="${x + band * 0.1}" y="${top}" width="${Math.max(1, band * 0.8)}" height="${Math.max(0, h - m.b - top)}" rx="1"><title>${esc(fmtDay(p.time))} ${fmtHour(p.time)}: ${fmtNum(p.precipMm, 1)} mm</title></rect>
      ${hh % every === 0 ? `<text class="ax" x="${x + band / 2}" y="${h - m.b + 16}" text-anchor="middle">${hh === 0 ? esc(fmtDay(p.time)) : fmtHour(p.time)}</text>` : ''}`;
    })
    .join('');
  return `${svgOpen(w, h, 'Lluvia por hora, próximas 48 horas', 'Lluvia esperada hora por hora durante los próximos dos días.')}
    ${yAxis(max, y, m.l, w - m.r, 'mm', max < 4 ? 1 : 0)}${bars}
    <line class="base" x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}"/></svg>`;
}

/** River discharge: past solid area, forecast dashed with its upper range, 30-day mean as reference. */
export function riverChart(r: RiverPoint, w: number): string {
  const h = 200;
  const m = { l: 60, r: 10, t: 14, b: 28 };
  const s = r.series;
  const n = Math.max(1, s.length - 1);
  const max = niceMax(Math.max(...s.map((p) => Math.max(p.dischargeM3s, p.maxM3s ?? 0)), r.referenceM3s ?? 0));
  const x = scale([0, n], [m.l, w - m.r]);
  const y = scale([0, max], [h - m.b, m.t]);
  const lastPast = s.reduce((acc, p, i) => (p.forecast ? acc : i), -1);
  const pastPts: [number, number][] = s.slice(0, lastPast + 1).map((p, i) => [x(i), y(p.dischargeM3s)]);
  const fcIdx = s.map((p, i) => [p, i] as const).filter(([p]) => p.forecast);
  const fcPts: [number, number][] = [
    ...(lastPast >= 0 ? [pastPts[pastPts.length - 1]] : []),
    ...fcIdx.map(([p, i]) => [x(i), y(p.dischargeM3s)] as [number, number]),
  ];
  const upper = fcIdx.filter(([p]) => p.maxM3s !== null);
  const bandPath =
    upper.length > 1
      ? `${linePath(upper.map(([p, i]) => [x(i), y(p.maxM3s as number)]))}${linePath(
          [...upper].reverse().map(([p, i]) => [x(i), y(p.dischargeM3s)]),
        ).replace('M', 'L')}Z`
      : '';
  const area = pastPts.length > 1 ? `${linePath(pastPts)}L${pastPts[pastPts.length - 1][0]} ${h - m.b}L${pastPts[0][0]} ${h - m.b}Z` : '';
  const ref = r.referenceM3s;
  const refLine =
    ref !== null
      ? `<line class="ref-line" x1="${m.l}" x2="${w - m.r}" y1="${y(ref)}" y2="${y(ref)}"/>
         <text class="ax ax-ref" x="${m.l + 6}" y="${y(ref) - 6}">Promedio del último mes: ${fmtNum(ref, 1)} m³/s</text>`
      : '';
  const todayX = lastPast >= 0 ? x(lastPast) : null;
  const labels = [0, lastPast, s.length - 1]
    .filter((i, k, a) => i >= 0 && a.indexOf(i) === k)
    .map((i) => {
      const anchor = i === 0 ? 'start' : i === s.length - 1 ? 'end' : 'middle';
      const text = i === lastPast ? 'Hoy' : fmtDateShort(s[i].date);
      return `<text class="ax${i === lastPast ? ' ax-strong' : ''}" x="${x(i)}" y="${h - m.b + 18}" text-anchor="${anchor}">${esc(text)}</text>`;
    })
    .join('');
  const last = lastPast >= 0 ? s[lastPast].dischargeM3s : null;
  return `${svgOpen(w, h, `Caudal de ${r.name}`, `Caudal estimado en metros cúbicos por segundo. Último valor: ${fmtNum(last, 1)} m³/s.`)}
    ${yAxis(max, y, m.l, w - m.r, 'm³/s')}
    ${area ? `<path class="river-area" d="${area}"/>` : ''}
    ${bandPath ? `<path class="river-band" d="${bandPath}"/>` : ''}
    ${refLine}
    ${pastPts.length > 1 ? `<path class="river-line" d="${linePath(pastPts)}"/>` : ''}
    ${fcPts.length > 1 ? `<path class="river-fc" d="${linePath(fcPts)}"/>` : ''}
    ${todayX !== null ? `<line class="today-line" x1="${todayX}" x2="${todayX}" y1="${m.t}" y2="${h - m.b}"/><circle class="river-dot" cx="${todayX}" cy="${y(last as number)}" r="4"/>` : ''}
    <line class="base" x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}"/>${labels}</svg>`;
}

/** ONI bars around zero: warm (positive) and cool (negative), with the ±0.5 thresholds. */
export function oniChart(oni: ElNino['oni'], w: number): string {
  const h = 210;
  const m = { l: 40, r: 10, t: 14, b: 30 };
  const n = oni.length || 1;
  const band = (w - m.l - m.r) / n;
  const lim = niceMax(Math.max(1, ...oni.map((o) => Math.abs(o.anomaly))));
  const y = scale([-lim, lim], [h - m.b, m.t]);
  const step = Math.max(1, Math.ceil(46 / band));
  const bars = oni
    .map((o, i) => {
      const x = m.l + i * band + band * 0.15;
      const bw = Math.max(2, band * 0.7);
      const top = Math.min(y(o.anomaly), y(0));
      const cls = o.anomaly >= 0.5 ? 'oni-warm' : o.anomaly <= -0.5 ? 'oni-cool' : 'oni-neutral';
      const isLast = i === oni.length - 1;
      const show = (oni.length - 1 - i) % step === 0;
      return `<rect class="${cls}" x="${x}" y="${top}" width="${bw}" height="${Math.abs(y(o.anomaly) - y(0))}" rx="1.5"><title>${esc(o.season)} ${o.year}: ${o.anomaly > 0 ? '+' : ''}${fmtNum(o.anomaly, 2)} °C</title></rect>
        ${isLast ? `<text class="ax ax-strong" x="${x + bw / 2}" y="${o.anomaly >= 0 ? top - 6 : top + Math.abs(y(o.anomaly) - y(0)) + 14}" text-anchor="end">${o.anomaly > 0 ? '+' : ''}${fmtNum(o.anomaly, 2)}</text>` : ''}
        ${show ? `<text class="ax" x="${x + bw / 2}" y="${h - m.b + 18}" text-anchor="middle">${esc(o.season)} ${String(o.year).slice(2)}</text>` : ''}`;
    })
    .join('');
  const thr = (v: number, label: string) =>
    `<line class="thr-line" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax ax-thr" x="${m.l + 4}" y="${y(v) + (v > 0 ? -5 : 13)}">${label}</text>`;
  const grid = ticks(lim * 2, 4)
    .map((t) => t - lim)
    .map((t) => `<text class="ax" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? '+' : ''}${fmtNum(t, 1)}</text>`)
    .join('');
  const last = oni.at(-1);
  return `${svgOpen(w, h, 'Índice Oceánico El Niño (ONI)', `Anomalía de temperatura del océano Pacífico central en las últimas ${oni.length} temporadas.${last ? ` Última: ${last.season} ${last.year}, ${fmtNum(last.anomaly, 2)} °C.` : ''}`)}
    ${grid}${thr(0.5, '+0.5 · umbral El Niño')}${thr(-0.5, '−0.5 · umbral La Niña')}
    <line class="base" x1="${m.l}" x2="${w - m.r}" y1="${y(0)}" y2="${y(0)}"/>${bars}</svg>`;
}
