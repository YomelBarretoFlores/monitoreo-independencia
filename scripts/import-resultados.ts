// Imports Independencia's data from the resultados-ancash system (S4):
//   obras.json      → data/inversiones.json (Management: MEF investments + SEACE processes)
//   resultados.json → data/elecciones.json  (Elections: ONPE regional governor results)
//
// Usage: node scripts/import-resultados.ts [dir-with-obras-and-resultados]
//        node scripts/import-resultados.ts --obras <obras.json> --resultados <resultados.json>
// Default dir: ../resultados-ancash/src/data (sibling repository).
//
// obras.json is compact: numeric codes in prov, dist, ent, etapa… point into obras.dict (see
// resultados-ancash src/obras/app.ts). Independencia is selected by code (prov = HUARAZ, dist =
// INDEPENDENCIA), not by name matching. In resultados.json Independencia is ONPE ubigeo 020102.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Elections, Investment, Management, Procurement } from '../shared/types.ts';

export interface RawInvestment {
  cui: string;
  nom: string;
  ent: number;
  prov: number;
  dist?: number;
  etapa: number;
  costo?: number;
  devAcum?: number;
  afis?: number;
  afin?: number;
  ult?: string; // YYYYMM of the last accrued spending
}
export interface RawProcess {
  ocid: string;
  cui: string;
  entidad: string;
  obj: string;
  metodo: string;
  vref: number;
  fpub: string;
  mcontrato: number;
}
export interface RawObras {
  generado: string;
  dict: { prov: string[]; dist: string[]; ent: string[]; etapa: string[] };
  inversiones: RawInvestment[];
  procesos: RawProcess[];
}
export interface RawResultados {
  fecha: string;
  parties: Record<string, string>;
  rows: unknown[][];
}

export const ONPE_UBIGEO = '020102';
const BLANK_NULL = new Set(['80', '81']);
const STALLED = new Set(['Paralizada', 'Sin avance >12 meses']);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const positive = (n: number | undefined) => (typeof n === 'number' && n > 0 ? n : null);

/** MEF investment tracking sheet (SSI), the public form already used by resultados-ancash */
const mefUrl = (cui: string) =>
  `https://ofi5.mef.gob.pe/ssi/Ssi/Index?codigo=${encodeURIComponent(cui)}&tipo=2`;
/** OECE open contracting portal (OCDS) */
const ocdsUrl = (ocid: string) =>
  `https://contratacionesabiertas.oece.gob.pe/proceso/${encodeURIComponent(ocid)}`;

function code(list: string[], name: string): number {
  const i = list.indexOf(name);
  if (i < 0) throw new Error(`obras.json: "${name}" no está en el diccionario`);
  return i;
}

