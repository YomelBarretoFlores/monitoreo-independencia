// Static datasets committed under data/: imported from resultados-ancash (S4) and the official IGN
// district outline (scripts/build-official-geo.ts).
import { existsSync, readFileSync } from 'node:fs';
import type { Feature } from 'geojson';
import type { Elections, Management, SourceMeta } from '../shared/types.ts';
import type { SourceInfo } from './collectors/types.ts';

export interface StaticData {
  management: Management | null;
  elections: Elections | null;
  boundary: Feature | null;
}

export const STATIC_SOURCES: Record<'inversiones' | 'elecciones', SourceInfo> = {
  inversiones: {
    id: 'inversiones',
    name: 'MEF, INFOBRAS y SEACE – Inversiones y contrataciones (vía Resultados Áncash)',
    url: 'https://ofi5.mef.gob.pe/ssi/',
    everyMinutes: null,
  },
  elecciones: {
    id: 'elecciones',
    name: 'ONPE – Elecciones Regionales 2026',
    url: 'https://resultadoelectoral.onpe.gob.pe/',
    everyMinutes: null,
  },
};

const DATA_DIR = new URL('../data/', import.meta.url);

function readJson<T>(dir: URL, file: string): T | null {
  const url = new URL(file, dir);
  if (!existsSync(url)) return null;
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export function loadStaticData(dir: URL = DATA_DIR): StaticData {
  return {
    management: readJson<Management>(dir, 'inversiones.json'),
    elections: readJson<Elections>(dir, 'elecciones.json'),
    boundary: readJson<Feature>(dir, 'boundary.geojson'),
  };
}

const dateIso = (d: string | null) =>
  d ? new Date(d.length === 10 ? d + 'T00:00:00-05:00' : d).toISOString() : null;

export function staticMeta(which: 'inversiones' | 'elecciones', s: StaticData): SourceMeta {
  const info = STATIC_SOURCES[which];
  const data = which === 'inversiones' ? s.management : s.elections;
  return {
    ...info,
    updatedAt: dateIso(data?.asOf ?? null),
    ok: data !== null,
    ...(data
      ? {}
      : { error: `Falta el archivo data/${which}.json (se genera con scripts/import-resultados.ts).` }),
  };
}
