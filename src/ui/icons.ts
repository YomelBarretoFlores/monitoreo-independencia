// One thin-line icon set (24×24 grid, 1.5 stroke, round caps), drawn for this project.
// Icons are decorative: always pair them with visible text or an aria-label.

const PATHS = {
  resumen:
    '<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>',
  lluvias:
    '<path d="M7 15.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 .5 7.47"/><path d="M8.5 18.5 7.5 21M12.5 17.5l-1 2.5M16.5 18.5l-1 2.5"/>',
  rios: '<path d="M3 8c1.5 0 1.5-1.5 3-1.5S7.5 8 9 8s1.5-1.5 3-1.5S13.5 8 15 8s1.5-1.5 3-1.5S19.5 8 21 8"/><path d="M3 13c1.5 0 1.5-1.5 3-1.5S7.5 13 9 13s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M3 18c1.5 0 1.5-1.5 3-1.5S7.5 18 9 18s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/>',
  nino: '<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path d="M12 10v6.5"/><path d="M17.5 6h3M17.5 9.5h2"/>',
  emergencias: '<path d="M3 12h3.5l2-5 3.5 10 2.5-7 1.5 2H21"/>',
  mapa: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  noticias:
    '<path d="M4.5 5.5h12v13a1.5 1.5 0 0 0 1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M16.5 9.5h3v9a1.5 1.5 0 0 1-3 0"/><path d="M7.5 9h6M7.5 12.5h6M7.5 16h4"/>',
  gestion:
    '<path d="M3.5 9.5 12 4.5l8.5 5"/><path d="M5.5 10v7.5M9.5 10v7.5M14.5 10v7.5M18.5 10v7.5"/><path d="M3.5 20h17"/>',
  fuentes:
    '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v6c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V6"/><path d="M5 12v6c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  alert:
    '<path d="M10.3 4.6 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 16.8v.01"/>',
  quake: '<path d="M3 12h3l1.5-3 2 7 2.5-11 2.5 13 2-8 1.5 2H21"/>',
  peak: '<path d="M3 19 9.5 8l3.5 5.5L15.5 10 21 19z"/><path d="m9.5 8 1.6 2.8-1.6-.7-1.6.9"/>',
  pulse: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/>',
  external: '<path d="M8 16 16 8M10 8h6v6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/>',
  trendUp: '<path d="M4 16.5 10 10.5l3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
  trendDown: '<path d="M4 7.5 10 13.5l3.5-3.5 6.5 6.5"/><path d="M15 16.5h5v-5"/>',
  trendFlat: '<path d="M4 12h16M15 7l5 5-5 5"/>',
  sortAsc: '<path d="M12 18V6M7 11l5-5 5 5"/>',
  sortDesc: '<path d="M12 6v12M7 13l5 5 5-5"/>',
  sortNone: '<path d="M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4"/>',
  idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = 'ic'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
