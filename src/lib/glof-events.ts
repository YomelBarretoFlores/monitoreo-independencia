// Alluvions that already happened in the district, with the official figures. Pure data (no DOM).

export interface EventSource {
  label: string;
  url: string;
}

/** The 2025-04-28 alluvion down the quebrada Llaca and the río Casca (SINPAD 236043) */
export const CASCA_2025 = {
  title: 'Aluvión del río Casca',
  date: '28 de abril de 2025',
  time: '03:00',
  origin:
    'Una caída de roca hizo desbordar una laguna en formación de la cara sur del nevado Vallunaraju sobre otra laguna; el aluvión bajó por la quebrada Llaca y el río Casca.',
  places: ['Paria – Willcahuaín', 'Ucrumarán', 'Jinua', 'Acovichay', 'Lirio', 'Palmira'],
  people: { deaths: 2, injured: 45, homeless: 103, affected: 315 },
  homes: { destroyed: 1, uninhabitable: 29, affected: 93 },
  /** Date of the damage figures in the report */
  asOf: '14 de mayo de 2025',
  sources: {
    indeci: {
      label: 'INDECI – COEN, reporte complementario N.° 6340 (3 de junio de 2025)',
      url: 'https://portal.indeci.gob.pe/wp-content/uploads/2025/05/REPORTE-COMPLEMENTARIO-N.%C2%BA-6340-3JUN2025-ALUVI%C3%93N-EN-EL-DISTRITO-DE-INDEPENDENCIA-%C3%81NCASH17.pdf',
    },
    inspection: {
      label: 'INAIGEM e INGEMMET, inspección técnica del aluvión en la subcuenca Casca (2025)',
      url: 'https://repositorio.inaigem.gob.pe/items/03d6432b-1c46-424b-aad7-fbc728de9b49',
    },
  } satisfies Record<string, EventSource>,
};
