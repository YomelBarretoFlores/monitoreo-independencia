import '@fontsource-variable/ibm-plex-sans';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/views.css';
import type { Panel } from '../shared/types.ts';
import { timeAgo } from './lib/format.ts';
import { rebaseDates } from './lib/panel.ts';
import { matchRoute, parseRoute, routeOf, ROUTES, type RouteId } from './lib/router.ts';
import { renderDistrict, renderElections, renderRisk } from './sections/district.ts';
import { renderEarthquakes, renderEmergencies } from './sections/emergencies.ts';
import { renderElNino } from './sections/elnino.ts';
import { renderLakes } from './sections/lakes.ts';
import { bindManagement, renderManagement } from './sections/management.ts';
import { mountMap, renderMapLegend, unmountMap, updateMap } from './sections/map.ts';
import { bindNews, renderLegal, renderNews } from './sections/news.ts';
import { renderRivers } from './sections/rivers.ts';
import { renderSources } from './sections/sources.ts';
import { renderSummary } from './sections/summary.ts';
import { renderForecast, renderWarnings } from './sections/weather.ts';
import { icon, type IconName } from './ui/icons.ts';
import { ago, type Ctx, type PanelState } from './ui/shell.ts';
import { LAYOUTS } from './views.ts';

// Entry point: sidebar + hash router. Only the active view is rendered; the panel (API or
// ?demo sample) refreshes every 10 minutes and the "hace X" labels tick every 30 s.

const REFRESH_MS = 10 * 60_000;
const DEMO = new URLSearchParams(location.search).has('demo');
/** In demo mode these sections keep their original dates (static datasets). */
const DEMO_FIXED = ['management', 'elections', 'district'];

type Renderer = (p: Panel | null, ctx: Ctx, width: number) => string;
const RENDERERS: Record<string, Renderer> = {
  summary: renderSummary,
  warnings: renderWarnings,
  forecast: renderForecast,
  rivers: renderRivers,
  lakes: renderLakes,
  elNino: renderElNino,
  emergencies: renderEmergencies,
  earthquakes: renderEarthquakes,
  map: renderMapLegend,
  news: renderNews,
  legal: renderLegal,
  management: renderManagement,
  risk: renderRisk,
  district: renderDistrict,
  elections: renderElections,
  sources: renderSources,
};

let panel: Panel | null = null;
let state: PanelState = 'loading';
let loading = false;
let route: RouteId = parseRoute(location.hash);

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const ctx = (): Ctx => ({ now: Date.now(), state });

function renderSlot(el: HTMLElement): void {
  const key = el.dataset.body ?? '';
  const fn = RENDERERS[key];
  if (fn) el.innerHTML = fn(panel, ctx(), el.clientWidth || 640);
}

/** Redraw the active view's slots in place (keeps scroll, focus and text selection). */
function renderData(): void {
  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active?.id;
  const selection =
    active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const y = window.scrollY;
  document.querySelectorAll<HTMLElement>('#view [data-body]').forEach(renderSlot);
  if (route === 'mapa') {
    try {
      updateMap(panel, Date.now());
    } catch (err) {
      console.error('map', err);
    }
  }
  renderUpdated();
  if (focusId) {
    const again = document.getElementById(focusId) as HTMLInputElement | null;
    again?.focus({ preventScroll: true });
    if (again && selection && typeof again.setSelectionRange === 'function') {
      try {
        again.setSelectionRange(selection[0], selection[1]);
      } catch {
        /* not a text input */
      }
    }
  }
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y });
}

/** Build the active view's skeleton, bind its interactions, then fill it. */
function renderView(focus: boolean): void {
  const view = $('#view');
  if (!view) return;
  unmountMap();
  const r = routeOf(route);
  view.innerHTML = `<header class="view-h"><h1>${r.title}</h1><p>${r.intro}</p></header><div class="grid">${LAYOUTS[route]}</div>`;
  const news = view.querySelector<HTMLElement>('[data-body="news"]');
  if (news) bindNews(news, () => renderSlot(news));
  const mgmt = view.querySelector<HTMLElement>('[data-body="management"]');
  if (mgmt) bindManagement(mgmt);
  const mapEl = view.querySelector<HTMLElement>('#map');
  if (mapEl) mountMap(mapEl);
  renderNav();
  renderData();
  document.title = `${r.label} · Monitoreo Independencia${DEMO ? ' · Demostración' : ''}`;
  if (focus) {
    window.scrollTo({ top: 0 });
    view.focus({ preventScroll: true });
  }
}

const NAV_ICON: Record<RouteId, IconName> = {
  resumen: 'resumen',
  lluvias: 'lluvias',
  rios: 'rios',
  nino: 'nino',
  emergencias: 'emergencias',
  mapa: 'mapa',
  noticias: 'noticias',
  gestion: 'gestion',
  fuentes: 'fuentes',
};

