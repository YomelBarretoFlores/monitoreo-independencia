// ENFEN (Comisión Multisectorial para el Estudio Nacional del Fenómeno El Niño): latest official
// communiqués from its WordPress API. The alert status is stated in communiqué titles ("… Estado de
// sistema de alerta: Alerta de El Niño Costero"); not every communiqué repeats it, so the newest title
// that states it is used. The home page shows the same titles.
import type { ElNino, Level } from '../../shared/types.ts';
import { fetchJson } from '../fetch.ts';
import { decodeEntities, fromLima } from '../util.ts';
import type { Collector } from './types.ts';

const POSTS = 'https://enfen.imarpe.gob.pe/wp-json/wp/v2/posts?per_page=20&_fields=date,title,link';

interface WpPost {
  date: string; // site local time (Lima), no offset
  link: string;
  title: { rendered: string };
}

export interface EnfenData {
  status: string | null;
  level: Level;
  communiques: ElNino['communiques'];
}

/**
 * Status → level, for a district hit by rain when El Niño is active:
 * "No activo" normal · "Vigilancia …" atención · "Alerta de El Niño …" alerta ·
 * any other alert (e.g. La Niña Costera) atención.
 */
export function enfenLevel(status: string | null): Level {
  if (!status) return 'normal';
  const s = status.toLowerCase();
  if (s.includes('no activo')) return 'normal';
  if (s.includes('vigilancia')) return 'atencion';
  if (/alerta de el ni[ñn]o/.test(s)) return 'alerta';
  return 'atencion';
}

const clean = (t: string) => decodeEntities(t).replace(/\s+/g, ' ').trim();

export function parseEnfen(posts: WpPost[]): EnfenData {
  const items = posts.map((p) => ({ title: clean(p.title.rendered), date: fromLima(p.date), url: p.link }));
  let status: string | null = null;
  for (const it of items) {
    const m = /estado del? sistema de alerta\s*:\s*(.+)$/i.exec(it.title);
    if (m) {
      status = m[1]!.trim();
      break;
    }
  }
  return { status, level: enfenLevel(status), communiques: items.slice(0, 5) };
}

export const enfen: Collector<EnfenData> = {
  key: 'enfen',
  info: {
    id: 'enfen',
    name: 'ENFEN – Fenómeno El Niño',
    url: 'https://enfen.imarpe.gob.pe/',
    everyMinutes: 360,
  },
  everyMinutes: 360,
  async fetch() {
    return parseEnfen(await fetchJson<WpPost[]>(POSTS));
  },
  count: (d) => d.communiques.length,
};
