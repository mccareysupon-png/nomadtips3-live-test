import fs from 'node:fs';

const src=fs.readFileSync('fullmarket-lazy-preview-20261110/lazy-preview.js','utf8');

const checks={
  marker:src.includes('B46_FULLMARKET_LAZY_UI_PREVIEW_20261110'),
  noFetch:!src.includes('fetch('),
  noXHR:!src.includes('XMLHttpRequest'),
  noApiLiteral:!src.includes('/api/'),
  usesExistingApi:src.includes('window.NOMAD343_FULL_MARKET_BOOKMAKER'),
  onDemandRender:src.includes('api.renderBookHtml(fixture,slug)'),
  collapseSame:src.includes("host.dataset.b46LazyBook===slug"),
  onePanel:src.includes("panel.innerHTML=html"),
  initialCollapsed:src.includes("Select a bookmaker to view prices."),
  previewOnly:src.includes('Preview only. No Production deploy.')
};

console.log(JSON.stringify(checks));
if(Object.values(checks).some(v=>!v))process.exit(1);
