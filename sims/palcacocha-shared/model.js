// The simulator reads the same model and colours as the app, so a figure on screen matches the app's.
import {HAZARD_LEVELS} from '../../src/lib/safezones.ts';

export * from '../../src/lib/palcacocha.ts';

export const HAZARD_COLORS = Object.fromEntries(HAZARD_LEVELS.map((l) => [l.id, l.color]));
export const HAZARD_LABELS = Object.fromEntries(HAZARD_LEVELS.map((l) => [l.id, l.label]));
