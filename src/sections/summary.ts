import type { Level, Panel } from '../../shared/types.ts';
import { esc, fmtDay, fmtNum, fmtSolesShort, limaToday } from '../lib/format.ts';
import { bboxOf, labelPoint, pathFor, projector } from '../lib/geo.ts';
import { districts, INDEPENDENCIA, rivers } from '../lib/geodata.ts';
import { levelHeadline, levelLabel, maxLevel } from '../lib/levels.ts';
import { countSince, isLocal, rainNextDays, riverTrend, TREND_LABEL, type Trend } from '../lib/panel.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { ago, levelBadge, link, offlineBox, type Ctx } from '../ui/shell.ts';

// Resumen: a bento grid. One large tile (official map + overall level and its reasons) and
// smaller tiles that each answer one question with one figure and link to their view.

const NO_DATA = 'Sin datos por ahora';

interface Tile {
  cls: string;
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  context: string;
  level?: Level;
  href: string;
  go: string;
  extra?: string;
}

/** Round arrow button to the tile's view (top right, like the references). */
const goButton = (href: string, label: string) =>
  `<a class="tile-go" href="${href}" aria-label="${esc(label)}" title="${esc(label)}">${icon('external')}</a>`;

const tileHead = (ic: IconName, label: string, go?: { href: string; label: string }) =>
  `<header class="tile-h"><span class="tile-ic">${icon(ic)}</span><h2 class="tile-label">${esc(label)}</h2>${go ? goButton(go.href, go.label) : ''}</header>`;

function tile(t: Tile): string {
  const isText = !/^[\d.,\s−-]+$/.test(t.value) || t.value === '—';
  return `<article class="tile ${t.cls}">
    ${tileHead(t.icon, t.label, { href: t.href, label: t.go })}
    <p class="tile-value${isText ? ' is-text' : ''}">${esc(t.value)}${t.unit ? `<sup>${esc(t.unit)}</sup>` : ''}</p>
    <p class="tile-context">${t.level && t.level !== 'normal' ? `${levelBadge(t.level)} ` : ''}${esc(t.context)}</p>
    ${t.extra ?? ''}
  </article>`;
}

/** Tick bar: `share` (0..1) of the ticks filled, the rest hatched. */
function tickBar(share: number, label: string, n = 36): string {
  const on = Math.round(Math.max(0, Math.min(1, share)) * n);
  return `<div class="ticks" role="img" aria-label="${esc(label)}">${Array.from({ length: n }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('')}</div>`;
}

/** Static SVG of Huaraz province from the IGN boundaries, Independencia highlighted. */
function districtMap(p: Panel): string {
  const w = 420;
  const h = 360;
  const own = districts.features.find((f) => f.properties?.ubigeo === INDEPENDENCIA);
  if (!own) return '';
  // Frame on Independencia plus a margin so the neighbours read as context.
  const b = bboxOf([own]);
  const mx = (b[2] - b[0]) * 0.35;
  const my = (b[3] - b[1]) * 0.25;
  const frame: [number, number, number, number] = [b[0] - mx, b[1] - my, b[2] + mx, b[3] + my];
  const proj = projector(frame, w, h, 8);
  const others = districts.features
    .filter((f) => f !== own)
    .map((f) => `<path class="dm-district" d="${pathFor(f.geometry, proj)}"/>`)
    .join('');
  const names = districts.features
    .filter((f) => f !== own)
    .map((f) => {
      const [x, y] = proj(labelPoint(f.geometry));
      return x > 20 && x < w - 20 && y > 14 && y < h - 8
        ? `<text class="dm-name" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(String(f.properties?.name ?? ''))}</text>`
        : '';
    })
    .join('');
  const water = rivers.features
    .map((f) => `<path class="dm-river" d="${pathFor(f.geometry, proj)}"/>`)
    .join('');
  const lakes = (p.lakes.data ?? [])
    .map((l) => {
      const [x, y] = proj([l.point[1], l.point[0]]);
      return `<circle class="dm-lake" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"><title>${esc(l.name)}</title></circle>`;
    })
    .join('');
  const [lx, ly] = proj(labelPoint(own.geometry));
  return `<svg class="dmap" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="dm-t">
    <title id="dm-t">Mapa del distrito de Independencia con los distritos vecinos de Huaraz, ríos y lagunas glaciares</title>
    <defs><clipPath id="dm-clip"><rect width="${w}" height="${h}" rx="8"/></clipPath></defs>
    <g clip-path="url(#dm-clip)">${others}${water}
      <path class="dm-own" d="${pathFor(own.geometry, proj)}"/>${lakes}${names}
      <text class="dm-own-name" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">Independencia</text>
    </g></svg>`;
}

