import { describe, expect, it } from 'vitest';
import { EXPOSED, SCENARIOS, WARNING } from '../../src/lib/glof.ts';
import { renderSimulator, SIMULATOR_URL } from '../../src/sections/simulator.ts';
import { LAYOUTS } from '../../src/views.ts';

describe('alluvion simulator card', () => {
  const html = renderSimulator();

  it('links to the 3D simulator page in a new tab', () => {
    expect(SIMULATOR_URL).toBe('/simulador/palcacocha.html');
    expect(html).toContain(`href="${SIMULATOR_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('Abrir la simulación 3D');
  });

  it('shows the key figures from the same model the simulator runs on', () => {
    const minutes = Math.round(SCENARIOS.grande.entrance.frontH * 60);
    expect(html).toContain(`${minutes} min`);
    expect(html).toContain(`${WARNING.minutes} min`);
    expect(html).toContain('12,393');
    expect(EXPOSED.independencia).toBe(12_393);
  });

  it('says it is illustrative and not official', () => {
    expect(html).toContain('no es un modelo oficial');
  });

  it('sits in the Mapa view, before the map sources', () => {
    const mapa = LAYOUTS.mapa;
    expect(mapa.indexOf('data-body="simulator"')).toBeGreaterThan(-1);
    expect(mapa.indexOf('data-body="simulator"')).toBeLessThan(mapa.indexOf('data-body="mapSources"'));
  });
});
