// Small pure helpers shared by collectors, the summary and the scripts.
import type { District, Level } from '../shared/types.ts';

/** The district this system watches (INEI ubigeo; ONPE uses 020102 for the same district) */
export const DISTRICT_BASE: Pick<District, 'ubigeo' | 'name' | 'province' | 'region' | 'center'> = {
  ubigeo: '020105',
  name: 'Independencia',
  province: 'Huaraz',
  region: 'Áncash',
  center: [-9.51, -77.53],
};
export const CENTER = DISTRICT_BASE.center;

export const LEVEL_ORDER: Level[] = ['normal', 'atencion', 'alerta', 'emergencia'];
export const levelRank = (l: Level) => LEVEL_ORDER.indexOf(l);
export const worstLevel = (levels: Level[]): Level =>
  levels.reduce<Level>((a, b) => (levelRank(b) > levelRank(a) ? b : a), 'normal');

/** Uppercase, no accents: for keyword matching */
export const normalize = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  uuml: 'ü',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  deg: '°',
  ordm: 'º',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
      );
    return NAMED[e] ?? m;
  });
}

/** HTML fragment → plain text on one line */
export const stripTags = (s: string) =>
  decodeEntities(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** "PRECIPITACIONES EN LA SIERRA" → "Precipitaciones en la sierra" (only when the text is all caps) */
export function sentenceCase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase()) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Great-circle distance in km */
export function haversineKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** YYYY-MM-DD of an instant in Lima (UTC−5, no daylight saving) */
export const limaDate = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

/** "YYYY-MM-DDTHH:mm" in Lima of an instant (matches Open-Meteo local hourly times) */
export const limaHour = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 13) + ':00';

/** Local Lima wall-clock date/time string (no offset) → ISO instant */
export const fromLima = (local: string) =>
  new Date((local.length === 10 ? local + 'T00:00:00' : local) + '-05:00').toISOString();

export const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/** fast-xml-parser gives one object for a single child and an array for several */
export const asArray = <T>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

/** Text of an XML node that may carry attributes ({ '#text': … }) */
export function xmlText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return xmlText((v as Record<string, unknown>)['#text']);
  return String(v);
}

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** "dom 8/11, 23:59" in Lima time, for plain-Spanish reasons */
export function shortLimaDateTime(isoInstant: string): string {
  const d = new Date(new Date(isoInstant).getTime() - 5 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}, ${hh}:${mm}`;
}
