// Hash routes: one view per sidebar item, old single-page anchors still land somewhere sensible.
import { describe, expect, it } from 'vitest';
import { ROUTES, matchRoute, parseRoute } from '../../src/lib/router.ts';

describe('parseRoute', () => {
  it('defaults to the summary', () => {
    expect(parseRoute('')).toBe('resumen');
    expect(parseRoute('#')).toBe('resumen');
    expect(parseRoute('#/')).toBe('resumen');
  });

  it('accepts every route with or without a leading slash', () => {
    for (const r of ROUTES) {
      expect(parseRoute(`#${r.id}`)).toBe(r.id);
      expect(parseRoute(`#/${r.id}`)).toBe(r.id);
    }
  });

  it('maps the anchors of the old one-page layout to their new view', () => {
    expect(parseRoute('#hoy')).toBe('resumen');
    expect(parseRoute('#lagunas')).toBe('rios');
    expect(parseRoute('#normas')).toBe('noticias');
    expect(parseRoute('#riesgo')).toBe('mapa');
    expect(parseRoute('#elecciones')).toBe('gestion');
  });

  it('falls back to the summary for unknown hashes', () => {
    expect(parseRoute('#nada')).toBe('resumen');
  });
});

describe('matchRoute', () => {
  it('returns null for in-page anchors such as the skip link, so they do not navigate', () => {
    expect(matchRoute('#view')).toBeNull();
    expect(matchRoute('#nada')).toBeNull();
  });
});

describe('ROUTES', () => {
  it('lists the sidebar items in order with Spanish labels', () => {
    expect(ROUTES.map((r) => r.label)).toEqual([
      'Resumen',
      'Lluvias y clima',
      'Ríos y lagunas',
      'El Niño',
      'Emergencias y sismos',
      'Mapa',
      'Noticias',
      'Gestión municipal',
      'Fuentes',
    ]);
  });
});
