import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_EVIDENCE,
  bearingAlong,
  playRate,
  pointAlong,
  type RoutePoint,
  simEnd,
  cityRevealAt,
  floodGradient,
  LAKES,
  dischargeAt,
  frontAt,
  makeRoute,
  phaseAt,
  SCENARIOS,
  type ScenarioId,
  scenarioOf,
  SOURCES,
  stateAt,
  warningAt,
} from '../../src/lib/glof.ts';

// a route like the real one: 25.1 km, the hazard map entered at 22.2 km
const route = makeRoute(25_100, 22_200);
const big = SCENARIOS.grande;

describe('Palcacocha scenarios (Somos-Valenzuela et al. 2016, Table 6)', () => {
  it('keeps the published figures of the three avalanche sizes', () => {
    expect(big.avalancheM3).toBe(3_000_000);
    expect(big.entrance.frontH).toBe(1.32);
    expect(big.entrance.peakM3s).toBe(1980);
    expect(big.exit!.frontH).toBe(2.1);
    expect(SCENARIOS.mediano.entrance.frontH).toBe(2.9);
    expect(SCENARIOS.pequeno.exit!.frontH).toBe(15.8);
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
    expect(frontAt(big, route, big.exit!.frontH * 3600)).toBeCloseTo(25_100, 0);
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
    expect(phaseAt(big, route, big.exit!.frontH * 3600 + 60)).toBe('santa');
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

describe('lakes and the evidence behind each time', () => {
  it('times only the lakes with a published timed model', () => {
    expect(LAKES.palcacocha.status).toBe('timed');
    expect(LAKES.tullparaju.status).toBe('comparable');
    expect(LAKES.cuchillacocha.status).toBe('comparable');
    expect(LAKES.llaca.status).toBe('timed');
    for (const id of ['shallap', 'rajucolta'] as const) expect(LAKES[id].status).toBe('no-study');
    for (const l of Object.values(LAKES)) expect(SOURCES[l.volumeSource]).toBeDefined();
  });

  it('gives every timed lake its own scenarios, and only the timed lakes', () => {
    for (const l of Object.values(LAKES)) expect(l.scenarios !== null).toBe(l.status === 'timed');
    expect(LAKES.palcacocha.scenarios).toBe(SCENARIOS);
    expect(scenarioOf('palcacocha', 'r1941')).toBe(SCENARIOS.r1941);
    expect(scenarioOf('tullparaju', 'grande')).toBeNull();
  });
});

describe('Llaca scenarios (INAIGEM 2026, subcuenca Casca)', () => {
  const s = (id: ScenarioId) => scenarioOf('llaca', id)!;

  it('keeps the published arrival at the north of the city: 41, 25 and 22 minutes', () => {
    expect(s('pequeno').entrance.frontH * 60).toBeCloseTo(41, 9);
    expect(s('mediano').entrance.frontH * 60).toBeCloseTo(25, 9);
    expect(s('grande').entrance.frontH * 60).toBeCloseTo(22, 9);
    for (const id of ['grande', 'mediano', 'pequeno'] as const) {
      expect(s(id).source).toBe('inaigem2026casca');
      // the study stops at the city: no río Santa time, no downstream discharge
      expect(s(id).exit).toBeNull();
      expect(s(id).entrance.peakM3s).toBeNull();
    }
  });

  it('keeps the published avalanche volumes and outlet peak discharges', () => {
    expect(s('grande').avalancheM3).toBe(3_857_000);
    expect(s('mediano').avalancheM3).toBe(2_635_000);
    expect(s('pequeno').avalancheM3).toBe(623_000);
    expect(s('grande').overtopPeakM3s).toBe(53_800);
    expect(s('mediano').overtopPeakM3s).toBe(42_300);
    expect(s('pequeno').overtopPeakM3s).toBe(9_200);
  });

  it('has no 1941 reconstruction', () => {
    expect(scenarioOf('llaca', 'r1941')).toBeNull();
  });

  it('uses the 2024 bathymetry the study cites', () => {
    expect(LAKES.llaca.volumeM3).toBe(672_177);
    expect(LAKES.llaca.volumeYear).toBe(2024);
    expect(LAKES.llaca.timingSource).toBe('inaigem2026casca');
  });

  it('gives no discharge downstream of the dam, where the study publishes none', () => {
    const r = makeRoute(14_133, 9_406);
    expect(dischargeAt(s('grande'), r, 0)).toBe(53_800);
    expect(dischargeAt(s('grande'), r, 5_000)).toBeNull();
    expect(stateAt(s('grande'), r, 10 * 60).dischargeM3s).toBeNull();
  });

  it('stops the front at the city entrance after the published time', () => {
    const r = makeRoute(14_133, 9_406);
    expect(frontAt(s('grande'), r, 22 * 60)).toBeCloseTo(9_406, 6);
    expect(frontAt(s('grande'), r, 60 * 60)).toBe(9_406);
    expect(simEnd(s('grande'))).toBe(22 * 60 + 1200);
  });

  it('lists the Llaca times among the figures that circulate, with their source', () => {
    const e = ARRIVAL_EVIDENCE.find((x) => x.source === 'inaigem2026casca')!;
    expect(e.value).toBe('22–41 min');
    expect(e.kind).toBe('modelo');
  });

  it('keeps the published ranges: Somos 2016 sensitivity and the 1941 reconstruction', () => {
    expect(SCENARIOS.grande.entrance.rangeH).toEqual([1.05, 1.32]);
    expect(SCENARIOS.r1941.entrance.rangeH).toEqual([36 / 60, 70 / 60]);
    expect(SCENARIOS.r1941.source).toBe('mergili2020');
    expect(SCENARIOS.r1941.exit).toBeNull();
  });

  it('explains the 15 and 30 minute figures instead of using them', () => {
    const fifteen = ARRIVAL_EVIDENCE.find((e) => e.value === '15 min')!;
    const thirty = ARRIVAL_EVIDENCE.find((e) => e.value === '30 min')!;
    expect(fifteen.kind).toBe('sin-fuente');
    expect(thirty.kind).toBe('evacuacion');
    for (const e of ARRIVAL_EVIDENCE) if (e.source) expect(SOURCES[e.source]).toBeDefined();
  });
});

describe('animation helpers', () => {
  it('stops the 1941 front at the city entrance, where its reconstruction ends', () => {
    const s = SCENARIOS.r1941;
    expect(frontAt(s, route, 10 * 3600)).toBe(22_200);
  });

  it('builds a valid line-gradient: strictly increasing stops from 0 to 1', () => {
    for (const p of [0, 0.001, 0.3, 0.97, 1]) {
      const expr = floodGradient(p) as unknown[];
      expect(expr.slice(0, 3)).toEqual(['interpolate', ['linear'], ['line-progress']]);
      const stops = expr.slice(3).filter((_, i) => i % 2 === 0) as number[];
      expect(stops[0]).toBe(0);
      expect(stops.at(-1)).toBe(1);
      for (let i = 1; i < stops.length; i++) expect(stops[i]!).toBeGreaterThan(stops[i - 1]!);
    }
  });

  it('reveals the city hazard map only after the front enters it', () => {
    const s = SCENARIOS.grande;
    const tIn = s.entrance.frontH * 3600;
    expect(cityRevealAt(s, tIn - 1)).toBe(0);
    expect(cityRevealAt(s, tIn + 1)).toBeGreaterThan(0);
    expect(cityRevealAt(s, s.exit!.frontH * 3600)).toBe(1);
    expect(cityRevealAt(SCENARIOS.r1941, 99 * 3600)).toBe(1);
  });
});

describe('route geometry and playback', () => {
  const path: RoutePoint[] = [
    [-77.4, -9.4, 4500, 0],
    [-77.41, -9.4, 4400, 1000],
    [-77.41, -9.41, 4300, 2000],
  ];

  it('finds the point at a distance along the route, clamped to its ends', () => {
    expect(pointAlong(path, 500)).toEqual([-77.405, -9.4]);
    expect(pointAlong(path, -10)).toEqual([-77.4, -9.4]);
    expect(pointAlong(path, 9999)).toEqual([-77.41, -9.41]);
  });

  it('gives the heading of the route at a distance (west, then south)', () => {
    expect(bearingAlong(path, 500)).toBeCloseTo(-90, 0);
    expect(bearingAlong(path, 1500)).toBeCloseTo(180, 0);
  });

  it('plays the avalanche slowly and the whole run in about 70 seconds', () => {
    const s = SCENARIOS.grande;
    expect(playRate(s, 0)).toBeLessThan(10);
    expect(playRate(s, 3600)).toBeCloseTo((s.exit!.frontH * 3600) / 70, 0);
    expect(simEnd(s)).toBe(s.exit!.frontH * 3600 + 600);
    expect(simEnd(SCENARIOS.r1941)).toBe(SCENARIOS.r1941.entrance.frontH * 3600 + 1200);
  });
});
