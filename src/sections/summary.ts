import type { Level, Panel } from '../../shared/types.ts';
import { esc, fmtNum, limaToday } from '../lib/format.ts';
import { levelHeadline, levelIcon, levelLabel, maxLevel } from '../lib/levels.ts';
import { countSince, isLocal, rainNextDays, riverTrend, TREND_LABEL } from '../lib/panel.ts';
import { ago, offlineBox, type Ctx } from '../ui/shell.ts';

// "¿Cómo estamos hoy?": overall traffic light, its reasons, and the key numbers.

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  href: string;
  level?: Level;
}

function tile(k: Kpi): string {
  const lv = k.level ? ` lv-${k.level}` : '';
  return `<a class="kpi${lv}" href="${k.href}">
    <span class="kpi-label">${esc(k.label)}</span>
    <span class="kpi-value${/^[\d.,—-]+$/.test(k.value) ? '' : ' kpi-value-text'}">${esc(k.value)}${k.unit ? `<small>${esc(k.unit)}</small>` : ''}</span>
    <span class="kpi-sub">${k.level && k.level !== 'normal' ? `${levelIcon(k.level)} ` : ''}${esc(k.sub)}</span>
  </a>`;
}

const NO_DATA = 'Sin datos por ahora';

function kpis(p: Panel, now: number): Kpi[] {
  const out: Kpi[] = [];
  const fc = p.forecast.data;
  const today = limaToday(now);
  const rain = fc ? rainNextDays(fc.daily, today, 3) : null;
  out.push({
    label: 'Lluvia en los próximos 3 días',
    value: rain === null ? '—' : fmtNum(rain, 0),
    unit: rain === null ? undefined : 'mm',
    sub: rain === null ? NO_DATA : rain >= 30 ? 'Lluvias intensas previstas' : rain >= 10 ? 'Lluvias moderadas previstas' : 'Poca lluvia prevista',
    href: '#lluvias',
    level: rain === null ? undefined : rain >= 30 ? 'atencion' : 'normal',
  });

  const warnings = p.warnings.data;
  const active = warnings?.filter((w) => Date.parse(w.end) > now) ?? null;
  out.push({
    label: 'Avisos de SENAMHI vigentes',
    value: active === null ? '—' : String(active.length),
    sub: active === null ? NO_DATA : active.length ? `El más alto: ${levelLabel(maxLevel(active.map((w) => w.level)))}` : 'Sin avisos para el distrito',
    href: '#lluvias',
    level: active?.length ? maxLevel(active.map((w) => w.level)) : active ? 'normal' : undefined,
  });

  const nino = p.elNino.data;
  out.push({
    label: 'El Niño (ENFEN)',
    value: nino?.enfenStatus ? levelLabel(nino.enfenLevel) : '—',
    sub: nino?.enfenStatus ?? NO_DATA,
    href: '#nino',
    level: nino ? nino.enfenLevel : undefined,
  });

  const rivers = p.rivers.data;
  const worstRiver = rivers?.length ? (rivers.find((r) => r.level === maxLevel(rivers.map((x) => x.level))) ?? rivers[0]) : null;
  const trend = worstRiver ? riverTrend(worstRiver) : null;
  out.push({
    label: worstRiver ? worstRiver.name.replace(/\s*\(.*\)$/, '') : 'Ríos',
    value: trend ? TREND_LABEL[trend] : '—',
    sub: worstRiver ? `Nivel: ${levelLabel(worstRiver.level)} (caudal estimado)` : NO_DATA,
    href: '#rios',
    level: worstRiver?.level,
  });

  const em = p.emergencies.data;
  const em7 = em ? countSince(em, now, 7) : null;
  const local = em ? countSince(em.filter(isLocal), now, 7) : 0;
  out.push({
    label: 'Emergencias en 7 días (INDECI)',
    value: em7 === null ? '—' : String(em7),
    sub: em7 === null ? NO_DATA : local ? `${local} en Huaraz o Independencia` : 'Ninguna en Huaraz o Independencia',
    href: '#emergencias',
    level: em7 === null ? undefined : local ? 'atencion' : 'normal',
  });

  const qs = p.earthquakes.data;
  const near = qs?.filter((q) => q.distanceKm <= 100 && now - Date.parse(q.date) <= 7 * 86_400_000) ?? null;
  const maxMag = near?.length ? Math.max(...near.map((q) => q.magnitude)) : null;
  out.push({
    label: 'Sismos a menos de 100 km (7 días)',
    value: near === null ? '—' : String(near.length),
    sub: near === null ? NO_DATA : maxMag !== null ? `El mayor: magnitud ${fmtNum(maxMag, 1)}` : 'Ninguno registrado',
    href: '#emergencias',
    level: maxMag === null ? (near ? 'normal' : undefined) : maxMag >= 5.5 ? 'alerta' : maxMag >= 4.5 ? 'atencion' : 'normal',
  });
  return out;
}

export function renderSummary(p: Panel | null, ctx: Ctx): string {
  if (!p) {
    if (ctx.state === 'offline') return offlineBox();
    return `<div class="hero is-loading" aria-busy="true"><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div></div>
      <div class="kpis">${'<div class="kpi is-loading"><div class="sk sk-line"></div><div class="sk sk-title"></div></div>'.repeat(6)}</div>`;
  }
  const { level, reasons } = p.summary;
  const list = reasons.length
    ? `<ul class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
    : '<p class="reasons-none">No hay señales de alerta en las fuentes consultadas.</p>';
  return `<div class="hero lv-${level}">
      <div class="hero-light" aria-hidden="true">${levelIcon(level)}</div>
      <div class="hero-main">
        <p class="hero-kicker">Nivel general del distrito · <span class="hero-level">${esc(levelLabel(level))}</span></p>
        <p class="hero-headline">${esc(levelHeadline(level))}</p>
        ${list}
        <p class="hero-meta">Actualizado ${ago(p.generatedAt, ctx.now)} · Se revisa solo cada 10 minutos</p>
      </div>
    </div>
    <div class="kpis">${kpis(p, ctx.now).map(tile).join('')}</div>
    <details class="method">
      <summary>¿Cómo se calcula el nivel general?</summary>
      <p>El sistema toma el nivel más alto entre los avisos vigentes de SENAMHI, el estado oficial de El Niño (ENFEN), el caudal estimado de los ríos y las emergencias recientes en Huaraz e Independencia. Verde: normal; amarillo: estar atentos; naranja: alerta; rojo: emergencia. Cada motivo aparece en la lista para que se pueda verificar en su fuente.</p>
    </details>`;
}