function statusTile(p: Panel, now: number): string {
  const { level, reasons } = p.summary;
  const list = reasons.length
    ? `<ul class="reasons">${reasons
        .slice(0, 3)
        .map((r) => `<li>${esc(r)}</li>`)
        .join('')}</ul>`
    : '<p class="reasons-none">No hay señales de alerta en las fuentes consultadas.</p>';
  return `<article class="tile tile-status">
    ${tileHead('pulse', 'Nivel general del distrito')}
    <p class="status-level lv-${level}"><i class="dot" aria-hidden="true"></i>${esc(levelLabel(level))}</p>
    <p class="status-headline">${esc(levelHeadline(level))}</p>
    ${list}
    <p class="status-meta">Actualizado ${ago(p.generatedAt, now)}. Se revisa cada 10 minutos.</p>
    <details class="method"><summary>Cómo se calcula</summary>
      <p>Es el nivel más alto entre los avisos vigentes de SENAMHI, el estado oficial de El Niño (ENFEN), el caudal estimado de los ríos y las emergencias recientes en Huaraz e Independencia. Los umbrales son una propuesta de este sistema, no valores oficiales.</p>
    </details>
  </article>`;
}

function mapTile(p: Panel): string {
  return `<article class="tile tile-map">
    ${tileHead('mapa', 'Mapa del distrito', { href: '#mapa', label: 'Abrir el mapa' })}
    <figure class="status-map">
      ${districtMap(p)}
      <figcaption>Límites oficiales del IGN, ríos y lagunas de la ANA.</figcaption>
    </figure>
  </article>`;
}

/** Seven pill bars for the next days of rain over a hatched track (today dark). */
function rainBars(days: { date: string; precipMm: number }[], today: string): string {
  const max = Math.max(10, ...days.map((d) => d.precipMm));
  return `<ol class="mini-bars" aria-label="Lluvia prevista por día">${days
    .map(
      (d) =>
        `<li title="${esc(fmtDay(d.date))}: ${fmtNum(d.precipMm, 1)} mm"><span class="mb-track"><i${d.date === today ? ' class="is-today"' : ''} style="height:${Math.max(8, (d.precipMm / max) * 100)}%"></i></span><span class="mb-day">${d.date === today ? 'Hoy' : esc(fmtDay(d.date).split(' ')[0])}</span></li>`,
    )
    .join('')}</ol>`;
}

const TREND_ICON: Record<Trend, IconName | null> = {
  sube: 'trendUp',
  baja: 'trendDown',
  estable: 'trendFlat',
  'sin-datos': null,
};

