// Safe-zone vocabulary, filters and popups (src/lib/safezones.ts).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  directionsUrl,
  matchesQuery,
  matchHazard,
  matchArrow,
  matchPlace,
  matchRoute,
  matchZone,
  monthYear,
  placeColor,
  placeLabel,
  placePopup,
  type PlaceProps,
  type SafeZoneFilters,
  zonePopup,
  type ZoneProps,
} from '../../src/lib/safezones.ts';

const zone: ZoneProps = {
  basin: 'casca',
  id: 'ZS-12',
  areaHa: 0.075,
  maxEvacMin: 12,
  avgEvacMin: 5,
  altitudeM: 3182.4,
  influenceHa: 3.892,
  independencia: true,
};
const pin: PlaceProps = { basin: 'quillcay', group: 'seguro', kind: 'refugio', independencia: false };
const school: PlaceProps = { basin: 'casca', group: 'expuesto', kind: 'educacion', independencia: true };
const f = (patch: Partial<SafeZoneFilters>): SafeZoneFilters => ({ ...DEFAULT_FILTERS, ...patch });

describe('default filters', () => {
  it('show every hazard level, zone and safe pin of both maps, without exposed elements', () => {
    expect(matchHazard({ basin: 'quillcay', level: 'bajo' }, DEFAULT_FILTERS)).toBe(true);
    expect(matchZone(zone, DEFAULT_FILTERS)).toBe(true);
    expect(matchPlace(pin, DEFAULT_FILTERS)).toBe(true);
    expect(matchPlace(school, DEFAULT_FILTERS)).toBe(false);
  });
});

describe('filters', () => {
  it('basin and hazard level', () => {
    expect(matchHazard({ basin: 'casca', level: 'alto' }, f({ basins: ['quillcay'] }))).toBe(false);
    expect(matchHazard({ basin: 'casca', level: 'alto' }, f({ levels: ['muy-alto'] }))).toBe(false);
    expect(matchZone(zone, f({ basins: ['quillcay'] }))).toBe(false);
    expect(matchPlace(pin, f({ basins: ['casca'] }))).toBe(false);
  });

  it('safe-place kind, with Casca zones as the "zona" kind', () => {
    expect(matchZone(zone, f({ kinds: ['refugio'] }))).toBe(false);
    expect(matchPlace(pin, f({ kinds: ['zona'] }))).toBe(false);
    expect(matchPlace(pin, f({ kinds: ['refugio'] }))).toBe(true);
  });

  it('max evacuation time keeps quick Casca zones and hides pins, which have no time', () => {
    expect(matchZone(zone, f({ maxEvacMin: 15 }))).toBe(true);
    expect(matchZone(zone, f({ maxEvacMin: 10 }))).toBe(false);
    expect(matchPlace(pin, f({ maxEvacMin: 30 }))).toBe(false);
  });

  it('only Independencia', () => {
    expect(matchPlace(pin, f({ onlyIndependencia: true }))).toBe(false);
    expect(matchZone(zone, f({ onlyIndependencia: true }))).toBe(true);
  });

  it('evacuation routes (Casca) and arrows (Quillcay) follow their basin and the routes toggle', () => {
    expect(matchRoute({ basin: 'casca' }, DEFAULT_FILTERS)).toBe(true);
    expect(matchArrow({ basin: 'quillcay', bearing: 90 }, DEFAULT_FILTERS)).toBe(true);
    expect(matchRoute({ basin: 'casca' }, f({ routes: false }))).toBe(false);
    expect(matchArrow({ basin: 'quillcay', bearing: 90 }, f({ routes: false }))).toBe(false);
    expect(matchArrow({ basin: 'quillcay', bearing: 90 }, f({ basins: ['casca'] }))).toBe(false);
    // hiding the zone kind no longer hides the routes: they have their own toggle
    expect(matchRoute({ basin: 'casca' }, f({ kinds: ['refugio'] }))).toBe(true);
  });

  it('exposed elements appear only when asked for, still within the basin filter', () => {
    expect(matchPlace(school, f({ exposed: true }))).toBe(true);
    expect(matchPlace(school, f({ exposed: true, basins: ['quillcay'] }))).toBe(false);
  });
});

describe('matchesQuery', () => {
  it('ignores case, accents and extra spaces; an empty query matches', () => {
    expect(matchesQuery('Atención médica · Quillcay', 'atencion  MEDICA')).toBe(true);
    expect(matchesQuery('ZS-12', 'zs-1')).toBe(true);
    expect(matchesQuery('ZS-12', 'zs-3')).toBe(false);
    expect(matchesQuery('cualquiera', '  ')).toBe(true);
  });
});

describe('labels and popups', () => {
  it('names and colors depend on the group (salud exists in both)', () => {
    expect(placeLabel({ group: 'seguro', kind: 'salud' })).toBe('Atención médica');
    expect(placeLabel({ group: 'expuesto', kind: 'salud' })).toBe('Establecimiento de salud');
    expect(placeColor({ group: 'seguro', kind: 'salud' })).not.toBe(
      placeColor({ group: 'expuesto', kind: 'salud' }),
    );
  });

  it('a zone popup shows the source table values, the district and directions', () => {
    const html = zonePopup(zone, -9.5, -77.52);
    expect(html).toContain('<h3>ZS-12</h3>');
    expect(html).toContain('12 min');
    expect(html).toContain('Distrito de Independencia');
    expect(html).toContain(directionsUrl(-9.5, -77.52).replace(/&/g, '&'));
  });

  it('exposed elements get no directions link; text is escaped', () => {
    expect(placePopup(school, -9.5, -77.5)).not.toContain('Cómo llegar');
    expect(placePopup({ ...pin, kind: '<b>x</b>' }, 0, 0)).not.toContain('<b>x</b>');
  });

  it('directions point at the coordinates with 6 decimals', () => {
    expect(directionsUrl(-9.5, -77.523456789)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-9.500000,-77.523457',
    );
  });

  it('formats year-month in Spanish', () => {
    expect(monthYear('2025-05')).toBe('mayo de 2025');
    expect(monthYear('2026-08')).toBe('agosto de 2026');
  });
});