export function buildManagement(o: RawObras): Management {
  const prov = code(o.dict.prov, 'HUARAZ');
  const dist = code(o.dict.dist, 'INDEPENDENCIA');
  const raw = o.inversiones.filter((x) => x.prov === prov && x.dist === dist);
  const investments: Investment[] = raw
    .map((x) => ({
      cui: x.cui,
      name: clean(x.nom),
      entity: o.dict.ent[x.ent] ?? '',
      status: o.dict.etapa[x.etapa] ?? '',
      costSoles: x.costo ?? null,
      accruedSoles: x.devAcum ?? null,
      progressPct: x.afis ?? x.afin ?? null,
      lastUpdate: x.ult && /^\d{6}$/.test(x.ult) ? `${x.ult.slice(0, 4)}-${x.ult.slice(4)}` : null,
      url: mefUrl(x.cui),
    }))
    .sort((a, b) => (b.costSoles ?? 0) - (a.costSoles ?? 0) || a.cui.localeCompare(b.cui));

  const cuis = new Set(raw.map((x) => x.cui));
  const procurements: Procurement[] = o.procesos
    .filter((p) => {
      if (p.cui && cuis.has(p.cui)) return true;
      if (p.cui && !cuis.has(p.cui) && o.inversiones.some((x) => x.cui === p.cui)) return false; // other district
      const ent = norm(p.entidad);
      const obj = norm(p.obj);
      return (
        ent.includes('MUNICIPALIDAD DISTRITAL DE INDEPENDENCIA') ||
        (/\bINDEPENDENCIA\b/.test(obj) && obj.includes('HUARAZ'))
      );
    })
    .map((p) => ({
      id: p.ocid,
      entity: clean(p.entidad),
      object: clean(p.obj),
      method: p.metodo,
      // contracted amount when signed, otherwise the reference value
      amountSoles: positive(p.mcontrato) ?? positive(p.vref),
      date: p.fpub || null,
      url: ocdsUrl(p.ocid),
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));

  return {
    investments,
    procurements,
    totals: {
      count: investments.length,
      costSoles: investments.reduce((s, i) => s + (i.costSoles ?? 0), 0),
      accruedSoles: investments.reduce((s, i) => s + (i.accruedSoles ?? 0), 0),
      stalled: investments.filter((i) => STALLED.has(i.status)).length,
    },
    asOf: o.generado || null,
  };
}

export function buildElections(r: RawResultados, ubigeo = ONPE_UBIGEO): Elections {
  const row = r.rows.find((x) => x[0] === ubigeo);
  if (!row) throw new Error(`resultados.json no tiene la fila ${ubigeo} (Independencia)`);
  const [, , , , actasPct, , , turnoutPct, emitted, valid, votes] = row as [
    string,
    string,
    number,
    string,
    number,
    number,
    number,
    number,
    number,
    number,
    [number, number][],
  ];
  const parties = votes
    .filter(([code]) => !BLANK_NULL.has(String(code)))
    .map(([code, v]) => ({
      name: r.parties[String(code)] ?? `Partido ${code}`,
      votes: v,
      pct: valid > 0 ? Math.round((v / valid) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.votes - a.votes);
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(r.fecha);
  return {
    title: 'Elecciones Regionales 2026 – Gobernador (Independencia)',
    asOf: m ? new Date(`${m[1]}T${m[2]}:00Z`).toISOString() : null,
    actasPct,
    turnoutPct,
    emitted,
    valid,
    parties,
  };
}

/** Pretty JSON with each array element on its own line (readable diffs for large files) */
export function linesJson(obj: Record<string, unknown>): string {
  const parts = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object')
      return `  ${JSON.stringify(k)}: [\n${v.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${parts.join(',\n')}\n}\n`;
}

function args(argv: string[]) {
  const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
  let dir = resolve(repo, '../resultados-ancash/src/data');
  let obras: string | undefined;
  let resultados: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--obras') obras = argv[++i];
    else if (argv[i] === '--resultados') resultados = argv[++i];
    else dir = resolve(argv[i]!);
  }
  return {
    repo,
    obras: resolve(obras ?? resolve(dir, 'obras.json')),
    resultados: resolve(resultados ?? resolve(dir, 'resultados.json')),
  };
}

function main() {
  const a = args(process.argv.slice(2));
  const management = buildManagement(JSON.parse(readFileSync(a.obras, 'utf8')) as RawObras);
  const res = JSON.parse(readFileSync(a.resultados, 'utf8')) as RawResultados;
  const elections = buildElections(res);
  const row = res.rows.find((x) => x[0] === ONPE_UBIGEO)!;
  const sum = (row[10] as [number, number][])
    .filter(([c]) => !BLANK_NULL.has(String(c)))
    .reduce((s, [, v]) => s + v, 0);
  if (sum !== elections.valid)
    console.warn(
      `Aviso: la suma de votos por partido (${sum}) no coincide con los válidos (${elections.valid}).`,
    );
  writeFileSync(resolve(a.repo, 'data/inversiones.json'), linesJson({ ...management }));
  writeFileSync(resolve(a.repo, 'data/elecciones.json'), JSON.stringify(elections, null, 2) + '\n');
  console.log(
    `data/inversiones.json: ${management.totals.count} inversiones (${management.totals.stalled} paralizadas o sin avance), ${management.procurements.length} procesos SEACE`,
  );
  console.log(`data/elecciones.json: ${elections.parties.length} partidos, ${elections.valid} votos válidos`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
