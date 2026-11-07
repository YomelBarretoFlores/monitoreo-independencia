// Parsers of every live source, run on small real samples saved in fixtures/ (no network).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCenepred } from '../../server/collectors/cenepred.ts';
import { parseNormas } from '../../server/collectors/el-peruano.ts';
import { enfenLevel, parseEnfen } from '../../server/collectors/enfen.ts';
import { parseRivers, RIVER_POINTS, riverLevel } from '../../server/collectors/glofas.ts';
import { parseQuakes } from '../../server/collectors/igp-sismos.ts';
import { mergeHistory, parseCoen } from '../../server/collectors/indeci-coen.ts';
import { LAKES, parseLakes } from '../../server/collectors/lakes.ts';
import { parseOni } from '../../server/collectors/noaa-oni.ts';
import { filterNews, parseRss } from '../../server/collectors/noticias.ts';
import { parseForecast } from '../../server/collectors/open-meteo.ts';
import {
  activeListed,
  buildWarnings,
  parseFeatureInfo,
  parseWarningList,
} from '../../server/collectors/senamhi-avisos.ts';
import type { FeedItem } from '../../shared/types.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const fxJson = (name: string) => JSON.parse(fx(name));
// the fixtures were captured on 2026-11-07 around 16:00 Lima time
const NOW = new Date('2026-11-07T21:00:00Z');

describe('senamhi-avisos', () => {
  const listed = parseWarningList(fx('senamhi-avisos.html'));

  it('reads every row of the warnings table', () => {
    expect(listed).toHaveLength(12);
    expect(listed[0]).toEqual({
      number: 462,
      title: 'Precipitaciones en la costa y sierra',
      startDate: '2026-11-09',
      endDate: '2026-11-11',
      tableLevel: 4,
      url: 'https://www.senamhi.gob.pe/?p=aviso-meteorologico-vigente&a=2026&b=29359&c=00&d=SENA',
      mapCount: 3,
      year: 2026,
    });
  });

  it('keeps only warnings whose validity has not ended (Lima date) and skips cancelled ones', () => {
    const active = activeListed(listed, NOW);
    // 455 is "(AVISO CANCELADO)"; 454 and 452 ended before today
    expect(active.map((w) => w.number)).toEqual([462, 461, 460, 459, 458, 457, 456, 453]);
  });

  it('reads the district coverage from GetFeatureInfo', () => {
    expect(parseFeatureInfo(fxJson('senamhi-gfi.json'))).toEqual([
      { number: 453, map: 4, nivel: 3, start: '2026-11-08T05:00:00.000Z', end: '2026-11-09T04:59:59.000Z' },
    ]);
  });

  it('builds warnings only for those covering the district, with level from the district polygon', () => {
    const coverage = new Map([[453, parseFeatureInfo(fxJson('senamhi-gfi.json'))]]);
    const ws = buildWarnings(listed, coverage, NOW);
    expect(ws).toEqual([
      {
        number: 453,
        title: 'Incremento de temperatura diurna en la costa y sierra (extension del aviso 447)',
        level: 'alerta',
        levelLabel: 'Nivel 3 (naranja)',
        start: '2026-11-08T05:00:00.000Z',
        end: '2026-11-09T04:59:59.000Z',
        url: 'https://www.senamhi.gob.pe/?p=aviso-meteorologico-vigente&a=2026&b=29350&c=00&d=SENA',
      },
    ]);
    // once its validity is over it disappears
    expect(buildWarnings(listed, coverage, new Date('2026-11-09T06:00:00Z'))).toEqual([]);
  });
});

describe('open-meteo', () => {
  const f = parseForecast(fxJson('open-meteo.json'), NOW);

  it('gives past 7 + next 14 days', () => {
    expect(f.point).toEqual([-9.51, -77.53]);
    expect(f.daily).toHaveLength(21);
    expect(f.daily[0]).toEqual({
      date: '2026-10-31',
      precipMm: 0.5,
      precipProbPct: 79,
      tMaxC: expect.any(Number),
      tMinC: expect.any(Number),
    });
  });

  it('gives the next 48 hours of rain starting at the current Lima hour', () => {
    expect(f.hourly).toHaveLength(48);
    expect(f.hourly[0]!.time).toBe('2026-11-07T21:00:00.000Z');
    expect(f.hourly[47]!.time).toBe('2026-11-09T20:00:00.000Z');
  });
});

