import type { Investment, Management, Panel } from '../../shared/types.ts';
import { esc, fmtDate, fmtNum, fmtPct, fmtSoles, fmtSolesShort, tidyCaps } from '../lib/format.ts';
import { filterInvestments, sortInvestments, type InvestmentKey } from '../lib/panel.ts';
import { icon } from '../ui/icons.ts';
import { link, shell, type Ctx } from '../ui/shell.ts';

// Gestión municipal: investment totals, a searchable/sortable table, and SEACE procurements.

const PAGE = 25;
const view = { query: '', key: 'costSoles' as InvestmentKey, dir: 'desc' as 'asc' | 'desc', limit: PAGE };
let current: Management | null = null;

const COLS: { key: InvestmentKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Inversión' },
  { key: 'status', label: 'Estado' },
  { key: 'costSoles', label: 'Costo', num: true },
  { key: 'accruedSoles', label: 'Gastado', num: true },
  { key: 'progressPct', label: 'Avance físico', num: true },
];

function statusPill(s: string): string {
  const cls = /paraliz|sin avance|fallida/i.test(s)
    ? 'st-bad'
    : /ejecuci/i.test(s)
      ? 'st-run'
      : /culmin/i.test(s)
        ? 'st-done'
        : 'st-other';
  return `<span class="st ${cls}"><i class="dot" aria-hidden="true"></i>${esc(s)}</span>`;
}

function row(i: Investment): string {
  const pct = i.progressPct;
  return `<tr>
    <td class="inv-name">${link(i.url, esc(tidyCaps(i.name)))}<span class="muted">CUI ${esc(i.cui)} · ${esc(tidyCaps(i.entity))}</span></td>
    <td>${statusPill(i.status)}</td>
    <td class="num">${fmtSoles(i.costSoles)}</td>
    <td class="num">${fmtSoles(i.accruedSoles)}</td>
    <td class="num">${pct !== null ? `<span class="prog"><span class="prog-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>${fmtPct(pct, 0)}</span>` : '—'}</td>
  </tr>`;
}

function tableHTML(m: Management): string {
  const filtered = sortInvestments(filterInvestments(m.investments, view.query), view.key, view.dir);
  const shown = filtered.slice(0, view.limit);
  const head = COLS.map((c) => {
    const active = c.key === view.key;
    const sort = active ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th scope="col" aria-sort="${sort}" class="${c.num ? 'num' : ''}"><button type="button" data-sort="${c.key}">${c.label}${icon(active ? (view.dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sortNone', 'ic sort-ic')}</button></th>`;
  }).join('');
  return `<p class="table-count" aria-live="polite">${
    filtered.length
      ? `Mostrando ${fmtNum(shown.length)} de ${fmtNum(filtered.length)} inversiones`
      : 'Ninguna inversión coincide con la búsqueda.'
  }</p>
  <div class="table-scroll" tabindex="0" role="region" aria-label="Tabla de inversiones">
    <table class="table"><thead><tr>${head}</tr></thead><tbody>${shown.map(row).join('')}</tbody></table>
  </div>
  ${filtered.length > shown.length ? `<button type="button" class="btn btn-ghost" data-more>Ver ${fmtNum(Math.min(PAGE, filtered.length - shown.length))} más</button>` : ''}`;
}

export function renderManagement(p: Panel | null, ctx: Ctx): string {
  return shell(p?.management, ctx, {
    card: false,
    empty: 'Sin inversiones registradas',
    tall: true,
    body: (m) => {
      current = m;
      const t = m.totals;
      const spentPct = t.costSoles ? (t.accruedSoles / t.costSoles) * 100 : null;
      const procs = m.procurements.length
        ? `<ul class="feed">${m.procurements
            .map(
              (
                pr,
              ) => `<li class="feed-item"><p class="feed-title">${link(pr.url, esc(tidyCaps(pr.object)))}</p>
              <p class="feed-meta">${esc(tidyCaps(pr.entity))} · ${esc(pr.method)} · <strong>${fmtSolesShort(pr.amountSoles)}</strong>${pr.date ? ` · ${esc(fmtDate(pr.date))}` : ''}</p></li>`,
            )
            .join('')}</ul>`
        : '<p class="muted">No hay procesos de contratación recientes.</p>';
      return `<div class="kpis kpis-4">
        <div class="kpi"><span class="kpi-label">Inversiones registradas</span><span class="kpi-value">${fmtNum(t.count)}</span><span class="kpi-sub">De todas las entidades en el distrito</span></div>
        <div class="kpi"><span class="kpi-label">Costo total</span><span class="kpi-value">${fmtSolesShort(t.costSoles)}</span><span class="kpi-sub">Monto actualizado de las inversiones</span></div>
        <div class="kpi"><span class="kpi-label">Ya gastado (devengado)</span><span class="kpi-value">${fmtSolesShort(t.accruedSoles)}</span><span class="kpi-sub">${spentPct !== null ? `${fmtPct(spentPct)} del costo total` : '—'}</span></div>
        <div class="kpi"><span class="kpi-label">Obras paralizadas</span><span class="kpi-value">${fmtNum(t.stalled)}</span><span class="kpi-sub">${t.stalled ? '<span class="lv lv-alerta"><i class="dot" aria-hidden="true"></i>Requieren seguimiento</span>' : 'Ninguna paralizada'}</span></div>
      </div>
      <div class="card">
        <header class="card-h"><h3>Inversiones en el distrito</h3></header>
        <label class="search"><span class="sr-only">Buscar inversión</span>
          ${icon('search')}
          <input id="inv-search" type="search" placeholder="Buscar por nombre, CUI, estado o entidad" value="${esc(view.query)}" autocomplete="off" />
        </label>
        <div id="inv-table">${tableHTML(m)}</div>
        ${m.asOf ? `<p class="muted">Datos al ${esc(fmtDate(m.asOf))}. Toque el nombre para ver la ficha oficial.</p>` : ''}
      </div>
      <div class="card">
        <header class="card-h"><h3>Procesos de contratación (SEACE)</h3></header>
        ${procs}
      </div>
      <details class="method"><summary>¿De dónde salen estos datos?</summary>
        <p>Las inversiones vienen del Banco de Inversiones del MEF e INFOBRAS (Contraloría); los procesos, del portal de contrataciones abiertas del OECE (SEACE). "Gastado" es el monto devengado acumulado. Se incluyen inversiones de todas las entidades (municipio, Gobierno Regional, ministerios, universidad) ubicadas en el distrito.</p>
      </details>`;
    },
  });
}

export function bindManagement(el: HTMLElement): void {
  const redrawTable = () => {
    const box = el.querySelector('#inv-table');
    if (box && current) box.innerHTML = tableHTML(current);
  };
  el.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.id !== 'inv-search') return;
    view.query = input.value;
    view.limit = PAGE;
    redrawTable();
  });
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const sortBtn = target.closest<HTMLButtonElement>('button[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort as InvestmentKey;
      view.dir =
        view.key === key
          ? view.dir === 'asc'
            ? 'desc'
            : 'asc'
          : key === 'name' || key === 'status'
            ? 'asc'
            : 'desc';
      view.key = key;
      redrawTable();
      el.querySelector<HTMLButtonElement>(`button[data-sort="${key}"]`)?.focus();
      return;
    }
    if (target.closest('button[data-more]')) {
      view.limit += PAGE;
      redrawTable();
    }
  });
}
