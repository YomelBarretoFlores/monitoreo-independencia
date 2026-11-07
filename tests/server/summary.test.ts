// Summary rules: each one alone, then the ordering of reasons.
import { describe, expect, it } from 'vitest';
import { buildSummary, type SummaryInput } from '../../server/summary.ts';
import type { DayForecast, Earthquake, FeedItem, RiverPoint, WeatherWarning } from '../../shared/types.ts';

const NOW = new Date('2026-11-07T21:00:00Z'); // Saturday 7/11, 16:00 Lima
const empty: SummaryInput = {
  warnings: [],
  forecast: null,
  rivers: [],
  elNino: null,
  emergencies: [],
  earthquakes: [],
};

const warning = (o: Partial<WeatherWarning>): WeatherWarning => ({
  number: 456,
  title: 'Precipitaciones en la costa y sierra',
  level: 'alerta',
  levelLabel: 'Nivel 3 (naranja)',
  start: '2026-11-06T05:00:00.000Z',
  end: '2026-11-09T04:59:59.000Z',
  url: 'u',
  ...o,
});
const days = (mm: number[]): DayForecast[] =>
  ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((date, i) => ({
    date,
    precipMm: i === 0 ? 99 : (mm[i - 1] ?? 0), // yesterday never counts
    precipProbPct: null,
    tMaxC: null,
    tMinC: null,
  }));
const forecast = (mm: number[]) => ({
  point: [-9.51, -77.53] as [number, number],
  daily: days(mm),
  hourly: [],
});
const river = (level: RiverPoint['level']): RiverPoint => ({
  id: 'rio-santa',
  name: 'Río Santa (altura de Huaraz e Independencia)',
  point: [0, 0],
  series: [
    { date: '2026-11-06', dischargeM3s: 20, maxM3s: null, forecast: false },
    { date: '2026-11-08', dischargeM3s: 45, maxM3s: null, forecast: true },
  ],
  referenceM3s: 20,
  level,
});
const coen = (tags: string[], date = '2026-11-05T12:00:00.000Z'): FeedItem => ({
  title: 't',
  date,
  url: 'u' + date + tags,
  source: 'INDECI – COEN',
  tags,
});
const quake = (magnitude: number, distanceKm: number, date = '2026-11-05T12:00:00.000Z'): Earthquake => ({
  date,
  magnitude,
  depthKm: 30,
  point: [0, 0],
  reference: '5 km al S de Carhuaz, Carhuaz - Áncash',
  distanceKm,
  url: 'u',
});