function renderNav(): void {
  const nav = $('#nav');
  if (!nav) return;
  nav.innerHTML = `<ul>${ROUTES.map(
    (r) =>
      `<li><a href="#${r.id}" title="${r.label}"${r.id === route ? ' aria-current="page"' : ''}>${icon(NAV_ICON[r.id])}<span>${r.label}</span></a></li>`,
  ).join('')}</ul>`;
}

function renderUpdated(): void {
  const el = $('#updated');
  if (!el) return;
  if (panel) el.innerHTML = `Actualizado ${ago(panel.generatedAt, Date.now())}`;
  else el.textContent = state === 'offline' ? 'Sin conexión con el sistema' : 'Cargando datos…';
}

function showNetBanner(text: string | null): void {
  const el = $('#net-banner');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text ?? '';
}

function isPanel(x: unknown): x is Panel {
  return !!x && typeof x === 'object' && 'summary' in x && 'district' in x && 'generatedAt' in x;
}

function setBusy(busy: boolean): void {
  for (const id of ['#refresh', '#refresh-top']) {
    const btn = $<HTMLButtonElement>(id);
    if (!btn) continue;
    if (busy) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
    btn.classList.toggle('is-busy', busy);
  }
}

async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  setBusy(true);
  try {
    const url = DEMO ? `${import.meta.env.BASE_URL}panel.sample.json` : '/api/panel';
    const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (!isPanel(data)) throw new Error('Respuesta inesperada del servidor');
    // Whole hours keep the sample's round times (warnings from 07:00, etc.).
    const shift = Math.floor((Date.now() - Date.parse(data.generatedAt)) / 3_600_000) * 3_600_000;
    panel = DEMO ? rebaseDates(data, shift, DEMO_FIXED) : data;
    state = 'ok';
    showNetBanner(null);
  } catch (err) {
    console.error('panel', err);
    if (panel) {
      state = 'ok';
      showNetBanner(
        `No se pudo actualizar la información. Se muestran los datos de ${timeAgo(panel.generatedAt, Date.now())}; volveremos a intentarlo automáticamente.`,
      );
    } else {
      state = 'offline';
      showNetBanner(
        'No pudimos conectar con el sistema de monitoreo. Volveremos a intentarlo automáticamente.',
      );
    }
  } finally {
    loading = false;
    setBusy(false);
    renderData();
  }
}

/** Only the "hace X" texts change every 30 s; no full redraw. */
function tick(): void {
  const now = Date.now();
  document.querySelectorAll<HTMLTimeElement>('time[data-ago]').forEach((t) => {
    t.textContent = timeAgo(t.dataset.ago ?? null, now);
  });
}

/** Phone drawer: the sidebar slides over the content; Escape, the scrim or a link closes it. */
function setDrawer(open: boolean): void {
  document.body.classList.toggle('drawer-open', open);
  $('#menu-open')?.setAttribute('aria-expanded', String(open));
  const scrim = $('#scrim');
  if (scrim) scrim.hidden = !open;
  if (open) $<HTMLAnchorElement>('#nav a[aria-current]')?.focus();
}

function start(): void {
  if (DEMO) {
    const banner = $('#demo-banner');
    if (banner) banner.hidden = false;
  }
  const put = (sel: string, html: string) => {
    const el = $(sel);
    if (el) el.insertAdjacentHTML('afterbegin', html);
  };
  put('#menu-open', icon('menu'));
  put('#menu-close', icon('close'));
  put('#refresh', icon('refresh'));
  put('#refresh-top', icon('refresh'));

  $('#refresh')?.addEventListener('click', () => void load());
  $('#refresh-top')?.addEventListener('click', () => void load());
  $('#menu-open')?.addEventListener('click', () => setDrawer(true));
  $('#menu-close')?.addEventListener('click', () => setDrawer(false));
  $('#scrim')?.addEventListener('click', () => setDrawer(false));
  $('#nav')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setDrawer(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
      setDrawer(false);
      $<HTMLButtonElement>('#menu-open')?.focus();
    }
  });
  window.addEventListener('hashchange', () => {
    // Anchors that are not routes (the skip link #view) only move focus; they keep the view.
    const next = matchRoute(location.hash);
    if (!next) return history.replaceState(null, '', `#${route}`);
    if (next === route) return;
    route = next;
    renderView(true);
  });

  // Charts are drawn at the container's pixel width: redraw when the width really changes.
  let lastWidth = window.innerWidth;
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderData, 200);
  });

  renderView(false); // skeletons
  void load();
  setInterval(() => void load(), REFRESH_MS);
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !panel) return;
    if (Date.now() - Date.parse(panel.generatedAt) > REFRESH_MS && !DEMO) void load();
    else tick();
  });
}

start();
