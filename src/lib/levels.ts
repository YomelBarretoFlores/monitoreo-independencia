import type { Level } from '../../shared/types.ts';

// Traffic-light levels. Color is never the only signal: every level also has a label and an icon.

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
  const t = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (t === 'muy alto') return 'emergencia';
  if (t === 'alto') return 'alerta';
  if (t === 'medio') return 'atencion';
  if (t === 'bajo' || t === 'muy bajo') return 'normal';
  return null;
}

/** Inline SVG icon per level (check, info, triangle, octagon). Decorative: pair it with the label. */
export function levelIcon(l: Level): string {
  const body: Record<Level, string> = {
    normal: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
    atencion: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
    alerta: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.3v.01"/>',
    emergencia: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M12 7.5v6M12 16.6v.01"/>',
  };
  return `<svg class="lv-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body[l]}</svg>`;
}
