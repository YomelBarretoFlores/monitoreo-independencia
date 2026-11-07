// NOAA CPC Oceanic Niño Index (ONI): 3-month running SST anomaly in Niño 3.4. Last 24 seasons.
import type { ElNino } from '../../shared/types.ts';
import { fetchText } from '../fetch.ts';
import type { Collector } from './types.ts';

const URL_ONI = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

export function parseOni(text: string): ElNino['oni'] {
  const rows: ElNino['oni'] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z]{3})\s+(\d{4})\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(line);
    if (m) rows.push({ season: m[1]!, year: Number(m[2]), anomaly: Number(m[4]) });
  }
  if (!rows.length) throw new Error('El archivo del ONI no trae filas reconocibles.');
  return rows.slice(-24);
}

export const noaaOni: Collector<ElNino['oni']> = {
  key: 'noaa-oni',
  info: {
    id: 'noaa-oni',
    name: 'NOAA – Índice Oceánico de El Niño (ONI)',
    url: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php',
    everyMinutes: 1440,
  },
  everyMinutes: 1440,
  async fetch() {
    return parseOni(await fetchText(URL_ONI));
  },
  count: (d) => d.length,
};
