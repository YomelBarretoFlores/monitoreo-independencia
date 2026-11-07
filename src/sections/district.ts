import type { Panel } from '../../shared/types.ts';
import { esc, fmtNum, fmtPct, tidyCaps } from '../lib/format.ts';
import { riskTextLevel } from '../lib/levels.ts';
import { levelBadge, link, offlineBox, shell, skeleton, type Ctx } from '../ui/shell.ts';

// Riesgo (CENEPRED profile), district facts (INEI) and the 2026 election in the district.

function riskRow(label: string, hint: string, v: { hazard: string | null; risk: string | null }): string {
  const cell = (title: string, text: string | null) => {
    const lv = riskTextLevel(text);
    return `<div class="risk-cell"><span class="risk-k">${title}</span>${lv ? levelBadge(lv, text ?? '') : `<span class="muted">${esc(text ?? 'Sin dato')}</span>`}</div>`;
  };
  return `<div class="risk-row"><div><p class="risk-name">${esc(label)}</p><p class="muted">${esc(hint)}</p></div>
    ${cell('Peligro', v.hazard)}${cell('Riesgo', v.risk)}</div>`;
}

export function renderRisk(p: Panel | null, ctx: Ctx): string {
  return shell(p?.risk, ctx, {
    title: 'Riesgo ante lluvias intensas',
    empty: 'Sin perfil de riesgo',
    body: (r) => `${riskRow('Huaicos y deslizamientos', 'Movimientos en masa', r.massMovement)}
      ${riskRow('Inundaciones', 'Desborde de ríos y quebradas', r.flood)}
      <dl class="facts facts-2">
        <div><dt>Establecimientos de salud</dt><dd>${fmtNum(r.healthFacilities)}</dd></div>
        <div><dt>Locales escolares</dt><dd>${fmtNum(r.schools)}</dd></div>
      </dl>
      <p class="muted">${esc(r.scenario)}. "Peligro" es qué tan probable es el evento; "riesgo" combina el peligro con cuántas personas, viviendas y servicios podrían verse afectados.</p>`,
  });
}

export function renderDistrict(p: Panel | null, ctx: Ctx): string {
  if (!p) return ctx.state === 'offline' ? offlineBox() : skeleton(4);
  const d = p.district;
  return `<div class="card">
    <header class="card-h"><h3>El distrito en cifras</h3></header>
    <dl class="facts facts-2">
      <div><dt>Población (Censo 2017)</dt><dd>${fmtNum(d.population2017)}</dd></div>
      ${d.populationEstimate ? `<div><dt>Población estimada ${d.populationEstimate.year}</dt><dd>${fmtNum(d.populationEstimate.value)}</dd></div>` : ''}
      <div><dt>Viviendas (Censo 2017)</dt><dd>${fmtNum(d.households2017)}</dd></div>
      <div><dt>Pobreza monetaria</dt><dd>${fmtPct(d.povertyPct)}</dd></div>
    </dl>
    <p class="muted">${esc(d.name)}, provincia de ${esc(d.province)}, región ${esc(d.region)} · Ubigeo INEI ${esc(d.ubigeo)}.</p>
    <footer class="card-f"><div class="src"><span class="src-dot src-ok" aria-hidden="true"></span><span>Fuente: ${link('https://censos2017.inei.gob.pe/redatam/', 'INEI – Censos Nacionales 2017 y mapa de pobreza')}</span></div></footer>
  </div>`;
}

export function renderElections(p: Panel | null, ctx: Ctx): string {
  return shell(p?.elections, ctx, {
    title: 'Elección de Gobernador Regional 2026',
    empty: 'Sin resultados electorales',
    body: (e) => {
      const max = Math.max(...e.parties.map((x) => x.pct), 1);
      return `<p class="lead">${esc(e.title)}. Votó el <strong>${fmtPct(e.turnoutPct)}</strong> de los electores, con el ${fmtPct(e.actasPct)} de actas contabilizadas.</p>
        <ol class="hbars">${e.parties
          .map(
            (x, i) => `<li${i === 0 ? ' class="is-first"' : ''}><span class="hb-name">${esc(tidyCaps(x.name))}</span>
            <span class="hb-track"><i style="width:${(x.pct / max) * 100}%"></i></span>
            <span class="hb-val">${fmtPct(x.pct)}<small>${fmtNum(x.votes)} votos</small></span></li>`,
          )
          .join('')}</ol>
        <dl class="facts facts-3">
          <div><dt>Votos emitidos</dt><dd>${fmtNum(e.emitted)}</dd></div>
          <div><dt>Votos válidos</dt><dd>${fmtNum(e.valid)}</dd></div>
          <div><dt>Participación</dt><dd>${fmtPct(e.turnoutPct)}</dd></div>
        </dl>
        <p class="muted">Porcentajes sobre votos válidos (sin blancos ni nulos).</p>`;
    },
  });
}
