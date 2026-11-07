// Overall traffic light for the district: the worst level among six rules, with plain-Spanish reasons
// (most severe first). Thresholds are deliberately simple for the MVP and documented here so the UI's
// method box and future tuning (e.g. with SENAMHI's rain percentiles for Huaraz) start from one place.
import type {
  ElNino,
  Earthquake,
  FeedItem,
  Forecast,
  Level,
  RiverPoint,
  Summary,
  WeatherWarning,
} from '../shared/types.ts';
import { levelRank, limaDate, shortLimaDateTime, worstLevel } from './util.ts';

export interface SummaryInput {
  warnings: WeatherWarning[] | null;
  forecast: Forecast | null;
  rivers: RiverPoint[] | null;
  elNino: ElNino | null;
  emergencies: FeedItem[] | null;
  earthquakes: Earthquake[] | null;
}

/** Rule 1 – SENAMHI warnings covering the district, active now or starting within this window */
export const WARNING_LOOKAHEAD_H = 72;
/** Rule 2 – rain forecast for today + the next 2 days (Lima dates), mm */
export const RAIN = {
  atencion: { day: 15, total: 30 },
  alerta: { day: 25, total: 50 },
  emergencia: { day: 40, total: 80 },
};
/** Rule 3 – river levels come already computed (see collectors/glofas.ts: peak vs 30-day mean) */
/** Rule 4 – ENFEN status level comes already computed (see collectors/enfen.ts) */
/** Rule 5 – INDECI/COEN reports tagged Independencia (alerta) or Huaraz (atención) in the last N days */
export const EMERGENCY_DAYS = 7;
/** Rule 6 – earthquakes in the last N days within R km: M ≥ 4.5 atención, M ≥ 6 alerta */
export const QUAKE = { days: 7, radiusKm: 50, atencion: 4.5, alerta: 6 };

const num = (n: number, digits = 1) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Finding = { level: Level; reason: string };

function warningFindings(ws: WeatherWarning[], now: Date): Finding[] {
  const t = now.getTime();
  const horizon = t + WARNING_LOOKAHEAD_H * 3600_000;
  return ws
    .filter((w) => Date.parse(w.end) > t && Date.parse(w.start) <= horizon && w.level !== 'normal')
    .map((w) => {
      const label = w.levelLabel.replace(/^Nivel/, 'nivel');
      const when =
        Date.parse(w.start) > t
          ? `desde el ${shortLimaDateTime(w.start)} hasta el ${shortLimaDateTime(w.end)}`
          : `vigente hasta el ${shortLimaDateTime(w.end)}`;
      return {
        level: w.level,
        reason: `SENAMHI: aviso N° ${w.number} de ${label} por «${w.title}», ${when}.`,
      };
    });
}

function rainFindings(f: Forecast, now: Date): Finding[] {
  const today = limaDate(now);
  const next = f.daily.filter((d) => d.date >= today).slice(0, 3);
  if (!next.length) return [];
  const maxDay = Math.max(...next.map((d) => d.precipMm));
  const total = next.reduce((s, d) => s + d.precipMm, 0);
  const hit = (k: keyof typeof RAIN) => maxDay >= RAIN[k].day || total >= RAIN[k].total;
  const level: Level = hit('emergencia')
    ? 'emergencia'
    : hit('alerta')
      ? 'alerta'
      : hit('atencion')
        ? 'atencion'
        : 'normal';
  if (level === 'normal') return [];
  return [
    {
      level,
      reason: `Se pronostican hasta ${num(maxDay)} mm de lluvia en un día (${num(total)} mm en los próximos 3 días, Open-Meteo).`,
    },
  ];
}

function riverFindings(rs: RiverPoint[]): Finding[] {
  return rs
    .filter((r) => r.level !== 'normal' && r.referenceM3s)
    .map((r) => {
      const peak = Math.max(
        ...r.series
          .filter((s) => s.forecast)
          .slice(0, 7)
          .map((s) => s.dischargeM3s),
      );
      return {
        level: r.level,
        reason: `El modelo de caudales prevé que el ${r.name} llegue a ${num(peak)} m³/s, ${num(peak / r.referenceM3s!)} veces su promedio del último mes.`,
      };
    });
}

function enfenFindings(e: ElNino): Finding[] {
  if (e.enfenLevel === 'normal' || !e.enfenStatus) return [];
  const rain = /el ni[ñn]o/i.test(e.enfenStatus) ? ': se esperan lluvias por encima de lo normal' : '';
  return [{ level: e.enfenLevel, reason: `ENFEN mantiene el estado «${e.enfenStatus}»${rain}.` }];
}

function emergencyFindings(items: FeedItem[], now: Date): Finding[] {
  const since = now.getTime() - EMERGENCY_DAYS * 86400_000;
  const recent = items.filter((i) => Date.parse(i.date) >= since && Date.parse(i.date) <= now.getTime());
  const indep = recent.filter((i) => i.tags.includes('Independencia'));
  if (indep.length)
    return [
      {
        level: 'alerta',
        reason: `INDECI registró ${plural(indep.length, 'reporte', 'reportes')} de emergencia en Independencia en los últimos ${EMERGENCY_DAYS} días.`,
      },
    ];
  const huaraz = recent.filter((i) => i.tags.includes('Huaraz'));
  if (huaraz.length)
    return [
      {
        level: 'atencion',
        reason: `INDECI registró ${plural(huaraz.length, 'reporte', 'reportes')} de emergencia en la provincia de Huaraz en los últimos ${EMERGENCY_DAYS} días.`,
      },
    ];
  return [];
}

function quakeFindings(qs: Earthquake[], now: Date): Finding[] {
  const since = now.getTime() - QUAKE.days * 86400_000;
  return qs
    .filter(
      (q) => Date.parse(q.date) >= since && q.distanceKm <= QUAKE.radiusKm && q.magnitude >= QUAKE.atencion,
    )
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 1)
    .map((q) => ({
      level: q.magnitude >= QUAKE.alerta ? 'alerta' : 'atencion',
      reason: `Sismo de magnitud ${num(q.magnitude)} a ${Math.round(q.distanceKm)} km del distrito (${q.reference}) el ${shortLimaDateTime(q.date)}.`,
    }));
}

export function buildSummary(input: SummaryInput, now: Date): Summary {
  const findings: Finding[] = [
    ...warningFindings(input.warnings ?? [], now),
    ...(input.forecast ? rainFindings(input.forecast, now) : []),
    ...riverFindings(input.rivers ?? []),
    ...(input.elNino ? enfenFindings(input.elNino) : []),
    ...emergencyFindings(input.emergencies ?? [], now),
    ...quakeFindings(input.earthquakes ?? [], now),
  ];
  if (!findings.length)
    return {
      level: 'normal',
      reasons: ['No hay avisos ni alertas activas para Independencia en este momento.'],
    };
  // stable sort: same level keeps the rule order above
  const sorted = [...findings].sort((a, b) => levelRank(b.level) - levelRank(a.level));
  return { level: worstLevel(findings.map((f) => f.level)), reasons: sorted.map((f) => f.reason) };
}
