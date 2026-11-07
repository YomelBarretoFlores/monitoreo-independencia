// El Peruano (official gazette): legal norms about Huaraz, Palcacocha or the district, and emergency
// declarations covering Áncash. The search API only accepts `query=` (full-text, loosely matched),
// so results are filtered again on their summary (sumilla).
import type { FeedItem } from '../../shared/types.ts';
import { fetchJson } from '../fetch.ts';
import { fromLima, normalize, sentenceCase } from '../util.ts';
import type { Collector } from './types.ts';

const MAX_ITEMS = 40;
export const QUERIES = ['Independencia Huaraz', 'Huaraz', 'Palcacocha', 'Áncash estado de emergencia'];
const api = (q: string) =>
  `https://busquedas.elperuano.pe/api/v1/normas?${new URLSearchParams({ query: q })}`;

interface NormaHit {
  op: string;
  fechaPublicacion: string; // YYYYMMDD
  sumilla: string | null;
  tipoDispositivo: string | null;
  tipoPublicacion?: string | null;
}
interface NormasResponse {
  hits?: NormaHit[];
}

export function tagNorma(sumilla: string): string[] | null {
  const t = normalize(sumilla);
  const huarazOrAncash = /\bHUARAZ\b|\bANCASH\b/.test(t);
  const tags: string[] = [];
  if (/\bINDEPENDENCIA\b/.test(t) && huarazOrAncash) tags.push('Independencia');
  if (/\bHUARAZ\b/.test(t)) tags.push('Huaraz');
  if (/\bPALCACOCHA\b/.test(t)) tags.push('Palcacocha');
  if (/\bQUILLCAY/.test(t)) tags.push('Quillcay');
  if (/\bANCASH\b/.test(t)) tags.push('Áncash');
  const emergency = /EMERGENCIA|PELIGRO INMINENTE/.test(t);
  if (emergency) tags.push('emergencia');
  const local = tags.some((x) => ['Independencia', 'Huaraz', 'Palcacocha', 'Quillcay'].includes(x));
  // Áncash alone only matters for emergency declarations (they list the districts inside the norm)
  return local || (tags.includes('Áncash') && emergency) ? tags : null;
}

export function parseNormas(responses: NormasResponse[]): FeedItem[] {
  const byOp = new Map<string, FeedItem>();
  for (const r of responses)
    for (const h of r.hits ?? []) {
      const sumilla = (h.sumilla ?? '').replace(/\s+/g, ' ').trim();
      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(h.fechaPublicacion ?? '');
      if (!h.op || !m || sumilla.length < 10 || byOp.has(h.op)) continue;
      const tags = tagNorma(sumilla);
      if (!tags) continue;
      byOp.set(h.op, {
        title: sumilla,
        date: fromLima(`${m[1]}-${m[2]}-${m[3]}`),
        url: `https://busquedas.elperuano.pe/dispositivo/${encodeURIComponent(h.tipoPublicacion || 'NL')}/${encodeURIComponent(h.op)}`,
        source: 'El Peruano',
        ...(h.tipoDispositivo ? { summary: sentenceCase(h.tipoDispositivo) } : {}),
        tags,
      });
    }
  return [...byOp.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ITEMS);
}

export const elPeruano: Collector<FeedItem[]> = {
  key: 'el-peruano',
  info: {
    id: 'el-peruano',
    name: 'El Peruano – Normas legales',
    url: 'https://busquedas.elperuano.pe/',
    everyMinutes: 720,
  },
  everyMinutes: 720,
  async fetch() {
    const responses: NormasResponse[] = [];
    for (const q of QUERIES) responses.push(await fetchJson<NormasResponse>(api(q)));
    return parseNormas(responses);
  },
  count: (d) => d.length,
};
