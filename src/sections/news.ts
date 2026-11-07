import type { FeedItem, Panel } from '../../shared/types.ts';
import { esc, fmtDate } from '../lib/format.ts';
import { isLocal, tagCounts } from '../lib/panel.ts';
import { ago, link, shell, type Ctx } from '../ui/shell.ts';

// Noticias (with tag filter chips) and Normas legales (El Peruano).

let selectedTag: string | null = null;

function feedItem(n: FeedItem, now: number, showSummary: boolean): string {
  return `<li class="feed-item${isLocal(n) ? ' is-local' : ''}">
    <p class="feed-title">${link(n.url, esc(n.title))}</p>
    ${showSummary && n.summary ? `<p class="feed-sum">${esc(n.summary)}</p>` : ''}
    <p class="feed-meta">${esc(n.source)} · ${ago(n.date, now)} · ${esc(fmtDate(n.date))}${n.tags.length ? ` · ${esc(n.tags.join(', '))}` : ''}</p>
  </li>`;
}

export function renderNews(p: Panel | null, ctx: Ctx): string {
  return shell(p?.news, ctx, {
    empty: 'Sin noticias recientes',
    body: (list) => {
      const tags = tagCounts(list).slice(0, 10);
      if (selectedTag && !tags.some(([t]) => t === selectedTag)) selectedTag = null;
      const shown = [...list]
        .filter((n) => !selectedTag || n.tags.includes(selectedTag))
        .sort((a, b) => b.date.localeCompare(a.date));
      const chip = (tag: string | null, label: string, count: number) =>
        `<button type="button" class="chip" data-tag="${esc(tag ?? '')}" aria-pressed="${selectedTag === tag}">${esc(label)} <span>${count}</span></button>`;
      return `<div class="chips" role="group" aria-label="Filtrar noticias por tema">${chip(null, 'Todas', list.length)}${tags.map(([t, c]) => chip(t, t, c)).join('')}</div>
        <ul class="feed feed-news">${shown.map((n) => feedItem(n, ctx.now, true)).join('')}</ul>`;
    },
  });
}

/** Chip clicks change the filter and redraw only this section. */
export function bindNews(el: HTMLElement, redraw: () => void): void {
  el.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tag]');
    if (!chip) return;
    selectedTag = chip.dataset.tag || null;
    redraw();
    el.querySelector<HTMLButtonElement>(`button[data-tag="${CSS.escape(chip.dataset.tag ?? '')}"]`)?.focus();
  });
}

export function renderLegal(p: Panel | null, ctx: Ctx): string {
  return shell(p?.legal, ctx, {
    empty: 'Sin normas recientes que mencionen al distrito',
    body: (list) =>
      `<ul class="feed">${[...list]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((n) => feedItem(n, ctx.now, true))
        .join('')}</ul>`,
  });
}
