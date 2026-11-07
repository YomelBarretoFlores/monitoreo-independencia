// HTTP handler: the JSON API and the compiled UI (dist/) with SPA fallback to index.html.
// Only Node built-ins. Static files are read once and kept in memory with their gzip version.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Collector } from './collectors/types.ts';
import { type Db, loadSnapshots } from './db.ts';
import { assemblePanel } from './panel.ts';
import type { StaticData } from './static-data.ts';

export interface AppOptions {
  db: Db;
  collectors: Collector[];
  staticData: StaticData;
  /** Folder with the built UI; without it only the API answers (dev: Vite proxies /api) */
  dist?: string;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.geojson', '.txt', '.webmanifest']);

/** Whether the client accepts an encoding (ignoring q=0) */
function accepts(req: IncomingMessage, enc: string): boolean {
  return String(req.headers['accept-encoding'] ?? '')
    .split(',')
    .some((part) => {
      const [name, ...params] = part.split(';').map((x) => x.trim().toLowerCase());
      const q = params.find((x) => x.startsWith('q='));
      return name === enc && (!q || Number(q.slice(2)) > 0);
    });
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
  cache = 'no-store',
) {
  const raw = Buffer.from(JSON.stringify(body));
  const gz = raw.length > 1024 && accepts(req, 'gzip');
  const out = gz ? gzipSync(raw) : raw;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
    Vary: 'Accept-Encoding',
    'Content-Length': String(out.length),
    ...(gz ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : out);
}

interface CachedFile {
  raw: Buffer;
  gz?: Buffer;
  br?: Buffer;
  etag: string;
}

export function createHandler({ db, collectors, staticData, dist }: AppOptions) {
  const root = dist && existsSync(dist) ? resolve(dist) : undefined;
  const cache = new Map<string, CachedFile>();

  const load = (file: string): CachedFile => {
    let f = cache.get(file);
    if (f) return f;
    const raw = readFileSync(file);
    f = { raw, etag: createHash('sha1').update(raw).digest('base64url').slice(0, 20) };
    if (COMPRESSIBLE.has(extname(file)) && raw.length > 1024) {
      // a build may leave .br/.gz next to each file; otherwise gzip here (fast enough, done once)
      f.br = existsSync(file + '.br') ? readFileSync(file + '.br') : undefined;
      f.gz = existsSync(file + '.gz') ? readFileSync(file + '.gz') : gzipSync(raw);
    }
    cache.set(file, f);
    return f;
  };

  /** File inside dist/ for a URL path, or null (never outside dist/) */
  const locate = (path: string): string | null => {
    if (!root) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return null; // malformed %-escape
    }
    const abs = normalize(join(root, decoded));
    if (abs !== root && !abs.startsWith(root + sep)) return null;
    if (!existsSync(abs)) return null;
    if (statSync(abs).isDirectory()) {
      const idx = join(abs, 'index.html');
      return existsSync(idx) ? idx : null;
    }
    return /\.(br|gz)$/.test(abs) ? null : abs;
  };

  const serveFile = (req: IncomingMessage, res: ServerResponse, file: string, path: string) => {
    const f = load(file);
    const enc = f.br && accepts(req, 'br') ? 'br' : f.gz && accepts(req, 'gzip') ? 'gzip' : '';
    const body = enc === 'br' ? f.br! : enc === 'gzip' ? f.gz! : f.raw;
    const etag = `"${f.etag}${enc ? '-' + enc : ''}"`;
    const common = {
      ...SECURITY_HEADERS,
      // hashed build assets never change; pages are revalidated on each visit
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      Vary: 'Accept-Encoding',
      ETag: etag,
    };
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
      res.writeHead(304, common);
      return res.end();
    }
    res.writeHead(200, {
      ...common,
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': String(body.length),
      ...(enc ? { 'Content-Encoding': enc } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;
      const method = req.method ?? 'GET';

      if (path.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD')
          return sendJson(req, res, 405, { error: 'Método no permitido.' });
        if (path === '/api/panel') {
          const panel = assemblePanel(await loadSnapshots(db), staticData, collectors);
          return sendJson(req, res, 200, panel, 'no-cache');
        }
        if (path === '/api/health') {
          const panel = assemblePanel(await loadSnapshots(db), staticData, collectors);
          return sendJson(req, res, 200, {
            ok: true,
            generatedAt: panel.generatedAt,
            sources: panel.sources,
          });
        }
        return sendJson(req, res, 404, { error: 'No existe esta ruta de la API.' });
      }

      if (method !== 'GET' && method !== 'HEAD')
        return sendJson(req, res, 405, { error: 'Método no permitido.' });
      const file = locate(path);
      if (file) return serveFile(req, res, file, path);
      // SPA fallback: app routes (no file extension) get index.html; missing assets are a real 404
      const index = locate('/index.html');
      if (index && !extname(path)) return serveFile(req, res, index, '/index.html');
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(root ? 'No existe esta página.' : 'La interfaz no está compilada (npm run build).');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) sendJson(req, res, 500, { error: 'Error del servidor.' });
      else res.end();
    }
  };
}
