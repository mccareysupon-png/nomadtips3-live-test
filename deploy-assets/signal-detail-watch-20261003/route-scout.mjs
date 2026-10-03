import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};

async function api(path){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{headers,signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);
  return j.result;
}
async function active(){
  const d=await api(`/scripts/${script}/deployments?per_page=3`);
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  return v[0].version_id;
}
function contexts(source,needle,radius=900){
  const out=[]; let at=0; const low=source.toLowerCase(), want=needle.toLowerCase();
  while((at=low.indexOf(want,at))!==-1&&out.length<10){
    out.push({at,text:source.slice(Math.max(0,at-radius),Math.min(source.length,at+needle.length+radius))});
    at+=needle.length;
  }
  return out;
}

const before=await active();
const version=await api(`/workers/${script}/versions/${before}?include=modules`);
const main=version.modules?.find(m=>m.name===version.main_module);
assert(main?.content_base64,'MAIN_MODULE_MISSING');
const source=Buffer.from(main.content_base64,'base64').toString('utf8');
const needles=['ASSETS.fetch','dashboard-v2-tune.css','__B46_SCOREBAR_TUNE_CSS__','new URL(request.url)','ui-sync-fixes-343-v2.js','Response(','pathname'];
const report={version:before,mainModule:version.main_module,bytes:Buffer.byteLength(source),hits:{}};
for(const n of needles){
  report.hits[n]=contexts(source,n);
  console.log(`ROUTE_NEEDLE ${n} hits=${report.hits[n].length}`);
  for(const hit of report.hits[n]) console.log(`--- ${n} @${hit.at} ---\n${hit.text}\n--- END ${n} ---`);
}
mkdirSync('audit',{recursive:true});
writeFileSync('audit/worker-route-scout.json',JSON.stringify(report,null,2));
assert.equal(await active(),before,'PRODUCTION_CHANGED_DURING_ROUTE_SCOUT');
console.log(`ROUTE_SCOUT_ACTIVE_VERSION=${before}`);
console.log('ROUTE_SCOUT_SUCCESS');
