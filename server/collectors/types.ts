import type { SourceId } from '../../shared/types.ts';

/** Public description of a source, as shown in SourceMeta */
export interface SourceInfo {
  id: SourceId;
  /** Spanish name for the UI */
  name: string;
  /** Public page a person can open to check the data */
  url: string;
  /** Refresh interval in minutes; null for static datasets */
  everyMinutes: number | null;
}

/**
 * One live source. `key` is the snapshot row (usually the SourceId; the lakes use their own key and
 * borrow the open-meteo SourceId for their meta). `fetch` receives the last good data so feeds that
 * only show a few items (INDECI) can keep a rolling history.
 */
export interface Collector<T = unknown> {
  key: string;
  info: SourceInfo;
  everyMinutes: number;
  fetch(prev: T | null): Promise<T>;
  /** How many items the data holds, for the status table of npm run collect */
  count(data: T): number;
}
