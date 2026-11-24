import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const name='ball46-premium-match-colors-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const get=async path=>{
 const r=await fetch(root+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,path+'_'+r.status);return j.result};
const id=(await get('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await get('/workers/'+name+'/versions/'+id+'?include=modules');
const modules=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const m=modules[v.main_module].match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(m,'EMBED_MISSING');
const s=JSON.parse(m[1]);
const queries=[
 ['renderer','function premiumMatchRow(',12500],
 ['flat-render','function matchRow(',3500],
 ['draw','  function draw(pageOnly=false){',10500],
 ['render-pagination','function pagination(',4500],
 ['paging-ref','data-b46-pm-page',4200],
 ['visible-list','const visible=[...rows].sort(',6100],
 ['mode-display',"if(mode==='ou')",3500],
 ['mode-display2',"if(mode==='ou'&&",2700],
 ['list-head',"Prediction History",3800],
 ['candidate-layout',"b46OuHistoryMount(content,panel,rows)",1000],
 ['adaptive-panel','  function b46AdaptivePanel(content){',3400],
 ['responsive',"b46pm-premium-match",1200]
];
for(const [tag,term,n] of queries){
 let i=s.indexOf(term);
 console.log('B46_EXISTING_FRONTEND_SOURCE '+JSON.stringify({tag,term,index:i,code:i<0?'':s.slice(Math.max(0,i-300),i+n)}));
}

const start=s.indexOf("  function draw(pageOnly=false){");
const end=s.indexOf("  function show(modeNext){",start);
console.log('B46_ORIGINAL_CARD_DRAW_TAIL '+JSON.stringify({start,end,code:s.slice(start+7000,Math.min(end,start+18500))}));
for(const t of ['function historyRow(','function premiumHistoryRow(','function listSection(','function statusHistory','function oldHistory','b46pm-prediction-history','b46pm-stats-board','pageSize=','const history=','pagination','pageItems','premiumMatchRow(item','premiumMatchRow(row','premiumMatchRow(r','append(premiumMatchRow']){
 const i=s.indexOf(t,start);
 console.log('B46_ORIGINAL_CARD_NEEDLE '+JSON.stringify({needle:t,offset:i,code:i<0?'':s.slice(Math.max(start,i-700),Math.min(end,i+2100))}));
}

const base='https://'+name+'.mccarey-supon.workers.dev';
const [b,a]=await Promise.all([
 fetch(base+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(24000)}),
 fetch(base+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(24000)})
]);
assert(b.ok&&a.ok,'SOURCES_UNAVAILABLE');
const [legacy,adaptive]=await Promise.all([b.json(),a.json()]);
console.log('B46_REAL_RECORD_SHAPES '+JSON.stringify({
 version:id,
 ou:legacy.ouLedger?.rows?.slice(0,3),
 adaptive:adaptive.records?.slice(0,3),
 last:adaptive.records?.at(-1),
 fieldsAdaptive:Object.keys(adaptive.records?.[0]||{}),
 historyCount:adaptive.records?.length,formulaCount:adaptive.formulas?.length,
 sortKickoff:{latest:Math.max(...adaptive.records.map(r=>r.kickoff||0)),countMissing:adaptive.records.filter(r=>!r.kickoff).length}
}).slice(0,11500));
