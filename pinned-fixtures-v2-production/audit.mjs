import assert from 'node:assert/strict';

const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';

async function api(path,options={}){
  const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));
  return j.result;
}
async function active(){
  const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  return v[0].version_id;
}
async function version(id){return api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}

const id=await active();
const v=await version(id);
console.log('ACTIVE_VERSION='+id);
console.log('MAIN_MODULE='+v.main_module);
console.log('MODULE_COUNT='+v.modules.length);

const needles={
  desktop:["function renderBoard()","function bindStableMatchRow","const rows=visibleRows(),order=['live','scheduled','unknown','finished']"],
  expanded:["document.addEventListener('click',e=>{if(handleMobileFlowSelect(e))return;","function openExpanded(id)"],
  mobile:["function cardHtml(f){","const all=visibleRows();const liveOnly=all.filter(x=>x.kind==='live')","$('#b46gn-results').addEventListener('click'"]
};
let desktop=0,expanded=0,mobile=0;
for(const m of v.modules){
  let t='';
  try{t=Buffer.from(m.content_base64,'base64').toString('utf8')}catch{}
  const hit={};
  for(const [k,arr] of Object.entries(needles)){
    const matched=arr.filter(n=>t.includes(n));
    if(matched.length){hit[k]=matched.length;if(k==='desktop')desktop++;if(k==='expanded')expanded++;if(k==='mobile')mobile++}
  }
  if(Object.keys(hit).length){
    console.log('MODULE_HIT='+JSON.stringify({name:m.name,len:t.length,hit}));
    if(hit.desktop){
      const i=t.indexOf("function renderBoard()");
      console.log('DESKTOP_CONTEXT='+JSON.stringify({name:m.name,context:t.slice(Math.max(0,i-180),Math.min(t.length,i+260)).replace(/\\s+/g,' ')}));
      const bi=t.indexOf("function bindStableMatchRow");
      console.log('BIND_CONTEXT='+JSON.stringify({name:m.name,context:bi>=0?t.slice(Math.max(0,bi-120),Math.min(t.length,bi+760)):null}));
    }
  }
}
console.log('DESKTOP_MODULE_HITS='+desktop);
console.log('EXPANDED_MODULE_HITS='+expanded);
console.log('MOBILE_MODULE_HITS='+mobile);
assert.equal(desktop,2,'DESKTOP_OWNER_COUNT_UNEXPECTED');
assert.equal(expanded,1,'EXPANDED_OWNER_NOT_UNIQUE');
assert(mobile>=1,'MOBILE_OWNER_MISSING');

const main=v.modules.find(m=>m.name===v.main_module)||v.modules.find(m=>m.name==='index.js');
assert(main,'MAIN_MISSING');
const mainText=Buffer.from(main.content_base64,'base64').toString('utf8');
for(const marker of [
  'B46_FULLMARKET_DARK10_YELLOW_DOT_20261111',
  'B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111',
  'B46_FULLMARKET_INSPECT_CACHE_20261110'
]) assert(mainText.includes(marker),'CURRENT_MARKER_MISSING_'+marker);

console.log('CURRENT_MARKERS_PRESERVED=1');
console.log('PIN_V2_PROD_AUDIT_PASS=1');
