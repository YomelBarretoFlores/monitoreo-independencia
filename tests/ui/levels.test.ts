import { describe, expect, it } from 'vitest';
import { levelHeadline, levelLabel, levelRank, maxLevel, riskTextLevel } from '../../src/lib/levels.ts';

describe('levels', () => {
  it('orders levels from calm to worst', () => {
    expect(levelRank('normal')).toBeLessThan(levelRank('atencion'));
    expect(levelRank('atencion')).toBeLessThan(levelRank('alerta'));
    expect(levelRank('alerta')).toBeLessThan(levelRank('emergencia'));
  });
  it('picks the worst level, normal when empty', () => {
    expect(maxLevel(['normal', 'alerta', 'atencion'])).toBe('alerta');
    expect(maxLevel([])).toBe('normal');
  });
  it('labels each level in Spanish', () => {
    expect(levelLabel('normal')).toBe('Normal');
    expect(levelLabel('atencion')).toBe('Atención');
    expect(levelLabel('alerta')).toBe('Alerta');
    expect(levelLabel('emergencia')).toBe('Emergencia');
  });
  it('gives a plain headline for the overall traffic light', () => {
    expect(levelHeadline('normal')).toBe('Situación normal');
    expect(levelHeadline('emergencia')).toBe('Emergencia: actuar ahora');
  });
});

describe('riskTextLevel', () => {
  it('maps CENEPRED hazard/risk words to a level, accent- and case-insensitive', () => {
    expect(riskTextLevel('Muy alto')).toBe('emergencia');
    expect(riskTextLevel('ALTO')).toBe('alerta');
    expect(riskTextLevel('Medio')).toBe('atencion');
    expect(riskTextLevel('Bajo')).toBe('normal');
    expect(riskTextLevel('Muy bajo')).toBe('normal');
  });
  it('returns null for unknown or missing text', () => {
    expect(riskTextLevel(null)).toBeNull();
    expect(riskTextLevel('n/d')).toBeNull();
  });
});
