const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;

// Alpha, not a second asset, supplies the quiet duotone surface in each vector mask.
export const icons = {
  all: svg('<circle cx="12" cy="12" r="9" fill="black" fill-opacity=".2"/><path d="m12 8 3.8 2.8-1.4 4.5H9.6l-1.4-4.5Z" fill="black" fill-opacity=".75"/><path d="M12 3v5m8.5 1.8-4.7 1m1.5 8.5-3-4M6.7 19.3l3-4M3.5 9.8l4.7 1"/>'),
  live: svg('<rect x="3.5" y="7" width="17" height="13.5" rx="2.5" fill="black" fill-opacity=".2"/><path d="m8 3 4 4 4-4M6.5 14h2l1.8-3.5 3 7 1.8-3.5h2.4"/>'),
  signal: svg('<circle cx="12" cy="12" r="8.7" fill="black" fill-opacity=".2"/><circle cx="12" cy="12" r="4.7" stroke-opacity=".5"/><path d="M12 3.3V12l6.2-6.2M3.3 12H12v8.7" stroke-opacity=".6"/><circle cx="16.1" cy="7.9" r="1.4" fill="black" stroke="none"/><circle cx="12" cy="12" r="1" fill="black" stroke="none"/>'),
  scheduled: svg('<path d="M17.5 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6M3 10h14.5M7 3v4m6-4v4"/><path d="M4 11h8v8H4Z" fill="black" fill-opacity=".2" stroke="none"/><circle cx="17.5" cy="17.5" r="4.5" fill="black" fill-opacity=".2"/><path d="M17.5 15v2.5l1.8 1.1M7 14h2"/>'),
  unknown: svg('<path d="M5 3.5h14M5 20.5h14M6.5 4c0 4.6 1.2 5.8 5.5 8-4.3 2.2-5.5 3.4-5.5 8h11c0-4.6-1.2-5.8-5.5-8 4.3-2.2 5.5-3.4 5.5-8Z" fill="black" fill-opacity=".2"/><path d="m9 7 3 2.2L15 7m-6 10 3-2.2 3 2.2" fill="black" fill-opacity=".7" stroke="none"/>'),
  finished: svg('<path d="M4.5 21V3M5 4h15v11H5" fill="black" fill-opacity=".2"/><path d="M5 4h5v3.7H5zm10 0h5v3.7h-5zm-5 3.7h5v3.6h-5zM5 11.3h5V15H5zm10 0h5V15H5z" fill="black" fill-opacity=".9" stroke="none"/>'),
};

export const iconUri = key => `data:image/svg+xml,${encodeURIComponent(icons[key]).replaceAll("'", '%27')}`;
