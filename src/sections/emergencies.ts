import type { Earthquake, FeedItem, Panel } from '../../shared/types.ts';
import { esc, fmtDateTime, fmtNum } from '../lib/format.ts';
import { isLocal } from '../lib/panel.ts';
import { ago, link, shell, type Ctx } from '../ui/shell.ts';

// Emergencias (INDECI COEN) and sismos (IGP).

function emergencyItem(e: FeedItem, now: number): string {
  const local = isLocal(e);
  return `<li class="feed-item${local ? ' is-local' : ''}">
    ${local ? '<span class="badge badge-local">En Huaraz o Independencia</span>' : ''}
    <p class="feed-title">${link(e.url, esc(e.title))}</p>
    <p class="feed-meta">${esc(e.source)} · ${ago(e.date, now)} · ${esc(fmtDateTime(e.date))}</p>
  </li>`;
}

export function renderEmergencies(p: Panel | null, ctx: Ctx): string {
  return shell(p?.emergencies, ctx, {
    title: 'Emergencias reportadas (INDECI)',
    empty: 'Sin emergencias reportadas',
    emptyHint: 'INDECI no registra emergencias recientes en la zona.',
    body: (list) => {
      const sorted = [...list].sort((a, b) => Number(isLocal(b)) - Number(isLocal(a)) || b.date.localeCompare(a.date));
      return `<ul class="feed">${sorted.slice(0, 8).map((e) => emergencyItem(e, ctx.now)).join('')}</ul>`;
    },
  });
}

const magClass = (m: number) => (m >= 5.5 ? 'mag-high' : m >= 4.5 ? 'mag-mid' : 'mag-low');
const magWord = (m: number) => (m >= 5.5 ? 'fuerte' : m >= 4.5 ? 'moderado' : 'leve');

function quakeItem(q: Earthquake, now: number): string {
  return `<li class="quake">
    <span class="mag ${magClass(q.magnitude)}"><b>${fmtNum(q.magnitude, 1)}</b><small>${magWord(q.magnitude)}</small></span>
    <div>
      <p class="feed-title">${link(q.url, esc(q.reference))}</p>
      <p class="feed-meta">A <strong>${fmtNum(q.distanceKm)} km</strong> del distrito${q.depthKm !== null ? ` · ${fmtNum(q.depthKm)} km de profundidad` : ''} · ${ago(q.date, now)}</p>
    </div>
  </li>`;
}

export function renderEarthquakes(p: Panel | null, ctx: Ctx): string {
  return shell(p?.earthquakes, ctx, {
    title: 'Sismos recientes cerca (IGP)',
    empty: 'Sin sismos recientes cerca del distrito',
    body: (list) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      return `<ul class="quakes">${sorted.slice(0, 8).map((q) => quakeItem(q, ctx.now)).join('')}</ul>
      <details class="method"><summary>¿Cómo leer la magnitud?</summary>
        <p>Menos de 4.5: leve, casi siempre no se siente o se siente poco. Entre 4.5 y 5.5: moderado, se siente con claridad. Más de 5.5: fuerte, puede causar daños según la distancia y la profundidad. La distancia se mide desde el centro del distrito.</p>
      </details>`;
    },
  });
}
