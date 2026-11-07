// Pure formatting helpers (no DOM). Numbers follow es-PE (1,234.5) like MEF/INEI portals;
// dates are shown in Lima time (UTC-5, no daylight saving).

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape any value before inserting it into HTML (API text is untrusted). */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Only absolute http(s) links survive; everything else returns null. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const nf = new Map<number, Intl.NumberFormat>();
function numberFormat(digits: number): Intl.NumberFormat {
  let f = nf.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('es-PE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nf.set(digits, f);
  }
  return f;
}

const isNum = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function fmtNum(n: number | null | undefined, digits = 0): string {
  return isNum(n) ? numberFormat(digits).format(n) : '—';
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  return isNum(n) ? `${fmtNum(n, digits)}%` : '—';
}

export function fmtSoles(n: number | null | undefined): string {
  return isNum(n) ? `S/ ${fmtNum(Math.round(n))}` : '—';
}

/** Compact amounts for tiles: "S/ 3,220 millones", "S/ 5.3 millones", "S/ 584 mil". */
export function fmtSolesShort(n: number | null | undefined): string {
  if (!isNum(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `S/ ${fmtNum(n / 1e6, a >= 1e8 ? 0 : 1)} millones`;
  if (a >= 1e3) return `S/ ${fmtNum(n / 1e3)} mil`;
  return `S/ ${fmtNum(n)}`;
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** "3 min", "2 h", "1 día" for a span of at least one minute. */
function span(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 día' : `${d} días`;
}

/** "hace 3 min", "hace 2 h", "hace 5 días"; "nunca" when it never happened. */
export function timeAgo(iso: string | null | undefined, now: number): string {
  const t = parse(iso);
  if (t === null) return 'nunca';
  const s = (now - t) / 1000;
  return s < 60 ? 'hace instantes' : `hace ${span(s)}`;
}

/** "en 30 min", "en 2 días"; "ya" when the instant has passed. */
export function timeUntil(iso: string | null | undefined, now: number): string {
  const t = parse(iso);
  if (t === null) return '—';
  const s = (t - now) / 1000;
  if (s <= 0) return 'ya';
  return s < 60 ? 'en instantes' : `en ${span(s)}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const LIMA_OFFSET_MS = -5 * 3_600_000;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar fields in Lima. A bare "YYYY-MM-DD" is a calendar day and is not shifted. */
function limaDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  if (DAY_ONLY.test(iso)) return new Date(`${iso}T00:00:00Z`);
  const t = parse(iso);
  return t === null ? null : new Date(t + LIMA_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDate(iso: string | null | undefined): string {
  const d = limaDate(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '—';
}

export function fmtDateShort(iso: string | null | undefined): string {
  const d = limaDate(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : '—';
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = limaDate(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '—';
}

export function fmtHour(iso: string | null | undefined): string {
  const d = limaDate(iso);
  return d ? `${pad(d.getUTCHours())}:00` : '—';
}

/** "sáb 7" for chart axes. */
export function fmtDay(iso: string | null | undefined): string {
  const d = limaDate(iso);
  return d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}` : '—';
}

/** Today's calendar day in Lima as YYYY-MM-DD. */
export function limaToday(now: number): string {
  return new Date(now + LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Official datasets (MEF, ONPE) come in ALL CAPS, which is hard to read. Mostly-uppercase
 * text becomes sentence case; words in parentheses or without vowels (MTC, UNASAM) stay.
 */
export function tidyCaps(s: string): string {
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  if (letters.length < 4 || letters.replace(/[^a-záéíóúñü]/g, '').length > letters.length * 0.2) return s;
  const out = s.replace(/\([^)]*\)|[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g, (w) =>
    w.startsWith('(') || (w.length >= 2 && !/[AEIOUÁÉÍÓÚ]/i.test(w)) ? w : w.toLowerCase(),
  );
  return out.replace(/[a-záéíóúñü]/, (c) => c.toUpperCase());
}
