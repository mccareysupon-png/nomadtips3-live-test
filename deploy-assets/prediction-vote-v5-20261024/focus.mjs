import{mkdir,writeFile}from'node:fs/promises';
const urls=['/','/live-prediction-343.js','/dashboard-v2-stage3-featured-facts-20261013a.js'];
const out={at:new Date().toISOString(),sections:[],browser:[]};
for(const u of urls){
 const r=await fetch('https://ball46.com'+u+'?v5audit='+Date.now(),{signal:AbortSignal.timeout(60000)}),s=await r.text(),hits=[];
 const terms=u==='/live-prediction-343.js'?['data-prediction-card','data-prediction-content','function render','card-title','prediction-card','Live match outlook','prediction','DOMContentLoaded']:
  u==='/'?['side-card prediction-card','data-prediction-content','data-featured-score','data-board-sections','data-status-filter','live-prediction-343.js','data-theme','data-workspace-view']:
  ['function renderFeatured','function renderBoard','function fixtureKey','function visibleRows','window.ball46','ball46:','const selectedId','let selectedId','prediction='];
 for(const term of terms){let i=-1,n=0;while((i=s.indexOf(term,i+1))>=0&&n++<3)hits.push({term,at:i,excerpt:s.slice(Math.max(0,i-440),i+1450)})}
 out.sections.push({url:u,status:r.status,length:s.length,hits});
}
await mkdir('audit',{recursive:true});await writeFile('audit/focus.json',JSON.stringify(out.sections,null,2));
console.log('B46_V5_FOCUS='+JSON.stringify(out.sections).slice(0,24000));
