// Polite HTTP: one descriptive User-Agent, a 20 s timeout, and plain-Spanish errors for the UI.

export const USER_AGENT = 'MonitoreoIndependencia/0.1 (monitoreo de datos publicos, Independencia - Huaraz)';
export const TIMEOUT_MS = 20_000;

/** Error whose message is already plain Spanish, ready for SourceMeta.error */
export class SourceError extends Error {}

export interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      body: opts.body,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-PE,es;q=0.9', ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (e) {
    throw new SourceError(describeError(e));
  }
  if (!res.ok) throw new SourceError(`La fuente respondió con error ${res.status}.`);
  return res.text();
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError('La fuente respondió algo que no se pudo leer (no es JSON).');
  }
}

/** Plain-Spanish description of any error thrown while collecting */
export function describeError(e: unknown): string {
  if (e instanceof SourceError) return e.message;
  if (e instanceof Error) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError')
      return 'La fuente no respondió a tiempo (20 s).';
    const cause = (e as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN')
      return 'No se encontró el servidor de la fuente (sin conexión o DNS).';
    if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ECONNRESET')
      return 'El servidor de la fuente rechazó o cortó la conexión.';
    return `No se pudo leer la fuente: ${e.message}`;
  }
  return 'No se pudo leer la fuente.';
}
