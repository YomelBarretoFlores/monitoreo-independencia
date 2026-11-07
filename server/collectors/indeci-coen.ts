// INDECI – COEN emergency reports (RSS). The feed only holds the last ~15 national reports, so the
// snapshot keeps a rolling history: items about Áncash are merged by URL and kept for 60 days.
import type { FeedItem } from '../../shared/types.ts';
import { fetchText } from '../fetch.ts';
import { parseRssItems } from '../rss.ts';
import { normalize } from '../util.ts';
import type { Collector } from './types.ts';

const FEED = 'https://portal.indeci.gob.pe/emergencias/feed/';
const KEEP_DAYS = 60;

/** Tags in order of closeness to the district */
export function placeTags(text: string): string[] {
  const t = normalize(text);
  const tags: string[] = [];
  if (/\bINDEPENDENCIA\b/.test(t)) tags.push('Independencia');
  if (/\bHUARAZ\b/.test(t)) tags.push('Huaraz');
  if (/\bANCASH\b/.test(t)) tags.push('Áncash');
  return tags;
}

export function parseCoen(xml: string): FeedItem[] {
  return parseRssItems(xml).flatMap((it) => {
    const tags = placeTags(it.title + ' ' + it.description);
    // the feed is national: keep only what is about Áncash
    if (!tags.includes('Áncash')) return [];
    return [{ title: it.title, date: it.date, url: it.link, source: 'INDECI – COEN', tags }];
  });
}

export function mergeHistory(prev: FeedItem[] | null, fresh: FeedItem[], now: Date): FeedItem[] {
  const byUrl = new Map<string, FeedItem>();
  for (const it of prev ?? []) byUrl.set(it.url, it);
  for (const it of fresh) byUrl.set(it.url, it); // the fresh version wins
  const since = now.getTime() - KEEP_DAYS * 86400_000;
  return [...byUrl.values()]
    .filter((i) => Date.parse(i.date) >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const indeciCoen: Collector<FeedItem[]> = {
  key: 'indeci-coen',
  info: {
    id: 'indeci-coen',
    name: 'INDECI – Reportes de emergencia (COEN)',
    url: 'https://portal.indeci.gob.pe/emergencias/',
    everyMinutes: 30,
  },
  everyMinutes: 30,
  async fetch(prev) {
    return mergeHistory(prev, parseCoen(await fetchText(FEED)), new Date());
  },
  count: (d) => d.length,
};
