import { describe, expect, it } from 'vitest';
import raw from '../../data/centros-poblados.json?raw';
import { CENTROS_SOURCES } from '../../src/lib/centros.ts';
import { SOURCES as GLOF_SOURCES } from '../../src/lib/glof.ts';
import { MAP_SOURCES } from '../../src/lib/safezones.ts';
import { renderSources } from '../../src/sections/sources.ts';
import type { Ctx } from '../../src/ui/shell.ts';

const ctx = { state: 'offline', now: Date.parse('2026-11-08T12:00:00Z') } as unknown as Ctx;
const html = renderSources(null, ctx);
const escUrl = (u: string) => u.replace(/&/g, '&amp;');

describe('Fuentes page: fixed and map sources', () => {
  it('lists the centros poblados inputs (OSIPTEL, INEI, MINEDU, SUSALUD), the same as the data file', () => {
    const data = JSON.parse(raw) as { sources: Record<string, { label: string; url: string }> };
    expect(CENTROS_SOURCES).toEqual(data.sources);
    for (const s of Object.values(CENTROS_SOURCES)) expect(html).toContain(`href="${escUrl(s.url)}"`);
    for (const name of ['OSIPTEL', 'INEI', 'ESCALE', 'RENIPRESS']) expect(html).toContain(name);
  });

  it('lists every study behind the alluvion simulation', () => {
    for (const s of Object.values(GLOF_SOURCES)) expect(html).toContain(`href="${escUrl(s.url)}"`);
  });

  it('lists the safe-zone maps, the boundaries, rivers, base maps and terrain', () => {
    for (const m of MAP_SOURCES) expect(html).toContain(m.title);
    expect(html).toContain('Terrain Tiles');
    expect(html).toContain('href="https://registry.opendata.aws/terrain-tiles/"');
    for (const name of ['IGN', 'ANA', 'Esri']) expect(html).toContain(name);
  });

  it('shows the fixed sources even before the live panel loads', () => {
    expect(html).toContain('Mapas y datos fijos');
  });
});
