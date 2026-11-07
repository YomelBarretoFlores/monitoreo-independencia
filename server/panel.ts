// Assembles GET /api/panel from the stored snapshots, the static datasets and the outline.
import type { ElNino, Panel, Section, SourceMeta } from '../shared/types.ts';
import type { CenepredData } from './collectors/cenepred.ts';
import type { EnfenData } from './collectors/enfen.ts';
import type { Collector } from './collectors/types.ts';
import type { Snapshot } from './db.ts';
import { type StaticData, staticMeta } from './static-data.ts';
import { buildSummary } from './summary.ts';
import { DISTRICT_BASE } from './util.ts';

/**
 * Panel plus `sources`: the status of every source, including those merged into one section
 * (noaa-oni inside elNino). Not part of shared/types.ts yet; the UI can ignore it.
 */
export type PanelResponse = Panel & { sources: SourceMeta[] };

export function sourceMeta(c: Collector, snap: Snapshot | undefined): SourceMeta {
  return {
    ...c.info,
    updatedAt: snap?.updatedAt ?? null,
    ok: snap?.ok ?? false,
    ...(snap?.error ? { error: snap.error } : snap ? {} : { error: 'Todavía no se ha consultado.' }),
  };
}

export function assemblePanel(
  snaps: Map<string, Snapshot>,
  stat: StaticData,
  collectors: Collector[],
  now = new Date(),
): PanelResponse {
  const byKey = new Map(collectors.map((c) => [c.key, c]));
  const meta = (key: string) => {
    const c = byKey.get(key);
    if (!c) throw new Error(`No hay colector ${key}`);
    return sourceMeta(c, snaps.get(key));
  };
  const data = <T>(key: string) => (snaps.get(key)?.data ?? null) as T | null;
  const section = <T>(key: string): Section<T> => ({ meta: meta(key), data: data<T>(key) });

  const enfen = data<EnfenData>('enfen');
  const oni = data<ElNino['oni']>('noaa-oni');
  const elNino: ElNino | null =
    enfen || oni
      ? {
          enfenStatus: enfen?.status ?? null,
          enfenLevel: enfen?.level ?? 'normal',
          communiques: enfen?.communiques ?? [],
          oni: oni ?? [],
        }
      : null;

  const cen = data<CenepredData>('cenepred');
  const props = (stat.boundary?.properties ?? {}) as { population?: number; populationDate?: string };
  const district: Panel['district'] = {
    ...DISTRICT_BASE,
    population2017: cen?.district.population2017 ?? null,
    households2017: cen?.district.households2017 ?? null,
    // INEI estimate as tagged in OpenStreetMap (population + population:date, source:population=INEI)
    populationEstimate:
      props.population && props.populationDate
        ? { year: Number(props.populationDate), value: props.population }
        : null,
    povertyPct: cen?.district.povertyPct ?? null,
  };

  const panel: Panel = {
    generatedAt: now.toISOString(),
    district,
    summary: { level: 'normal', reasons: [] },
    warnings: section('senamhi-avisos'),
    forecast: section('open-meteo'),
    rivers: section('glofas'),
    lakes: section('lagunas'),
    elNino: { meta: meta('enfen'), data: elNino },
    emergencies: section('indeci-coen'),
    earthquakes: section('igp-sismos'),
    news: section('noticias'),
    legal: section('el-peruano'),
    risk: { meta: meta('cenepred'), data: cen?.profile ?? null },
    management: { meta: staticMeta('inversiones', stat), data: stat.management },
    elections: { meta: staticMeta('elecciones', stat), data: stat.elections },
    boundary: stat.boundary,
  };
  panel.summary = buildSummary(
    {
      warnings: panel.warnings.data,
      forecast: panel.forecast.data,
      rivers: panel.rivers.data,
      elNino,
      emergencies: panel.emergencies.data,
      earthquakes: panel.earthquakes.data,
    },
    now,
  );
  // one entry per SourceId: the lakes borrow the open-meteo id and already show their meta in `lakes`
  const sources = [
    ...collectors.map((c) => sourceMeta(c, snaps.get(c.key))),
    panel.management.meta,
    panel.elections.meta,
  ].filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i);
  return { ...panel, sources };
}