describe('glofas', () => {
  const rivers = parseRivers(fxJson('glofas.json'), NOW);

  it('builds one modeled series per point, splitting past and forecast at today', () => {
    expect(rivers.map((r) => r.id)).toEqual(RIVER_POINTS.map((p) => p.id));
    const santa = rivers[0]!;
    expect(santa.name).toMatch(/Santa/);
    expect(santa.series).toHaveLength(44);
    expect(santa.series.filter((s) => !s.forecast)).toHaveLength(30);
    expect(santa.series.find((s) => s.forecast)!.date).toBe('2026-11-07');
    expect(santa.referenceM3s).toBeGreaterThan(20);
  });

  it('level compares the 7-day forecast peak with the 30-day mean', () => {
    const past = Array.from({ length: 30 }, (_, i) => ({
      date: `d${i}`,
      dischargeM3s: 10,
      maxM3s: null,
      forecast: false,
    }));
    const fut = (v: number) => [...past, { date: 'f', dischargeM3s: v, maxM3s: null, forecast: true }];
    expect(riverLevel(fut(14), 10)).toBe('normal');
    expect(riverLevel(fut(15), 10)).toBe('atencion');
    expect(riverLevel(fut(20), 10)).toBe('alerta');
    expect(riverLevel(fut(30), 10)).toBe('emergencia');
    expect(riverLevel(fut(30), null)).toBe('normal');
  });
});

describe('lakes', () => {
  it('joins the static facts with the 7-day forecast at each lake', () => {
    const lakes = parseLakes(fxJson('lagunas-open-meteo.json'), LAKES);
    expect(lakes.map((l) => l.id)).toEqual(['palcacocha', 'cuchillacocha', 'tullparaju', 'llaca']);
    expect(lakes[0]!.name).toBe('Laguna Palcacocha');
    expect(lakes[0]!.forecast).toHaveLength(7);
    expect(lakes[0]!.forecast[0]!.date).toBe('2026-11-07');
    expect(lakes.every((l) => l.liveMonitoring === false && l.riskNote.length > 20)).toBe(true);
  });
});

describe('enfen + noaa-oni', () => {
  it('takes the communiqués and the newest alert status found in a title', () => {
    const e = parseEnfen(fxJson('enfen-posts.json'));
    expect(e.status).toBe('Alerta de El Niño Costero');
    expect(e.level).toBe('alerta');
    expect(e.communiques).toHaveLength(5);
    expect(e.communiques[0]).toEqual({
      title: 'COMUNICADO OFICIAL ENFEN N°19- 2026',
      date: '2026-10-30T23:37:02.000Z',
      url: 'https://enfen.imarpe.gob.pe/2026/10/30/comunicado-oficial-enfen-n19-2026/',
    });
  });

  it('maps the status to a level', () => {
    expect(enfenLevel('No activo')).toBe('normal');
    expect(enfenLevel('Vigilancia de El Niño Costero')).toBe('atencion');
    expect(enfenLevel('Alerta de El Niño Costero')).toBe('alerta');
    expect(enfenLevel('Alerta de La Niña Costera')).toBe('atencion');
    expect(enfenLevel(null)).toBe('normal');
  });

  it('reads the last 24 ONI seasons', () => {
    const oni = parseOni(fx('oni.txt'));
    expect(oni).toHaveLength(24);
    expect(oni[23]).toEqual({ season: 'ASO', year: 2026, anomaly: 2.46 });
  });
});

describe('indeci-coen', () => {
  const items = parseCoen(fx('indeci-coen.xml'));

  it('keeps only items about Áncash, with tags', () => {
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toMatch(/^REPORTE COMPLEMENTARIO N\.º 15605 – 7\/11\/2026/);
    expect(items[0]!.date).toBe('2026-11-07T06:07:10.000Z');
    expect(items[0]!.source).toBe('INDECI – COEN');
    expect(items[0]!.tags).toEqual(['Áncash']);
  });

  it('tags Independencia and Huaraz', () => {
    const xml = fx('indeci-coen.xml').replace(
      'SISMO DE MAGNITUD 5.0 CON EPICENTRO EN EL MAR FRENTE HUARMEY – ÁNCASH',
      'LLUVIAS INTENSAS EN EL DISTRITO DE INDEPENDENCIA – HUARAZ – ÁNCASH',
    );
    expect(parseCoen(xml)[0]!.tags).toEqual(['Independencia', 'Huaraz', 'Áncash']);
  });

  it('keeps a rolling 60-day history merged by URL, newest first', () => {
    const old: FeedItem = {
      title: 'viejo',
      date: '2026-08-01T00:00:00.000Z',
      url: 'u-old',
      source: 'x',
      tags: [],
    };
    const kept: FeedItem = {
      title: 'antes',
      date: '2026-10-20T00:00:00.000Z',
      url: 'u-kept',
      source: 'x',
      tags: [],
    };
    const dupe: FeedItem = { ...items[0]!, title: 'versión vieja' };
    const merged = mergeHistory([old, kept, dupe], items, NOW);
    expect(merged.map((i) => i.url)).toEqual([items[0]!.url, 'u-kept']);
    expect(merged[0]!.title).toBe(items[0]!.title);
  });
});

