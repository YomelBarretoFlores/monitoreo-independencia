import { describe, expect, it } from 'vitest';
import {
  dischargeAt,
  frontAt,
  makeRoute,
  phaseAt,
  SCENARIOS,
  SOURCES,
  stateAt,
  warningAt,
} from '../../src/lib/palcacocha.ts';

// a route like the real one: 25.1 km, the hazard map entered at 22.2 km
const route = makeRoute(25_100, 22_200);
const big = SCENARIOS.grande;

describe('Palcacocha scenarios (Somos-Valenzuela et al. 2016, Table 6)', () => {
  it('keeps the published figures of the three avalanche sizes', () => {
    expect(big.avalancheM3).toBe(3_000_000);
    expect(big.entrance.frontH).toBe(1.32);
    expect(big.entrance.peakM3s).toBe(1980);
    expect(big.exit.frontH).toBe(2.1);
    expect(SCENARIOS.mediano.entrance.frontH).toBe(2.9);
    expect(SCENARIOS.pequeno.exit.frontH).toBe(15.8);
  });

  it('cites a source for every scenario and fact', () => {
    for (const s of Object.values(SCENARIOS)) expect(SOURCES[s.source]).toBeDefined();
    for (const src of Object.values(SOURCES)) expect(src.url).toMatch(/^https:\/\//);
  });
});

describe('flood front along the route', () => {
  it('starts at the lake when the avalanche hits it', () => {
    expect(frontAt(big, route, 0)).toBe(0);
    expect(frontAt(big, route, big.impactS)).toBe(0);
  });

  it('reaches the city entrance and the río Santa at the published times', () => {
    expect(frontAt(big, route, big.entrance.frontH * 3600)).toBeCloseTo(22_200, 0);
    expect(frontAt(big, route, big.exit.frontH * 3600)).toBeCloseTo(25_100, 0);
    expect(frontAt(big, route, 99 * 3600)).toBe(25_100);
  });

  it('moves forward monotonically', () => {
    let last = -1;
    for (let t = 0; t < 3 * 3600; t += 60) {
      const d = frontAt(big, route, t);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });

  it('is slower in a smaller scenario', () => {
    const t = 3600;
    expect(frontAt(SCENARIOS.pequeno, route, t)).toBeLessThan(frontAt(big, route, t));
  });
});

describe('peak discharge along the route', () => {
  it('matches the study at the dam, the city entrance and the city exit', () => {
    expect(dischargeAt(big, route, 0)).toBeCloseTo(63_400, 0);
    expect(dischargeAt(big, route, 22_200)).toBeCloseTo(1980, 0);
    expect(dischargeAt(big, route, 25_100)).toBeCloseTo(920, 0);
  });

  it('attenuates downstream', () => {
    expect(dischargeAt(big, route, 10_000)).toBeLessThan(63_400);
    expect(dischargeAt(big, route, 10_000)).toBeGreaterThan(1980);
  });
});

describe('phases and warning', () => {
  it('names each phase of the event', () => {
    expect(phaseAt(big, route, -10)).toBe('calma');
    expect(phaseAt(big, route, 10)).toBe('avalancha');
    expect(phaseAt(big, route, 60)).toBe('quebrada');
    expect(phaseAt(big, route, big.entrance.frontH * 3600 + 60)).toBe('ciudad');
    expect(phaseAt(big, route, big.exit.frontH * 3600 + 60)).toBe('santa');
  });

  it('counts down the time left before the front reaches the city', () => {
    const w = warningAt(big, route, 600);
    expect(w.detected).toBe(true);
    expect(w.minutesToCity).toBeCloseTo(big.entrance.frontH * 60 - 10, 5);
    expect(warningAt(big, route, -5).detected).toBe(false);
    expect(warningAt(big, route, 2 * 3600).minutesToCity).toBe(0);
  });

  it('gathers every readout in one state', () => {
    const s = stateAt(big, route, 1800);
    expect(s.frontM).toBe(frontAt(big, route, 1800));
    expect(s.dischargeM3s).toBe(dischargeAt(big, route, s.frontM));
    expect(s.phase).toBe('quebrada');
    expect(s.progress).toBeCloseTo(s.frontM / 25_100, 9);
  });
});
