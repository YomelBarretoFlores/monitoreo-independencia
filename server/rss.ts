// Minimal RSS 2.0 reader on fast-xml-parser.
import { XMLParser } from 'fast-xml-parser';
import { asArray, stripTags, xmlText } from './util.ts';

export interface RssItem {
  title: string;
  link: string;
  date: string; // ISO
  description: string; // plain text
  categories: string[];
  /** <source> of Google News items (the outlet) */
  source: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  htmlEntities: true,
  // keep strings as strings: titles like "2026" must not turn into numbers
  parseTagValue: false,
  isArray: (name) => name === 'item' || name === 'category',
});

export function parseRssItems(xml: string): RssItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: Record<string, unknown>[] } } };
  const items = asArray(doc.rss?.channel?.item);
  return items.flatMap((it) => {
    const date = Date.parse(xmlText(it.pubDate));
    const title = stripTags(xmlText(it.title));
    const link = xmlText(it.link).trim();
    if (!title || !link || Number.isNaN(date)) return [];
    return [
      {
        title,
        link,
        date: new Date(date).toISOString(),
        description: stripTags(xmlText(it.description)),
        categories: asArray(it.category as unknown[]).map((c) => stripTags(xmlText(c))),
        source: it.source ? stripTags(xmlText(it.source)) || null : null,
      },
    ];
  });
}
