import type { Level, Section, SourceMeta } from '../../shared/types.ts';
import { esc, safeUrl, timeAgo } from '../lib/format.ts';
import { levelIcon, levelLabel } from '../lib/levels.ts';
import { sectionStatus } from '../lib/panel.ts';

// Shared markup for every section: source chip, level badge, and the loading / error /
// stale / empty states. Everything returns HTML strings; callers escape their own data.

/** How the whole panel is doing: still loading the first time, or the server is unreachable. */
export type PanelState = 'loading' | 'offline' | 'ok';

export interface Ctx {
  now: number;
  state: PanelState;
}

export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return '<span>nunca</span>';
  return `<time data-ago="${esc(iso)}" datetime="${esc(iso)}">${esc(timeAgo(iso, now))}</time>`;
}

/** External link that only renders for http(s) URLs; plain text otherwise. */
export function link(url: string | null | undefined, text: string, cls = ''): string {
  const href = safeUrl(url);
  const c = cls ? ` class="${cls}"` : '';
  return href ? `<a${c} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : `<span${c}>${text}</span>`;
}

export function levelBadge(level: Level, label = levelLabel(level)): string {
  return `<span class="badge lv lv-${level}">${levelIcon(level)}<span>${esc(label)}</span></span>`;
}

export function sourceChip(meta: SourceMeta, now: number): string {
  const state = meta.ok ? 'ok' : 'fail';
  const stateText = meta.ok ? 'Fuente al día' : 'La última consulta falló';
  return `<div class="src">
    <span class="src-dot src-${state}" role="img" aria-label="${stateText}" title="${stateText}"></span>
    <span>Fuente: ${link(meta.url, esc(meta.name))}</span>
    <span class="src-sep" aria-hidden="true">·</span>
    <span>${ago(meta.updatedAt, now)}</span>
  </div>`;
}

export function skeleton(lines = 3, tall = false): string {
  const rows = Array.from({ length: lines }, (_, i) => `<div class="sk sk-line" style="width:${92 - i * 14}%"></div>`).join('');
  return `<div class="card is-loading" aria-busy="true" aria-label="Cargando">
    <div class="sk sk-title"></div>${tall ? '<div class="sk sk-block"></div>' : ''}${rows}
  </div>`;
}

export function offlineBox(): string {
  return `<div class="card state state-error" role="status">
    <p class="state-title">No pudimos conectar con el sistema</p>
    <p>Revise su conexión a internet. Volveremos a intentarlo automáticamente o puede pulsar <strong>Actualizar</strong>.</p>
  </div>`;
}

interface ShellOpts<T> {
  /** Card heading (omit when the section title is enough) */
  title?: string;
  /** Message when the list is empty, e.g. "Sin avisos vigentes" */
  empty: string;
  emptyHint?: string;
  body: (data: T) => string;
  /** Wrap the body in a card (default) or let the body lay out its own cards */
  card?: boolean;
  skeletonLines?: number;
  tall?: boolean;
}

/** Render one section in whichever state it is. */
export function shell<T>(section: Section<T> | undefined, ctx: Ctx, o: ShellOpts<T>): string {
  const status = sectionStatus(section);
  if (status === 'loading' || !section) return ctx.state === 'offline' ? offlineBox() : skeleton(o.skeletonLines ?? 3, o.tall);
  const { meta } = section;
  const head = (extra = '') =>
    o.title || extra ? `<header class="card-h">${o.title ? `<h3>${esc(o.title)}</h3>` : ''}${extra}</header>` : '';
  const foot = sourceChip(meta, ctx.now);
  if (status === 'error') {
    return `<div class="card state state-error">${head()}
      <p class="state-title">Estos datos no están disponibles por ahora</p>
      <p>No pudimos obtener información de ${esc(meta.name)}. El sistema volverá a intentarlo solo.</p>
      ${meta.error ? `<details class="tech"><summary>Detalle técnico</summary><p>${esc(meta.error)}</p></details>` : ''}
      <footer class="card-f">${foot}</footer></div>`;
  }
  if (status === 'empty') {
    return `<div class="card state state-empty">${head()}
      <p class="state-title">${esc(o.empty)}</p>${o.emptyHint ? `<p>${esc(o.emptyHint)}</p>` : ''}
      <footer class="card-f">${foot}</footer></div>`;
  }
  const stale =
    status === 'stale'
      ? `<span class="badge badge-stale" title="${esc(meta.error ?? 'La última consulta falló')}">Desactualizado</span>`
      : '';
  const body = o.body(section.data as T);
  if (o.card === false) {
    return `${stale ? `<div class="stale-row">${stale}<span>Se muestran los últimos datos disponibles.</span></div>` : ''}${body}<div class="sec-foot">${foot}</div>`;
  }
  return `<div class="card">${head(stale)}${body}<footer class="card-f">${foot}</footer></div>`;
}
