import fs from 'node:fs';

const src=fs.readFileSync('fullmarket-lazy-preview-20261110/lazy-preview.js','utf8');
const css=fs.readFileSync('fullmarket-lazy-preview-20261110/lazy-preview.css','utf8');

const checks={
  marker:src.includes('B46_FULLMARKET_COMPACT_LAZY_UI_PREVIEW_20261111'),
  previewOnly:src.includes('Preview only. No Production deploy.'),
  noFetch:!src.includes('fetch('),
  noXHR:!src.includes('XMLHttpRequest'),
  noApiLiteral:!src.includes('/api/'),
  usesExistingApi:src.includes('window.NOMAD343_FULL_MARKET_BOOKMAKER'),
  onDemandRender:src.includes('api.renderBookHtml(fixture,slug)'),
  instructionMovedToHead:src.includes('head.textContent=HEADING'),
  instructionText:src.includes('Select a bookmaker to view prices.'),
  emptyPanelRemoved:src.includes("panel.innerHTML=''")&&src.includes('panel.hidden=true'),
  lowerPanelHiddenCss:css.includes('display:none!important')&&css.includes('height:0!important'),
  panelReopensOnSelection:src.includes('panel.hidden=false'),
  collapseSame:src.includes('host.dataset.b46LazyBook===slug'),
  noLegacyEmptyBox:!src.includes('b46-lazy-empty')
};

console.log(JSON.stringify(checks));
if(Object.values(checks).some(v=>!v))process.exit(1);
