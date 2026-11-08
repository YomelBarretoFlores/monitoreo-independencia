import { esc, fmtNum } from '../lib/format.ts';
import {
  ARRIVAL_EVIDENCE,
  type EvidenceKind,
  LAKE_IDS,
  LAKES,
  type LakeStatus,
  SOURCES,
} from '../lib/glof.ts';
import { icon } from '../ui/icons.ts';

// Card under the map: opens the alluvion simulation on the map itself (src/sections/glof-sim.ts) and shows
// the evidence behind every time figure, so the numbers people quote can be checked against the studies.

const KIND_LABEL: Record<EvidenceKind, string> = {
  modelo: 'Modelo',
  sensibilidad: 'Rango del modelo',
  reconstruccion: 'Reconstrucción 1941',
  evacuacion: 'Tiempo para evacuar',
  'sin-fuente': 'Sin fuente',
};

const STATUS_LABEL: Record<LakeStatus, string> = {
  timed: 'Con tiempos publicados',
  comparable: 'Sin minutos publicados',
  'no-study': 'Sin estudio',
};

const sourceLink = (id: keyof typeof SOURCES) => {
  const s = SOURCES[id];
  return `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label.split(',')[0]!)} (${s.year})</a>`;
};

export function renderSimulator(): string {
  const evidence = ARRIVAL_EVIDENCE.map(
    (e) => `<li class="sim-ev sim-ev-${e.kind}">
      <b>${esc(e.value)}</b>
      <span><small>${esc(KIND_LABEL[e.kind])}</small>${esc(e.what)}${e.source ? ` ${sourceLink(e.source)}` : ''}</span>
    </li>`,
  ).join('');
  const lakes = LAKE_IDS.map((id) => {
    const l = LAKES[id];
    return `<li><span class="sim-lake-n">${esc(l.name)}</span><span class="sim-st sim-st-${l.status}">${esc(STATUS_LABEL[l.status])}</span>
      <small>${esc(l.path)} · ${fmtNum(l.volumeM3 / 1e6, 1)} millones de m³ (batimetría ${l.volumeYear}, ${sourceLink(l.volumeSource)})</small></li>`;
  }).join('');
  return `<section class="card sim-card" aria-labelledby="sim-h">
    <div class="sim-body">
      <p class="sim-k">Simulación del aluvión en el mapa</p>
      <h3 id="sim-h">¿Cuánto tardaría un aluvión en llegar a Huaraz e Independencia?</h3>
      <p>La simulación corre sobre la imagen satelital y el relieve reales del mapa de arriba: el aluvión baja por el cauce que sale del propio relieve, y al llegar a la ciudad se marca el mapa de peligro oficial. Palcacocha y Llaca tienen tiempos publicados; para las otras lagunas se muestra lo que dicen los estudios.</p>
      <p class="sim-links"><button type="button" class="btn" data-glof-open>${icon('flood')}<span>Ver la simulación en el mapa</span></button></p>
      <ul class="sim-lakes">${lakes}</ul>
      <p class="muted sim-note">Simulación ilustrativa, no es un modelo oficial. Entre los puntos que publican los estudios, el avance se interpola.</p>
    </div>
    <div class="sim-evidence">
      <p class="sim-k">Las cifras que circulan y qué son</p>
      <ul>${evidence}</ul>
    </div>
  </section>`;
}
