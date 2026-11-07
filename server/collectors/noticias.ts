// News about the district: Google News RSS searches plus two local Áncash outlets, filtered by
// keywords, deduplicated by title and sorted newest first.
import type { FeedItem } from '../../shared/types.ts';
import { fetchText } from '../fetch.ts';
import { parseRssItems } from '../rss.ts';
import { normalize } from '../util.ts';
import type { Collector } from './types.ts';

const MAX_ITEMS = 60;
const MAX_AGE_DAYS = 120;

const googleNews = (q: string) =>
  `https://news.google.com/rss/search?${new URLSearchParams({ q, hl: 'es-419', gl: 'PE', ceid: 'PE:es-419' })}`;

export const NEWS_FEEDS: { url: string; source: string | null; local: boolean }[] = [
  { url: googleNews('"Independencia" Huaraz'), source: null, local: false },
  { url: googleNews('Palcacocha'), source: null, local: false },
  { url: googleNews('Huaraz lluvias OR huaico'), source: null, local: false },
  { url: googleNews('"Municipalidad de Independencia" Huaraz'), source: null, local: false },
  { url: 'https://huaraznoticias.com/feed/', source: 'Huaraz Noticias', local: true },
  { url: 'https://ancashnoticias.com/feed/', source: 'Áncash Noticias', local: true },
];

/** Candidate before filtering: also carries the text used for matching and whether the outlet is local */
export interface NewsCandidate extends FeedItem {
  /** Title + description */
  matchText?: string;
  /** Feed categories: outlets use them as sections ("Huaraz" for any regional story), so they only
   *  count for topics, never for places */
  categories?: string[];
  local?: boolean;
}

/** Place keyword → tag (matched on title and description only), in the order tags are listed */
const PLACES: [string, RegExp][] = [
  ['Independencia', /\bINDEPENDENCIA\b/],
  ['Huaraz', /\bHUARAZ\b/],
  ['Palcacocha', /\bPALCACOCHA\b/],
  ['Quillcay', /\bQUILLCAY/],
  ['Cojup', /\bCOJUP\b/],
  ['Llaca', /\bLLACA\b/],
];
/** Topic keyword → tag (also matched on categories) */
const TOPICS: [string, RegExp][] = [
  ['huaico', /\bHUA[IY]COS?\b/],
  ['lluvia', /\bLLUVIA/],
  ['El Niño', /\bEL NINO\b|\bNINO COSTERO\b|\bFEN\b/],
];
const LOCAL_CONTEXT = /\bHUARAZ\b|\bANCASH\b|\bCALLEJON DE HUAYLAS\b/;
/** Other districts called Independencia: Lima (Lima Norte) and Pisco (Ica) */
const OTHER_INDEPENDENCIA =
  /\bLIMA\b|LIMA NORTE|TAHUANTINSUYO|ERMITANO|\bPAYET\b|\bCOMAS\b|LOS OLIVOS|SAN MARTIN DE PORRES|\bPISCO\b|\bICA\b/;

export function parseRss(xml: string, source?: string, local = source !== undefined): NewsCandidate[] {
  return parseRssItems(xml).map((it) => {
    const outlet = source ?? it.source ?? 'Google Noticias';
    // Google News titles end with " - Outlet"
    const title =
      !source && it.source && it.title.endsWith(' - ' + it.source)
        ? it.title.slice(0, -(it.source.length + 3))
        : it.title;
    const summary =
      it.description && it.description !== it.title && !it.description.startsWith(title)
        ? it.description.slice(0, 300)
        : undefined;
    return {
      title,
      date: it.date,
      url: it.link,
      source: outlet,
      ...(summary ? { summary } : {}),
      tags: [],
      matchText: `${title} ${it.description}`,
      categories: it.categories,
      local,
    };
  });
}

const titleKey = (t: string) => normalize(t).replace(/[^A-Z0-9]/g, '');

export function tagNews(c: NewsCandidate): string[] | null {
  const t = normalize(c.matchText ?? `${c.title} ${c.summary ?? ''}`);
  const withCategories = normalize(`${t} ${(c.categories ?? []).join(' ')}`);
  let tags = [
    ...PLACES.filter(([, re]) => re.test(t)).map(([tag]) => tag),
    ...TOPICS.filter(([, re]) => re.test(withCategories)).map(([tag]) => tag),
  ];
  if (tags.includes('Independencia') && !LOCAL_CONTEXT.test(t)) {
    // clearly another Independencia: drop the item
    if (OTHER_INDEPENDENCIA.test(t)) return null;
    // "independencia" as a common word in a national outlet: not about the district
    if (!c.local) tags = tags.filter((x) => x !== 'Independencia');
  }
  return tags.length ? tags : null;
}

export function filterNews(items: NewsCandidate[], now: Date): FeedItem[] {
  const since = now.getTime() - MAX_AGE_DAYS * 86400_000;
  const seen = new Set<string>();
  return items
    .flatMap((c) => {
      const tags = tagNews(c);
      if (!tags || Date.parse(c.date) < since || Date.parse(c.date) > now.getTime() + 86400_000) return [];
      const { matchText: _m, categories: _c, local: _l, ...item } = c;
      return [{ ...item, tags }];
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((it) => {
      const k = titleKey(it.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_ITEMS);
}

export const noticias: Collector<FeedItem[]> = {
  key: 'noticias',
  info: {
    id: 'noticias',
    name: 'Noticias – Google Noticias, Huaraz Noticias y Áncash Noticias',
    url: googleNews('"Independencia" Huaraz').replace('/rss/search', '/search'),
    everyMinutes: 30,
  },
  everyMinutes: 30,
  async fetch() {
    const all: NewsCandidate[] = [];
    const failed: string[] = [];
    for (const f of NEWS_FEEDS) {
      try {
        all.push(...parseRss(await fetchText(f.url), f.source ?? undefined, f.local));
      } catch (e) {
        failed.push(f.source ?? new URL(f.url).searchParams.get('q') ?? f.url);
        console.warn(`noticias: falló ${f.url}: ${(e as Error).message}`);
      }
    }
    if (failed.length === NEWS_FEEDS.length)
      throw new Error('No respondió ninguna de las fuentes de noticias.');
    return filterNews(all, new Date());
  },
  count: (d) => d.length,
};
