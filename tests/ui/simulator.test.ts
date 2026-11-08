import { describe, expect, it } from 'vitest';
import { ARRIVAL_EVIDENCE, LAKE_IDS, LAKES, SOURCES } from '../../src/lib/glof.ts';
import { renderSimulator } from '../../src/sections/simulator.ts';
import { LAYOUTS } from '../../src/views.ts';

describe('alluvion simulation card', () => {
  const html = renderSimulator();

  it('opens the simulation on the map above, not on another page', () => {
    expect(html).toContain('data-glof-open');
    expect(html).toContain('Ver la simulación en el mapa');
    expect(html).not.toContain('/simulador/');
  });

  it('lists every published time figure with what it really is and its source', () => {
    for (const e of ARRIVAL_EVIDENCE) {
      expect(html).toContain(e.value);
      if (e.source) expect(html).toContain(`href="${SOURCES[e.source].url}"`);
    }
    expect(html).toContain('No es el tiempo de llegada');
    expect(html).toContain('no se usa');
  });

  it('shows each lake and whether its outburst has a timed study', () => {
    for (const id of LAKE_IDS) expect(html).toContain(LAKES[id].name);
    expect(html).toContain('Con tiempos publicados');
    expect(html).toContain('Sin minutos publicados');
    expect(html).toContain('Sin estudio');
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
