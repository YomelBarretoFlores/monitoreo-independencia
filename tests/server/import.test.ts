// S4: transform of resultados-ancash data (obras.json, resultados.json) into Management and Elections.
import { describe, expect, it } from 'vitest';
import {
  buildElections,
  buildManagement,
  linesJson,
  type RawObras,
} from '../../scripts/import-resultados.ts';

const obras: RawObras = {
  generado: '2026-10-12',
  dict: {
    prov: ['CARHUAZ', 'HUARAZ'],
    dist: ['HUARAZ', 'INDEPENDENCIA'],
    ent: ['MUNICIPALIDAD DISTRITAL DE INDEPENDENCIA - ANCASH', 'REGION ANCASH SEDE CENTRAL'],
    etapa: ['En ejecución', 'Paralizada', 'Sin avance >12 meses', 'En preinversión'],
  },
  inversiones: [
    {
      cui: '1',
      nom: 'PISTAS EN SHANCAYAN',
      ent: 0,
      prov: 1,
      dist: 1,
      etapa: 0,
      costo: 1000,
      devAcum: 400,
      afis: 35.5,
      ult: '202609',
    },
    {
      cui: '2',
      nom: 'DEFENSA RIBEREÑA QUILLCAY',
      ent: 1,
      prov: 1,
      dist: 1,
      etapa: 1,
      costo: 5000,
      devAcum: 4500,
      afin: 90,
    },
    { cui: '3', nom: 'LOSA EN CENTENARIO', ent: 0, prov: 1, dist: 1, etapa: 2, costo: 300 },
    { cui: '4', nom: 'OBRA EN HUARAZ CERCADO', ent: 1, prov: 1, dist: 0, etapa: 0, costo: 9999 },
    // same district code under another province: not Independencia (Huaraz)
    { cui: '5', nom: 'OBRA EN OTRA PROVINCIA', ent: 1, prov: 0, dist: 1, etapa: 3, costo: 7777 },
    { cui: '6', nom: 'IDEA SIN COSTO', ent: 0, prov: 1, dist: 1, etapa: 3 },
  ],
  procesos: [
    {
      ocid: 'ocds-a',
      cui: '2',
      entidad: 'GOBIERNO REGIONAL DE ANCASH',
      obj: 'OBRA  DEFENSA\nRIBEREÑA',
      metodo: 'Licitación Pública',
      vref: 4800,
      fpub: '2026-03-01',
      mcontrato: 4700,
    },
    {
      ocid: 'ocds-b',
      cui: '',
      entidad: 'MUNICIPALIDAD DISTRITAL DE INDEPENDENCIA',
      obj: 'PARQUE',
      metodo: 'Licitación Pública Abreviada',
      vref: 0,
      fpub: '2026-05-01',
      mcontrato: 0,
    },
    {
      ocid: 'ocds-c',
      cui: '',
      entidad: 'MUNICIPALIDAD PROVINCIAL DE HUARAZ',
      obj: 'VEREDAS EN EL DISTRITO DE INDEPENDENCIA, PROVINCIA DE HUARAZ',
      metodo: 'Adjudicación Simplificada',
      vref: 100,
      fpub: '2026-01-01',
      mcontrato: 0,
    },
    {
      ocid: 'ocds-d',
      cui: '4',
      entidad: 'GOBIERNO REGIONAL DE ANCASH',
      obj: 'OBRA EN HUARAZ',
      metodo: 'Licitación Pública',
      vref: 1,
      fpub: '2026-02-01',
      mcontrato: 0,
    },
  ],
};

describe('buildManagement', () => {
  const m = buildManagement(obras);

  it('keeps only investments coded in Huaraz / Independencia, biggest first', () => {
    expect(m.investments.map((i) => i.cui)).toEqual(['2', '1', '3', '6']);
    expect(m.investments[1]).toEqual({
      cui: '1',
      name: 'PISTAS EN SHANCAYAN',
      entity: 'MUNICIPALIDAD DISTRITAL DE INDEPENDENCIA - ANCASH',
      status: 'En ejecución',
      costSoles: 1000,
      accruedSoles: 400,
      progressPct: 35.5,
      lastUpdate: '2026-09',
      url: 'https://ofi5.mef.gob.pe/ssi/Ssi/Index?codigo=1&tipo=2',
    });
    expect(m.investments[0]!.progressPct).toBe(90); // financial progress when there is no physical one
    expect(m.investments[3]).toMatchObject({
      costSoles: null,
      accruedSoles: null,
      progressPct: null,
      lastUpdate: null,
    });
  });

  it('totals over the district investments; stalled = paralizada or sin avance', () => {
    expect(m.totals).toEqual({ count: 4, costSoles: 6300, accruedSoles: 4900, stalled: 2 });
    expect(m.asOf).toBe('2026-10-12');
  });

  it('keeps SEACE processes linked by CUI, by the district municipality, or naming the district', () => {
    expect(m.procurements.map((p) => p.id)).toEqual(['ocds-b', 'ocds-a', 'ocds-c']);
    expect(m.procurements[1]).toEqual({
      id: 'ocds-a',
      entity: 'GOBIERNO REGIONAL DE ANCASH',
      object: 'OBRA DEFENSA RIBEREÑA',
      method: 'Licitación Pública',
      amountSoles: 4700,
      date: '2026-03-01',
      url: 'https://contratacionesabiertas.oece.gob.pe/proceso/ocds-a',
    });
    expect(m.procurements[0]!.amountSoles).toBeNull();
    expect(m.procurements[2]!.amountSoles).toBe(100);
  });
});

describe('buildElections', () => {
  const res = {
    fecha: '2026-10-14 03:55 UTC',
    parties: {
      '80': 'VOTOS EN BLANCO',
      '81': 'VOTOS NULOS',
      '95': 'ALIANZA PARA EL PROGRESO',
      '105': 'PARTIDO DEMÓCRATA VERDE',
    },
    rows: [
      ['020100', 'HUARAZ', 2, '020000', 99, 1, 1, 78, 1, 1, [[95, 1]]],
      [
        '020102',
        'INDEPENDENCIA',
        3,
        '020100',
        99.462,
        185,
        186,
        78.139,
        1000,
        800,
        [
          [105, 500],
          [80, 120],
          [95, 300],
          [81, 80],
        ],
      ],
    ] as unknown[][],
  };

  it('reads the ONPE row 020102 with percentages over valid votes', () => {
    expect(buildElections(res)).toEqual({
      title: 'Elecciones Regionales 2026 – Gobernador (Independencia)',
      asOf: '2026-10-14T03:55:00.000Z',
      actasPct: 99.462,
      turnoutPct: 78.139,
      emitted: 1000,
      valid: 800,
      parties: [
        { name: 'PARTIDO DEMÓCRATA VERDE', votes: 500, pct: 62.5 },
        { name: 'ALIANZA PARA EL PROGRESO', votes: 300, pct: 37.5 },
      ],
    });
  });

  it('fails clearly when the district row is missing', () => {
    expect(() => buildElections({ ...res, rows: [] })).toThrow(/020102/);
  });
});

describe('linesJson', () => {
  it('writes one array record per line so diffs stay readable', () => {
    const text = linesJson({ a: 1, list: [{ x: 1 }, { x: 2 }] });
    expect(text).toBe('{\n  "a": 1,\n  "list": [\n    {"x":1},\n    {"x":2}\n  ]\n}\n');
    expect(JSON.parse(text)).toEqual({ a: 1, list: [{ x: 1 }, { x: 2 }] });
  });
});
