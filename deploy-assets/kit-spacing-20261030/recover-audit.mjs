import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {sha} from './patch.mjs';
const result=JSON.parse(await readFile('audit/result.json'));
const candidate=JSON.parse(await readFile('audit/candidate.json'));
const proof=JSON.parse(await readFile('audit/production-browser-proof.json'));
assert(result.ok&&result.activated&&proof.ok&&proof.noOverlap&&proof.consoleErrors===0);
assert.equal(proof.candidate,result.candidate);
assert.equal(result.candidate,'6eb383bc-42cb-4bb8-8c4d-0dc23cca3088');
assert.equal(result.base,'a661c3ca-66fc-4f22-90e9-cf96a06ebbf0');
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const worker='ball46-production';
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success);return j.result;}
async function active(w){const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
assert.deepEqual(await active(worker),result.active);
const settings=await cf('/workers/scripts/'+worker+'/settings'),schedules=await cf('/workers/scripts/'+worker+'/schedules'),domains=(await cf('/workers/domains')).filter(d=>d.service===worker).sort((a,b)=>a.hostname.localeCompare(b.hostname)),services={};
for(const w of new Set(settings.bindings.filter(b=>b.type==='service').map(b=>b.service)))services[w]=(await active(w)).id;
assert.equal(canonical({settings,schedules,domains,services}),canonical(result.configBefore));
const paths=[];
for(const host of ['https://ball46.com','https://www.ball46.com']){
 for(let n=0;n<candidate.expected.length;n+=5){await Promise.all(candidate.expected.slice(n,n+5).map(async x=>{const u=new URL(x.path,host);u.searchParams.set('spacingAudit',process.env.GITHUB_RUN_ID);const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});assert.equal(r.status,x.status);assert.equal(sha(Buffer.from(await r.arrayBuffer())),x.sha);paths.push({host,path:x.path,status:r.status});}));}
 for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1','/api/prediction-vote/health']){const r=await fetch(host+path),j=await r.json();assert(r.ok&&j.ok);if(path.endsWith('/board'))assert.equal(j.stale,false);}
}
const audit={ok:true,phase:'read-only audit recovery',run:process.env.GITHUB_RUN_ID,active:result.active,paths:paths.length,configPreserved:true,productionBrowserProof:proof.results.map(({width,rowCount,minGap})=>({width,rowCount,minGap})),settledPreserved:result.settledPreserved,at:new Date().toISOString(),trafficWrites:0};
await writeFile('audit/recovery.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
