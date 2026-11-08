import { esc, fmtNum } from '../lib/format.ts';
import { EXPOSED, SCENARIOS, WARNING } from '../lib/palcacocha.ts';
import { icon } from '../ui/icons.ts';

// Entry card for the Palcacocha alluvion simulator (public/simulador/, built from sims/ with the teardown kit).
// The figures come from the same model the simulator runs on.

export const SIMULATOR_URL = '/simulador/palcacocha.html';

export function renderSimulator(): string {
  const big = SCENARIOS.grande;
  const figures: [string, string][] = [
    [
      `${fmtNum(Math.round(big.entrance.frontH * 60))} min`,
      'tarda el frente en llegar a la ciudad en el escenario grande',
    ],
    [`${fmtNum(WARNING.minutes)} min`, 'de aviso que da el sistema de alerta temprana regional'],
    [fmtNum(EXPOSED.independencia), 'personas de Independencia viven en la zona inundable'],
  ];
  return `<section class="card sim-card" aria-labelledby="sim-h">
    <div class="sim-body">
      <p class="sim-k">Simulación 3D · Laguna Palcacocha</p>
      <h3 id="sim-h">¿Cómo bajaría un aluvión hasta Huaraz e Independencia?</h3>
      <p>Recorre en 3D el valle real, desde la avalancha en la laguna, por la quebrada Cojup y el río Quillcay, hasta la ciudad. Puedes comparar tres escenarios publicados y ver el mapa de peligro y las zonas seguras.</p>
      <p class="sim-links"><a class="btn" href="${SIMULATOR_URL}" target="_blank" rel="noopener">${icon('external')}<span>Abrir la simulación 3D</span></a></p>
      <p class="muted sim-note">Simulación ilustrativa, no es un modelo oficial. Cifras de Somos-Valenzuela et al. (2016), INDECI (2015) y el Gobierno Regional de Áncash (2021).</p>
    </div>
    <ul class="sim-figs">${figures.map(([v, k]) => `<li><b>${esc(v)}</b><span>${esc(k)}</span></li>`).join('')}</ul>
  </section>`;
}
