import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token);
async function cf(path){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});
 const d=await r.json();assert(r.ok&&d.success,JSON.stringify(d.errors||[]));return d.result;
}
const worker='ball46-production';
const deploy=await cf('/scripts/'+worker+'/deployments?per_page=1');
const current=deploy.deployments[0].versions[0].version_id;
const v=await cf('/workers/'+worker+'/versions/'+current+'?include=modules');
const main=v.modules.find(x=>x.name===v.main_module);
const code=Buffer.from(main.content_base64,'base64').toString();
const hits=['export default','async fetch(','fetch(request','fetch(req','seo','__b46_','import ','Response','URL(request.url)'].map(x=>({search:x,first:code.indexOf(x),context:code.indexOf(x)>=0?code.slice(Math.max(0,code.indexOf(x)-90),code.indexOf(x)+340):''}));
const output={version:current,main:v.main_module,mainBytes:code.length,moduleCount:v.modules.length,bindingNames:v.bindings.map(x=>x.name),imports:code.split('\n').filter(x=>x.startsWith('import ')).slice(0,30),source:code.length<9000?code:null,hits};
console.log('B46_READONLY_PRODUCTION_SCOPE '+JSON.stringify(output));
const endpoint='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/__b46_pm_adaptive_research';
const res=await fetch(endpoint,{signal:AbortSignal.timeout(35000),headers:{accept:'application/json'}});
const d=await res.json().catch(()=>null);
console.log('B46_READONLY_ADAPTIVE_PUBLIC '+JSON.stringify({http:res.status,keys:d?Object.keys(d):null,code:d?.code,formulas:d?.formulas?.length,records:d?.records?.length,series30:d?.series30&&{rangeDays:d.series30.rangeDays,formulas:Object.keys(d.series30.byFormula||{}).length},series90:d?.series90&&{rangeDays:d.series90.rangeDays,formulas:Object.keys(d.series90.byFormula||{}).length},eventJournal:d?.eventJournal&&{keys:Object.keys(d.eventJournal)},bytes:res.headers.get('content-length')}));

if(d){console.log('B46_READONLY_ADAPTIVE_SHAPE '+JSON.stringify({formula:d.formulas?.[0],formulaKeys:Object.keys(d.formulas?.[0]||{}),row:d.records?.[0]&&Object.fromEntries(Object.entries(d.records[0]).filter(([key])=>!/fixture|team|match|bet|odd|price|book/i.test(key))),series30First:Object.entries(d.series30?.byFormula||{}).slice(0,2).map(([id,items])=>({id,count:items.length,first:items[0],last:items.at(-1)})),series90First:Object.entries(d.series90?.byFormula||{}).slice(0,2).map(([id,items])=>({id,count:items.length,first:items[0],last:items.at(-1)})),cutoff:d.cutoff,lastRunAt:d.lastRunAt,bySelectionKeys:Object.keys(d.bySelection||{}),dailyKeys:Object.keys(d.daily||{})}));}
