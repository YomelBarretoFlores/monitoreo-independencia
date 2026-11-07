// Every live collector, in the order the scheduler starts them (staggered).
import { cenepred } from './cenepred.ts';
import { elPeruano } from './el-peruano.ts';
import { enfen } from './enfen.ts';
import { glofas } from './glofas.ts';
import { igpSismos } from './igp-sismos.ts';
import { indeciCoen } from './indeci-coen.ts';
import { lakes } from './lakes.ts';
import { noaaOni } from './noaa-oni.ts';
import { noticias } from './noticias.ts';
import { openMeteo } from './open-meteo.ts';
import { senamhiAvisos } from './senamhi-avisos.ts';
import type { Collector } from './types.ts';

export const COLLECTORS: Collector<any>[] = [
  senamhiAvisos,
  openMeteo,
  glofas,
  lakes,
  indeciCoen,
  igpSismos,
  enfen,
  noaaOni,
  noticias,
  elPeruano,
  cenepred,
];
