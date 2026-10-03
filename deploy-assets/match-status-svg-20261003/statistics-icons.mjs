const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;

export const icons = {
  total: svg('<circle cx="12" cy="12" r="9" fill="black" fill-opacity=".2"/><path d="m12 8 3.8 2.8-1.4 4.5H9.6l-1.4-4.5Z" fill="black" fill-opacity=".75"/><path d="M12 3v5m8.5 1.8-4.7 1m1.5 8.5-3-4M6.7 19.3l3-4M3.5 9.8l4.7 1"/>'),
  result: svg('<rect x="2.5" y="5.5" width="19" height="13" rx="1.5" fill="black" fill-opacity=".2"/><path d="M9 6v12m6-12v12" stroke-opacity=".55"/><path d="m4.5 10 1.5-1v6m-1.2 0h2.4m3.3-5.5 3 5m0-5-3 5m6.7-4.3c0-2 3.2-2 3.2 0 0 1.4-3.2 2.1-3.2 4.3h3.2"/>'),
  ah: svg('<path d="M12 3v18m-4 0h8M4.5 6.5h15"/><circle cx="12" cy="6.5" r="1.8" fill="black" fill-opacity=".55"/><path d="m5.5 7-3 7h6Zm13 0-3 7h6Z" stroke-opacity=".7"/><path d="M2.5 14h6a3 3 0 0 1-6 0Zm13 0h6a3 3 0 0 1-6 0Z" fill="black" fill-opacity=".25"/>'),
  ou: svg('<rect x="3" y="3" width="8" height="18" rx="1.5" fill="black" fill-opacity=".18" stroke="none"/><rect x="13" y="3" width="8" height="18" rx="1.5" fill="black" fill-opacity=".32" stroke="none"/><path d="M7 18V6m-3 3 3-3 3 3m7-3v12m-3-3 3 3 3-3"/>'),
  btts: svg('<path d="M2.5 18V6.5h6V18Zm13 0V6.5h6V18Z" fill="black" fill-opacity=".2"/><path d="M5.5 7v10m13-10v10M3 10.5h5m8 0h5M3 14h5m8 0h5" stroke-opacity=".4"/><circle cx="12" cy="12.5" r="2.2" fill="black" fill-opacity=".7" stroke="none"/><path d="M2.5 20h19" stroke-opacity=".5"/>'),
  corners: svg('<path d="M7 21V3.5l11 4.7L7 13" fill="black" fill-opacity=".24"/><path d="M3 21h18M3 16v5h5m-1-5a5 5 0 0 1 5 5" stroke-opacity=".6"/>'),
  cards: svg('<rect x="4" y="3" width="11" height="15" rx="1.5" transform="rotate(-12 9.5 10.5)" fill="black" fill-opacity=".18"/><rect x="9" y="6" width="11" height="15" rx="1.5" fill="black" fill-opacity=".55"/><path d="M12 10h5" stroke-opacity=".5"/>'),
  other: svg('<circle cx="12" cy="12" r="9" fill="black" fill-opacity=".2"/><g fill="black" stroke="none"><circle cx="7.2" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="16.8" cy="12" r="1.3"/></g>'),
};

export const categories = [
  { key: 'total', label: 'Total', sampleCount: 1315 },
  { key: 'result', label: '1X2', sampleCount: 138 },
  { key: 'ah', label: 'AH', sampleCount: 113 },
  { key: 'ou', label: 'O/U', sampleCount: 765 },
  { key: 'btts', label: 'BTTS', sampleCount: 0 },
  { key: 'corners', label: 'Corners', sampleCount: 299 },
  { key: 'cards', label: 'Cards', sampleCount: 0 },
  { key: 'other', label: 'Other', sampleCount: 0 },
];

export const iconUri = key => `data:image/svg+xml,${encodeURIComponent(icons[key]).replaceAll("'", '%27')}`;