function tiles(p: Panel, now: number): string {
  const out: string[] = [];
  const today = limaToday(now);

  const fc = p.forecast.data;
  const rain = fc ? rainNextDays(fc.daily, today, 3) : null;
  out.push(
    tile({
      cls: 'tile-rain',
      icon: 'lluvias',
      label: 'Lluvia en 72 horas',
      value: rain === null ? '—' : fmtNum(rain, 0),
      unit: rain === null ? undefined : 'mm',
      context:
        rain === null
          ? NO_DATA
          : rain >= 30
            ? 'Lluvias intensas previstas'
            : rain >= 10
              ? 'Lluvias moderadas previstas'
              : 'Poca lluvia prevista',
      level: rain !== null && rain >= 30 ? 'atencion' : undefined,
      href: '#lluvias',
      go: 'Ver lluvias y clima',
      extra: fc ? rainBars(fc.daily.filter((d) => d.date >= today).slice(0, 7), today) : '',
    }),
  );

  const active = p.warnings.data?.filter((w) => Date.parse(w.end) > now) ?? null;
  const worst = active?.length ? maxLevel(active.map((w) => w.level)) : null;
  out.push(
    tile({
      cls: 'tile-warn',
      icon: 'alert',
      label: 'Avisos SENAMHI',
      value: active === null ? '—' : String(active.length),
      context:
        active === null
          ? NO_DATA
          : worst
            ? 'el nivel más alto entre los vigentes'
            : 'Ningún aviso vigente cubre el distrito',
      level: worst ?? undefined,
      href: '#lluvias',
      go: 'Ver avisos de SENAMHI',
    }),
  );

  const rivers = p.rivers.data;
  const worstRiver = rivers?.length
    ? (rivers.find((r) => r.level === maxLevel(rivers.map((x) => x.level))) ?? rivers[0]!)
    : null;
  const trend = worstRiver ? riverTrend(worstRiver) : null;
  const ti = trend ? TREND_ICON[trend] : null;
  out.push(
    tile({
      cls: 'tile-river',
      icon: 'rios',
      label: 'Ríos',
      value: trend ? TREND_LABEL[trend] : '—',
      context: worstRiver ? `${worstRiver.name.replace(/\s*\(.*\)$/, '')}, caudal estimado` : NO_DATA,
      level: worstRiver?.level,
      href: '#rios',
      go: 'Ver ríos y lagunas',
      extra: ti ? `<span class="tile-glyph">${icon(ti)}</span>` : '',
    }),
  );

  const nino = p.elNino.data;
  out.push(
    tile({
      cls: 'tile-nino',
      icon: 'nino',
      label: 'El Niño (ENFEN)',
      value: nino?.enfenStatus ? levelLabel(nino.enfenLevel) : '—',
      context: nino?.enfenStatus ?? NO_DATA,
      href: '#nino',
      go: 'Ver El Niño',
    }),
  );

  const em = p.emergencies.data;
  const em7 = em ? countSince(em, now, 7) : null;
  const local = em ? countSince(em.filter(isLocal), now, 7) : 0;
  out.push(
    tile({
      cls: 'tile-em',
      icon: 'emergencias',
      label: 'Emergencias en 7 días',
      value: em7 === null ? '—' : String(em7),
      context:
        em7 === null
          ? NO_DATA
          : local
            ? `${local} en Huaraz o Independencia`
            : 'Ninguna en Huaraz o Independencia',
      level: local ? 'atencion' : undefined,
      href: '#emergencias',
      go: 'Ver emergencias',
    }),
  );

  const qs = p.earthquakes.data;
  const near = qs?.filter((q) => q.distanceKm <= 100 && now - Date.parse(q.date) <= 7 * 86_400_000) ?? null;
  const maxMag = near?.length ? Math.max(...near.map((q) => q.magnitude)) : null;
  out.push(
    tile({
      cls: 'tile-quake',
      icon: 'quake',
      label: 'Sismos cercanos',
      value: near === null ? '—' : String(near.length),
      context:
        near === null
          ? NO_DATA
          : maxMag !== null
            ? `A menos de 100 km, en 7 días. El mayor: magnitud ${fmtNum(maxMag, 1)}`
            : 'Ninguno a menos de 100 km en 7 días',
      level: maxMag === null ? undefined : maxMag >= 5.5 ? 'alerta' : maxMag >= 4.5 ? 'atencion' : undefined,
      href: '#emergencias',
      go: 'Ver sismos',
    }),
  );

  const news = p.news.data ? [...p.news.data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3) : null;
  out.push(`<article class="tile tile-news">
    ${tileHead('noticias', 'Últimas noticias', { href: '#noticias', label: 'Ver noticias' })}
    ${
      news?.length
        ? `<ol class="tile-list">${news
            .map(
              (n) =>
                `<li>${link(n.url, esc(n.title))}<span class="muted">${esc(n.source)}, ${ago(n.date, now)}</span></li>`,
            )
            .join('')}</ol>`
        : `<p class="tile-context">${news ? 'Sin noticias recientes' : NO_DATA}</p>`
    }
  </article>`);

  const m = p.management.data;
  out.push(
    tile({
      cls: 'tile-inv',
      icon: 'gestion',
      label: 'Inversión pública',
      value: m ? fmtNum(m.totals.count) : '—',
      context: m
        ? `inversiones en el distrito. ${fmtSolesShort(m.totals.accruedSoles)} gastados de ${fmtSolesShort(m.totals.costSoles)}. ${m.totals.stalled ? `${fmtNum(m.totals.stalled)} paralizadas.` : 'Ninguna paralizada.'}`
        : NO_DATA,
      href: '#gestion',
      go: 'Ver gestión municipal',
      extra:
        m && m.totals.costSoles
          ? `${tickBar(m.totals.accruedSoles / m.totals.costSoles, `${fmtNum((m.totals.accruedSoles / m.totals.costSoles) * 100)}% del costo total ya gastado`)}<p class="ticks-label"><span>Gastado ${fmtNum((m.totals.accruedSoles / m.totals.costSoles) * 100)}%</span><span>Costo total</span></p>`
          : '',
    }),
  );
  return out.join('');
}

export function renderSummary(p: Panel | null, ctx: Ctx): string {
  if (!p) {
    if (ctx.state === 'offline') return offlineBox();
    const sk = (cls: string) =>
      `<div class="tile ${cls}" aria-hidden="true"><div class="sk sk-line"></div><div class="sk sk-title"></div><div class="sk sk-line" style="width:60%"></div></div>`;
    return `<div class="bento" aria-busy="true">${['tile-status', 'tile-map', 'tile-rain', 'tile-warn', 'tile-river', 'tile-nino', 'tile-em', 'tile-quake', 'tile-news', 'tile-inv'].map(sk).join('')}</div>`;
  }
  return `<div class="bento">${statusTile(p, ctx.now)}${mapTile(p)}${tiles(p, ctx.now)}</div>`;
}
