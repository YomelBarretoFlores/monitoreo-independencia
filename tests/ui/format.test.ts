import { describe, expect, it } from 'vitest';
import {
  esc,
  fmtDate,
  fmtDateTime,
  fmtDay,
  fmtNum,
  fmtPct,
  fmtSoles,
  fmtSolesShort,
  limaToday,
  safeUrl,
  timeAgo,
  tidyCaps,
  timeUntil,
} from '../../src/lib/format.ts';

describe('esc', () => {
  it('escapes every HTML-significant character', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  it('turns null and undefined into an empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(12)).toBe('12');
  });
});

describe('safeUrl', () => {
  it('keeps http and https links', () => {
    expect(safeUrl('https://www.senamhi.gob.pe/?p=avisos')).toBe('https://www.senamhi.gob.pe/?p=avisos');
    expect(safeUrl('http://example.org/a b')).toBe('http://example.org/a%20b');
  });
  it('rejects other schemes, relative and empty links', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('/relative')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe('numbers (es-PE)', () => {
  it('groups thousands with a comma and uses a decimal point', () => {
    expect(fmtNum(76088)).toBe('76,088');
    expect(fmtNum(11.54, 1)).toBe('11.5');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(Number.NaN)).toBe('—');
  });
  it('formats percentages', () => {
    expect(fmtPct(78.139)).toBe('78.1%');
    expect(fmtPct(null)).toBe('—');
  });
  it('formats soles in full and short', () => {
    expect(fmtSoles(3220267643)).toBe('S/ 3,220,267,643');
    expect(fmtSolesShort(3220267643)).toBe('S/ 3,220 millones');
    expect(fmtSolesShort(5319718)).toBe('S/ 5.3 millones');
    expect(fmtSolesShort(584076)).toBe('S/ 584 mil');
    expect(fmtSolesShort(950)).toBe('S/ 950');
    expect(fmtSolesShort(null)).toBe('—');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-11-07T20:00:00Z');
  it('says how long ago in plain Spanish', () => {
    expect(timeAgo('2026-11-07T19:59:40Z', now)).toBe('hace instantes');
    expect(timeAgo('2026-11-07T19:57:00Z', now)).toBe('hace 3 min');
    expect(timeAgo('2026-11-07T18:00:00Z', now)).toBe('hace 2 h');
    expect(timeAgo('2026-11-06T18:00:00Z', now)).toBe('hace 1 día');
    expect(timeAgo('2026-11-02T18:00:00Z', now)).toBe('hace 5 días');
  });
  it('handles never-loaded and future timestamps', () => {
    expect(timeAgo(null, now)).toBe('nunca');
    expect(timeAgo('2026-11-07T20:05:00Z', now)).toBe('hace instantes');
    expect(timeAgo('not a date', now)).toBe('nunca');
  });
});

describe('timeUntil', () => {
  const now = Date.parse('2026-11-07T20:00:00Z');
  it('says how long until a future instant', () => {
    expect(timeUntil('2026-11-07T20:30:00Z', now)).toBe('en 30 min');
    expect(timeUntil('2026-11-08T01:00:00Z', now)).toBe('en 5 h');
    expect(timeUntil('2026-11-09T21:00:00Z', now)).toBe('en 2 días');
    expect(timeUntil('2026-11-07T19:00:00Z', now)).toBe('ya');
  });
});

describe('dates in Lima time (UTC-5)', () => {
  it('formats ISO instants in Lima time', () => {
    expect(fmtDate('2026-11-08T03:30:00Z')).toBe('7 nov 2026');
    expect(fmtDateTime('2026-11-07T20:05:00Z')).toBe('7 nov, 15:05');
  });
  it('formats plain calendar days without shifting them', () => {
    expect(fmtDate('2026-11-07')).toBe('7 nov 2026');
    expect(fmtDay('2026-11-07')).toBe('sáb 7');
  });
  it('gives today in Lima', () => {
    expect(limaToday(Date.parse('2026-11-08T03:00:00Z'))).toBe('2026-11-07');
    expect(limaToday(Date.parse('2026-11-08T06:00:00Z'))).toBe('2026-11-08');
  });
  it('returns a dash for missing or invalid dates', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDateTime('x')).toBe('—');
  });
});

describe('tidyCaps', () => {
  it('turns ALL-CAPS official names into sentence case, keeping acronyms', () => {
    expect(tidyCaps('MEJORAMIENTO DEL SERVICIO DE AGUA EN HUARAZ - ANCASH')).toBe('Mejoramiento del servicio de agua en huaraz - ancash');
    expect(tidyCaps('UNIVERSIDAD NACIONAL (UNASAM) Y MTC')).toBe('Universidad nacional (UNASAM) y MTC');
  });
  it('leaves mixed-case text untouched', () => {
    expect(tidyCaps('Río Santa (altura de Independencia)')).toBe('Río Santa (altura de Independencia)');
    expect(tidyCaps('')).toBe('');
  });
});
