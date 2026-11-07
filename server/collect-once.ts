// npm run collect [-- --out panel.json]
// Runs every collector once against the real network (in memory, no database), prints a status
// table and, with --out, writes the assembled Panel JSON.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLLECTORS } from './collectors/index.ts';
import type { Snapshot } from './db.ts';
import { describeError } from './fetch.ts';
import { assemblePanel } from './panel.ts';
import { loadStaticData } from './static-data.ts';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const out = outIdx >= 0 ? argv[outIdx + 1] : undefined;

const snaps = new Map<string, Snapshot>();
const rows: { id: string; ok: string; items: string; ms: string; error: string }[] = [];

await Promise.all(
  COLLECTORS.map(async (c) => {
    const t0 = Date.now();
    const at = new Date().toISOString();
    try {
      const data = await c.fetch(null);
      snaps.set(c.key, { data, updatedAt: new Date().toISOString(), ok: true, error: null, attemptedAt: at });
      rows.push({
        id: c.key,
        ok: 'sí',
        items: String(c.count(data)),
        ms: String(Date.now() - t0),
        error: '',
      });
    } catch (e) {
      const error = describeError(e);
      snaps.set(c.key, { data: null, updatedAt: null, ok: false, error, attemptedAt: at });
      rows.push({ id: c.key, ok: 'NO', items: '-', ms: String(Date.now() - t0), error });
    }
  }),
);

rows.sort(
  (a, b) => COLLECTORS.findIndex((c) => c.key === a.id) - COLLECTORS.findIndex((c) => c.key === b.id),
);
const cols = ['id', 'ok', 'items', 'ms', 'error'] as const;
const width = Object.fromEntries(cols.map((k) => [k, Math.max(k.length, ...rows.map((r) => r[k].length))]));
const line = (r: Record<(typeof cols)[number], string>) =>
  cols
    .map((k) => r[k].padEnd(width[k]!))
    .join('  ')
    .trimEnd();
console.log(line({ id: 'id', ok: 'ok', items: 'items', ms: 'ms', error: 'error' }));
for (const r of rows) console.log(line(r));

const panel = assemblePanel(snaps, loadStaticData(), COLLECTORS);
console.log(`\nResumen: ${panel.summary.level}`);
for (const r of panel.summary.reasons) console.log(`  - ${r}`);

if (out) {
  writeFileSync(resolve(out), JSON.stringify(panel, null, 2) + '\n');
  console.log(`\nPanel escrito en ${resolve(out)}`);
}
process.exitCode = rows.every((r) => r.ok === 'sí') ? 0 : 1;
