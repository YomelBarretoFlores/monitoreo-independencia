// CENEPRED risk scenario for El Niño 2026-2027 (SIGRID ArcGIS service ER_NINO2027_BD), district row
// ubigeo 020105: layer 4 = flood, layer 5 = mass movement (landslides, huaicos). The same rows carry
// the 2017 census population, dwellings and poverty share used for the District card.
import type { District, RiskProfile } from '../../shared/types.ts';
import { fetchJson, SourceError } from '../fetch.ts';
import { DISTRICT_BASE } from '../util.ts';
import type { Collector } from './types.ts';

const SERVICE = 'https://sigrid.cenepred.gob.pe/arcgis/rest/services/FEN/ER_NINO2027_BD/MapServer';
const layerUrl = (layer: number) =>
  `${SERVICE}/${layer}/query?${new URLSearchParams({
    where: `ubigeo='${DISTRICT_BASE.ubigeo}'`,
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  })}`;

interface ArcgisResponse {
  features?: { attributes: Record<string, unknown> }[];
  error?: { message?: string };
}

export interface CenepredData {
  profile: RiskProfile;
  district: Pick<District, 'population2017' | 'households2017' | 'povertyPct'>;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseCenepred(flood: ArcgisResponse, mass: ArcgisResponse): CenepredData {
  const f = flood.features?.[0]?.attributes;
  const m = mass.features?.[0]?.attributes;
  if (!f || !m) throw new SourceError('CENEPRED no devolvió la fila del distrito.');
  return {
    profile: {
      // niv_sinu / npel_mm: hazard (susceptibility) level; nriesgo_*: risk level of the scenario
      massMovement: { hazard: str(m.npel_mm), risk: str(m.nriesgo_mm) },
      flood: { hazard: str(f.niv_sinu), risk: str(f.nriesgo_in) },
      healthFacilities: num(f.t_eess) ?? num(m.t_eess),
      schools: num(f.t_iiee) ?? num(m.t_iiee),
      scenario: 'Escenario de riesgo por El Niño 2026-2027 (CENEPRED)',
    },
    district: {
      population2017: num(f.pob_2017),
      // viv_2017 counts dwellings (viviendas) in the 2017 census
      households2017: num(f.viv_2017),
      povertyPct: num(f.pobrmo) ?? num(m.pobrmon),
    },
  };
}

export const cenepred: Collector<CenepredData> = {
  key: 'cenepred',
  info: {
    id: 'cenepred',
    name: 'CENEPRED – Escenario de riesgo por El Niño',
    url: 'https://sigrid.cenepred.gob.pe/sigridv3/',
    everyMinutes: 1440,
  },
  everyMinutes: 1440,
  async fetch() {
    const flood = await fetchJson<ArcgisResponse>(layerUrl(4));
    const mass = await fetchJson<ArcgisResponse>(layerUrl(5));
    if (flood.error || mass.error) throw new SourceError('El servicio de CENEPRED respondió con error.');
    return parseCenepred(flood, mass);
  },
  count: () => 1,
};