describe('buildSummary', () => {
  it('is normal with a plain reason when nothing is active', () => {
    expect(buildSummary(empty, NOW)).toEqual({
      level: 'normal',
      reasons: ['No hay avisos ni alertas activas para Independencia en este momento.'],
    });
  });

  it('SENAMHI: an active warning sets its own level; ended or far-future ones do not', () => {
    const s = buildSummary({ ...empty, warnings: [warning({})] }, NOW);
    expect(s.level).toBe('alerta');
    expect(s.reasons).toEqual([
      'SENAMHI: aviso N° 456 de nivel 3 (naranja) por «Precipitaciones en la costa y sierra», vigente hasta el dom 8/11, 23:59.',
    ]);
    const soon = buildSummary(
      {
        ...empty,
        warnings: [
          warning({
            level: 'atencion',
            levelLabel: 'Nivel 2 (amarillo)',
            start: '2026-11-09T05:00:00.000Z',
            end: '2026-11-12T04:59:59.000Z',
          }),
        ],
      },
      NOW,
    );
    expect(soon.level).toBe('atencion');
    expect(soon.reasons[0]).toBe(
      'SENAMHI: aviso N° 456 de nivel 2 (amarillo) por «Precipitaciones en la costa y sierra», desde el lun 9/11, 00:00 hasta el mié 11/11, 23:59.',
    );
    expect(
      buildSummary({ ...empty, warnings: [warning({ end: '2026-11-07T20:00:00.000Z' })] }, NOW).level,
    ).toBe('normal');
    expect(
      buildSummary(
        {
          ...empty,
          warnings: [warning({ start: '2026-11-11T05:00:00.000Z', end: '2026-11-12T05:00:00.000Z' })],
        },
        NOW,
      ).level,
    ).toBe('normal');
  });

  it('rain: thresholds on the wettest day and the 3-day total from today', () => {
    const lvl = (mm: number[]) => buildSummary({ ...empty, forecast: forecast(mm) }, NOW).level;
    expect(lvl([10, 10, 9])).toBe('normal'); // 29 mm in 3 days, 10 max
    expect(lvl([15, 0, 0])).toBe('atencion');
    expect(lvl([10, 10, 10])).toBe('atencion'); // 30 mm total
    expect(lvl([25, 0, 0])).toBe('alerta');
    expect(lvl([40, 0, 0])).toBe('emergencia');
    expect(lvl([0, 0, 0, 60])).toBe('normal'); // the 4th day is outside the 72 h window
    expect(buildSummary({ ...empty, forecast: forecast([18, 10, 4.5]) }, NOW).reasons).toEqual([
      'Se pronostican hasta 18 mm de lluvia en un día (32,5 mm en los próximos 3 días, Open-Meteo).',
    ]);
  });

  it('rivers: the worst modeled river level', () => {
    const s = buildSummary({ ...empty, rivers: [river('alerta'), { ...river('normal'), id: 'q' }] }, NOW);
    expect(s.level).toBe('alerta');
    expect(s.reasons).toEqual([
      'El modelo de caudales prevé que el Río Santa (altura de Huaraz e Independencia) llegue a 45 m³/s, 2,3 veces su promedio del último mes.',
    ]);
  });

  it('ENFEN: the El Niño alert status', () => {
    const elNino = {
      enfenStatus: 'Alerta de El Niño Costero',
      enfenLevel: 'alerta' as const,
      communiques: [],
      oni: [],
    };
    const s = buildSummary({ ...empty, elNino }, NOW);
    expect(s).toEqual({
      level: 'alerta',
      reasons: [
        'ENFEN mantiene el estado «Alerta de El Niño Costero»: se esperan lluvias por encima de lo normal.',
      ],
    });
  });

  it('INDECI: emergencies in Independencia (alerta) or Huaraz (atención) in the last 7 days', () => {
    expect(
      buildSummary({ ...empty, emergencies: [coen(['Independencia', 'Huaraz', 'Áncash'])] }, NOW),
    ).toEqual({
      level: 'alerta',
      reasons: ['INDECI registró 1 reporte de emergencia en Independencia en los últimos 7 días.'],
    });
    expect(
      buildSummary(
        { ...empty, emergencies: [coen(['Huaraz', 'Áncash']), coen(['Huaraz'], '2026-11-06T00:00:00.000Z')] },
        NOW,
      ),
    ).toEqual({
      level: 'atencion',
      reasons: ['INDECI registró 2 reportes de emergencia en la provincia de Huaraz en los últimos 7 días.'],
    });
    expect(
      buildSummary(
        { ...empty, emergencies: [coen(['Áncash']), coen(['Independencia'], '2026-10-30T00:00:00.000Z')] },
        NOW,
      ).level,
    ).toBe('normal');
  });

  it('IGP: M≥4.5 within 50 km in the last 7 days (atención), M≥6 (alerta)', () => {
    expect(buildSummary({ ...empty, earthquakes: [quake(4.8, 23)] }, NOW)).toEqual({
      level: 'atencion',
      reasons: [
        'Sismo de magnitud 4,8 a 23 km del distrito (5 km al S de Carhuaz, Carhuaz - Áncash) el jue 5/11, 07:00.',
      ],
    });
    expect(buildSummary({ ...empty, earthquakes: [quake(6.1, 40)] }, NOW).level).toBe('alerta');
    expect(
      buildSummary(
        { ...empty, earthquakes: [quake(4.4, 10), quake(5, 60), quake(5, 10, '2026-10-20T00:00:00.000Z')] },
        NOW,
      ).level,
    ).toBe('normal');
  });

  it('takes the worst level and lists reasons most severe first', () => {
    const elNino = {
      enfenStatus: 'Alerta de El Niño Costero',
      enfenLevel: 'alerta' as const,
      communiques: [],
      oni: [],
    };
    const s = buildSummary(
      { ...empty, elNino, earthquakes: [quake(4.8, 23)], forecast: forecast([45, 0, 0]) },
      NOW,
    );
    expect(s.level).toBe('emergencia');
    expect(s.reasons.map((r) => r.split(' ')[0])).toEqual(['Se', 'ENFEN', 'Sismo']);
  });
});
