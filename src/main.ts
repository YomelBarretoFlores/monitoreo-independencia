import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/sections.css';
import type { Panel } from '../shared/types.ts';
import { timeAgo } from './lib/format.ts';
import { rebaseDates } from './lib/panel.ts';
import { renderDistrict, renderElections, renderRisk } from './sections/district.ts';
import { renderEarthquakes, renderEmergencies } from './sections/emergencies.ts';
import { renderElNino } from './sections/elnino.ts';
import { renderLakes } from './sections/lakes.ts';
import { bindManagement, renderManagement } from './sections/management.ts';
import { renderMapLegend, updateMap } from './sections/map.ts';
import { bindNews, renderLegal, renderNews } from './sections/news.ts';
import { renderRivers } from './sections/rivers.ts';
import { renderSources } from './sections/sources.ts';
import { renderSummary } from './sections/summary.ts';
import { renderForecast, renderWarnings } from './sections/weather.ts';
import { ago, type Ctx, type PanelState } from './ui/shell.ts';

// Entry point: loads the panel (API or ?demo sample), renders every section into its
// [data-body] slot, refreshes every 10 minutes and keeps the "hace X" labels ticking.

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

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const body = (key: string) => $<HTMLElement>(`[data-body="${key}"]`);
const ctx = (): Ctx => ({ now: Date.now(), state });

function renderOne(key: string): void {
  const el = body(key);
  if (!el) return;
  el.innerHTML = RENDERERS[key](panel, ctx(), el.clientWidth || 640);
}

function renderAll(): void {
  // Keep scroll position and focus across a full redraw (auto-refresh must not move the page).
  const y = window.scrollY;
  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active?.id;
  const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  for (const key of Object.keys(RENDERERS)) renderOne(key);
  try {
    updateMap(panel, Date.now());
  } catch (err) {
    console.error('map', err);
  }
  renderTopbar();
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

function renderTopbar(): void {
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

async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  const btn = $<HTMLButtonElement>('#refresh');
  btn?.setAttribute('aria-busy', 'true');
  btn?.classList.add('is-busy');
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
      showNetBanner('No pudimos conectar con el sistema de monitoreo. Volveremos a intentarlo automáticamente.');
    }
  } finally {
    loading = false;
    btn?.removeAttribute('aria-busy');
    btn?.classList.remove('is-busy');
    renderAll();
  }
}

/** Only the "hace X" texts change every 30 s; no full redraw. */
function tick(): void {
  const now = Date.now();
  document.querySelectorAll<HTMLTimeElement>('time[data-ago]').forEach((t) => {
    t.textContent = timeAgo(t.dataset.ago ?? null, now);
  });
}

function start(): void {
  if (DEMO) {
    const banner = $('#demo-banner');
    if (banner) banner.hidden = false;
    document.title = 'Monitoreo Independencia · Demostración';
  }
  const news = body('news');
  if (news) bindNews(news, () => renderOne('news'));
  const mgmt = body('management');
  if (mgmt) bindManagement(mgmt);
  $('#refresh')?.addEventListener('click', () => void load());

  // Charts are drawn at the container's pixel width: redraw when the width really changes.
  let lastWidth = window.innerWidth;
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderAll, 200);
  });

  renderAll(); // skeletons
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
