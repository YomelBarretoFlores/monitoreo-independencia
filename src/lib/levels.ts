import type { Level } from '../../shared/types.ts';

// Traffic-light levels. Color is never the only signal: every level is also shown with its word.

export const LEVELS: readonly Level[] = ['normal', 'atencion', 'alerta', 'emergencia'];

export const levelRank = (l: Level): number => LEVELS.indexOf(l);

export function maxLevel(levels: readonly Level[]): Level {
  return levels.reduce<Level>((worst, l) => (levelRank(l) > levelRank(worst) ? l : worst), 'normal');
}

const LABEL: Record<Level, string> = {
  normal: 'Normal',
  atencion: 'Atención',
  alerta: 'Alerta',
  emergencia: 'Emergencia',
};

const HEADLINE: Record<Level, string> = {
  normal: 'Situación normal',
  atencion: 'Estar atentos',
  alerta: 'En alerta: prepararse',
  emergencia: 'Emergencia: actuar ahora',
};

export const levelLabel = (l: Level): string => LABEL[l];
export const levelHeadline = (l: Level): string => HEADLINE[l];

/** CENEPRED words ("Muy alto", "Alto", "Medio", "Bajo") to a traffic-light level. */
export function riskTextLevel(text: string | null): Level | null {
  if (!text) return null;
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (t === 'muy alto') return 'emergencia';
  if (t === 'alto') return 'alerta';
  if (t === 'medio') return 'atencion';
  if (t === 'bajo' || t === 'muy bajo') return 'normal';
  return null;
}