describe('igp-sismos', () => {
  it('keeps quakes within 150 km in the last 90 days, newest first, with distance', () => {
    const qs = parseQuakes(fxJson('igp-sismos.json'), NOW);
    expect(qs.map((q) => q.url.split('/').pop())).toEqual([
      '2026-0753',
      '2026-0733',
      '2026-0680',
      '2026-0606',
      '2026-0591',
      '2026-0571',
    ]);
    expect(qs[2]).toEqual({
      date: '2026-09-21T00:19:56.000Z',
      magnitude: 3.4,
      depthKm: 13,
      point: [-9.33, -77.64],
      reference: '5 km al S de Carhuaz, Carhuaz - Áncash',
      distanceKm: expect.closeTo(23.3, 0),
      url: 'https://ultimosismo.igp.gob.pe/evento/2026-0680',
    });
  });
});

describe('noticias', () => {
  const google = parseRss(fx('noticias-google.xml'));
  const local = parseRss(fx('noticias-huaraznoticias.xml'), 'Huaraz Noticias');

  it('reads Google News items with their outlet and without the outlet suffix', () => {
    expect(google[0]).toMatchObject({
      title:
        'Mall de Huaraz con viabilidad comercial: oferta, gasto y plazos de proyecto frente al Huascarán',
      source: 'Gestión',
      date: '2026-11-02T22:45:05.000Z',
    });
  });

  it('keeps recent items that match a keyword, tagged, deduplicated, newest first', () => {
    const news = filterNews([...google, ...local, ...local], NOW);
    // gob.pe staff pages, items older than 120 days and local items without a keyword (Alex Cordero,
    // UGEL Huari) drop out; the duplicated local feed collapses
    expect(news.map((n) => n.title)).toEqual([
      'Challhua: reciente obra de desagüe ya presenta problemas y provoca inundación',
      'Huaraz: se inundan instalaciones de la DIVINCRI',
      'Huaraz: 40% de las calles tomadas por los informales',
      'Mall de Huaraz con viabilidad comercial: oferta, gasto y plazos de proyecto frente al Huascarán',
    ]);
    expect(news.find((n) => n.title.startsWith('Huaraz: se inundan'))!.tags).toEqual(['Huaraz', 'lluvia']);
    expect(news.some((n) => n.source.includes('gob.pe'))).toBe(false);
  });

  it('feed categories count for topics but not for places', () => {
    const base = { date: '2026-11-06T10:00:00.000Z', source: 'Áncash Noticias', local: true, tags: [] };
    const out = filterNews(
      [
        {
          ...base,
          url: 'a',
          title: 'Violencia en Llamellín',
          matchText: 'Violencia en Llamellín',
          categories: ['Huaraz'],
        },
        {
          ...base,
          url: 'b',
          title: 'Colapsa un buzón en Challhua',
          matchText: 'Colapsa un buzón en Challhua',
          categories: ['Huaraz', 'lluvia'],
        },
      ],
      NOW,
    );
    expect(out.map((n) => [n.url, n.tags])).toEqual([['b', ['lluvia']]]);
  });

  it('drops items about Independencia in Lima', () => {
    const lima: FeedItem = {
      title: 'Robo en Independencia: vecinos de Tahuantinsuyo denuncian',
      date: '2026-11-06T10:00:00.000Z',
      url: 'x',
      source: 'Diario',
      tags: [],
    };
    const ours: FeedItem = {
      ...lima,
      url: 'y',
      title: 'Municipalidad de Independencia limpia quebrada en Huaraz',
    };
    const out = filterNews([lima, ours], NOW);
    expect(out.map((n) => n.url)).toEqual(['y']);
    expect(out[0]!.tags).toEqual(['Independencia', 'Huaraz']);
  });
});

describe('el-peruano', () => {
  it('keeps norms whose summary concerns Huaraz, Palcacocha or Áncash emergencies, with public URLs', () => {
    const items = parseNormas([fxJson('el-peruano.json')]);
    // the Lacramarca expropriation (Santa province, no emergency) and unrelated norms drop out
    expect(items.map((i) => i.url.split('/').pop())).toEqual(['2571017-4', '1547408-1', '833873-1']);
    expect(items[0]).toMatchObject({
      date: '2026-11-03T05:00:00.000Z',
      url: 'https://busquedas.elperuano.pe/dispositivo/NL/2571017-4',
      source: 'El Peruano',
      summary: 'Decreto supremo',
      tags: ['Áncash', 'emergencia'],
    });
    expect(items[2]!.tags).toEqual(['Huaraz', 'Palcacocha', 'Áncash', 'emergencia']);
    // the same norm found by two searches appears once
    expect(parseNormas([fxJson('el-peruano.json'), fxJson('el-peruano.json')])).toHaveLength(3);
  });
});

describe('cenepred', () => {
  it('reads the risk profile and the district figures', () => {
    const c = parseCenepred(fxJson('cenepred-4.json'), fxJson('cenepred-5.json'));
    expect(c.profile).toEqual({
      massMovement: { hazard: 'Alto', risk: 'Medio' },
      flood: { hazard: 'Alto', risk: 'Alto' },
      healthFacilities: 33,
      schools: 181,
      scenario: 'Escenario de riesgo por El Niño 2026-2027 (CENEPRED)',
    });
    expect(c.district).toEqual({ population2017: 76088, households2017: 25147, povertyPct: 11.5 });
  });
});
