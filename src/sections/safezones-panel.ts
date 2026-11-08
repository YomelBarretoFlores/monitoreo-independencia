import { esc, fmtNum } from '../lib/format.ts';
import {
  BASINS,
  basinLabel,
  DEFAULT_FILTERS,
  EVAC_STEPS,
  EXPOSED_KINDS,
  HAZARD_LEVELS,
  matchesQuery,
  matchPlace,
  matchZone,
  placeColor,
  placeLabel,
  SAFE_KINDS,
  type SafeZoneFilters,
} from '../lib/safezones.ts';
import type { SafeZoneData } from '../lib/safezones-data.ts';
import { icon } from '../ui/icons.ts';

// Filters for the alluvion layers (part of the lazy map chunk). The form is built once; each
// change only updates the counts and the search results, so focus and typing are never lost.

export interface PanelItem {
  kind: 'zone' | 'place';
  uid: number;
  label: string;
  detail: string;
  color: string;
  search: string;
}

export interface PanelHandlers {
  onChange(filters: SafeZoneFilters): void;
  onSelect(item: PanelItem): void;
  onFit(): void;
}

const MAX_RESULTS = 8;

/** One searchable entry per zone and pin; pins have no names, so they are numbered per kind. */
export function panelItems(data: SafeZoneData): PanelItem[] {
  const zones: PanelItem[] = data.zones.features.map((f) => {
    const p = f.properties;
    const detail = `Zona segura · ${basinLabel(p.basin)} · evacuación máx. ${fmtNum(p.maxEvacMin)} min`;
    return {
      kind: 'zone',
      uid: p.uid,
      label: p.id,
      detail,
      color: SAFE_KINDS[0]!.color,
      search: `${p.id} ${detail}`,
    };
  });
  const seen = new Map<string, number>();
  // north to south, so the numbering follows the map
  const pins = [...data.points.features].sort(
    (a, b) => b.geometry.coordinates[1]! - a.geometry.coordinates[1]!,
  );
  const places: PanelItem[] = pins.map((f) => {
    const p = f.properties;
    const key = `${p.basin}:${p.group}:${p.kind}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const label = `${placeLabel(p)} n.º ${n}`;
    const detail = `${basinLabel(p.basin)} · ${p.independencia ? 'Independencia' : 'Huaraz'}`;
    return { kind: 'place', uid: p.uid, label, detail, color: placeColor(p), search: `${label} ${detail}` };
  });
  return [...zones, ...places];
}

const check = (name: string, value: string, checked: boolean, body: string, cls = 'sz-check') =>
  `<label class="${cls}"><input type="checkbox" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${body}</span></label>`;
/** Pill toggle: same checkbox, drawn as a chip */
const pill = (name: string, value: string, checked: boolean, body: string) =>
  check(name, value, checked, body, 'sz-pill');

export function mountPanel(
  root: HTMLElement,
  data: SafeZoneData,
  initial: SafeZoneFilters,
  handlers: PanelHandlers,
): { setFilters(f: SafeZoneFilters): void } {
  let filters = initial;
  const items = panelItems(data);
  const kindCount = (id: string) =>
    id === 'zona'
      ? data.zones.features.length
      : data.points.features.filter((f) => f.properties.group === 'seguro' && f.properties.kind === id)
          .length;

  root.innerHTML = `<div class="card-h"><h3>Zonas seguras ante aluvión</h3>
      <button type="button" class="sz-fit" data-action="fit" title="Acercar el mapa a las zonas de aluvión">${icon('mapa')}<span>Ver zonas</span></button></div>
    <p class="sz-intro">Mapas oficiales de Quillcay (Huaraz e Independencia) y Casca. Toca una zona o un punto para ver sus datos.</p>
    <p class="sz-stats" role="status" aria-live="polite"></p>
    <form class="sz-form" novalidate>
      <label class="sz-search">${icon('search')}<input type="search" name="q" placeholder="Buscar: ZS-12, refugio, Casca…" aria-label="Buscar zona o lugar" autocomplete="off"></label>
      <ul class="sz-results" hidden></ul>
      <fieldset><legend>Mapa de origen</legend><div class="sz-pills">${BASINS.map((b) => pill('basin', b.id, filters.basins.includes(b.id), esc(b.label))).join('')}</div></fieldset>
      <fieldset><legend>Nivel de peligro</legend><div class="sz-pills">${HAZARD_LEVELS.map((l) =>
        pill(
          'level',
          l.id,
          filters.levels.includes(l.id),
          `<i style="background:${l.color}"></i>${esc(l.label)}`,
        ),
      ).join('')}</div></fieldset>
      <fieldset><legend>Lugares seguros</legend><div class="sz-pills">${SAFE_KINDS.map((k) =>
        pill(
          'kind',
          k.id,
          filters.kinds.includes(k.id),
          `<i class="dot" style="background:${k.color}"></i>${esc(k.label)}<small>${kindCount(k.id)}</small>`,
        ),
      ).join('')}</div></fieldset>
      <fieldset><legend>Más filtros</legend>
        <label class="sz-select"><span>Evacuación máxima <small>(solo zonas de Casca)</small></span><select name="evac">
          <option value="">Cualquiera</option>${EVAC_STEPS.map((m) => `<option value="${m}"${filters.maxEvacMin === m ? ' selected' : ''}>Hasta ${m} min</option>`).join('')}
        </select></label>
        ${check('only', 'independencia', filters.onlyIndependencia, 'Solo en el distrito de Independencia')}
        ${check('exposed', 'on', filters.exposed, `Elementos expuestos de Casca <span class="sz-exposed">${EXPOSED_KINDS.map((k) => `<small><i class="dot" style="background:${k.color}"></i>${esc(k.label.toLowerCase())}</small>`).join('')}</span>`)}
      </fieldset>
      <button type="button" class="btn btn-ghost sz-reset" data-action="reset">Restablecer filtros</button>
    </form>`;

  const form = root.querySelector<HTMLFormElement>('.sz-form')!;
  const stats = root.querySelector<HTMLElement>('.sz-stats')!;
  const results = root.querySelector<HTMLUListElement>('.sz-results')!;
  const query = form.querySelector<HTMLInputElement>('input[name="q"]')!;

  const visible = (it: PanelItem) =>
    it.kind === 'zone'
      ? matchZone(data.zones.features[it.uid]!.properties, filters)
      : matchPlace(data.points.features[it.uid]!.properties, filters);

  function renderStats(): void {
    const zones = data.zones.features.filter((f) => matchZone(f.properties, filters));
    const pins = data.points.features.filter(
      (f) => f.properties.group === 'seguro' && matchPlace(f.properties, filters),
    );
    const inDistrict =
      zones.filter((f) => f.properties.independencia).length +
      pins.filter((f) => f.properties.independencia).length;
    stats.textContent = `${fmtNum(zones.length)} zonas seguras y ${fmtNum(pins.length)} lugares de apoyo en el mapa · ${fmtNum(inDistrict)} en Independencia`;
  }

  function renderResults(): void {
    const q = query.value;
    if (!q.trim()) {
      results.hidden = true;
      results.innerHTML = '';
      return;
    }
    const found = items.filter((it) => visible(it) && matchesQuery(it.search, q));
    results.hidden = false;
    results.innerHTML = found.length
      ? found
          .slice(0, MAX_RESULTS)
          .map(
            (it) =>
              `<li><button type="button" data-i="${items.indexOf(it)}"><i class="dot" style="background:${it.color}"></i><span><b>${esc(it.label)}</b><small>${esc(it.detail)}</small></span></button></li>`,
          )
          .join('') +
        (found.length > MAX_RESULTS
          ? `<li class="sz-more">y ${found.length - MAX_RESULTS} más; escribe más para acotar</li>`
          : '')
      : `<li class="sz-more">Nada coincide con «${esc(q)}» con los filtros actuales.</li>`;
  }

  function readForm(): SafeZoneFilters {
    const all = (name: string) =>
      [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);
    const evac = form.querySelector<HTMLSelectElement>('select[name="evac"]')!.value;
    return {
      basins: all('basin') as SafeZoneFilters['basins'],
      levels: all('level') as SafeZoneFilters['levels'],
      kinds: all('kind') as SafeZoneFilters['kinds'],
      exposed: all('exposed').length > 0,
      maxEvacMin: evac ? Number(evac) : null,
      onlyIndependencia: all('only').length > 0,
    };
  }

  function writeForm(f: SafeZoneFilters): void {
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((i) => {
      const list: Record<string, readonly string[]> = { basin: f.basins, level: f.levels, kind: f.kinds };
      i.checked =
        i.name in list
          ? list[i.name]!.includes(i.value)
          : i.name === 'exposed'
            ? f.exposed
            : f.onlyIndependencia;
    });
    form.querySelector<HTMLSelectElement>('select[name="evac"]')!.value =
      f.maxEvacMin === null ? '' : String(f.maxEvacMin);
  }

  function apply(f: SafeZoneFilters): void {
    filters = f;
    renderStats();
    renderResults();
    handlers.onChange(f);
  }

  form.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).matches('input[type="search"]')) return;
    apply(readForm());
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  query.addEventListener('input', renderResults);
  results.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-i]');
    if (btn) handlers.onSelect(items[Number(btn.dataset.i)]!);
  });
  root.addEventListener('click', (e) => {
    const action = (e.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'fit') handlers.onFit();
    if (action === 'reset') {
      query.value = '';
      writeForm(DEFAULT_FILTERS);
      apply({ ...DEFAULT_FILTERS });
    }
  });

  renderStats();
  return {
    setFilters(f) {
      writeForm(f);
      filters = f;
      renderStats();
      renderResults();
    },
  };
}
