import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw new Error('CLOUDFLARE_AUTH_MISSING');
const sha=b=>createHash('sha256').update(b).digest('hex');
const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
const base='https://api.cloudflare.com/client/v4';
async function get(url){try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});const text=await r.text();let j=null;try{j=JSON.parse(text)}catch{};return {status:r.status,ok:r.ok,result:j?.result??null,errors:j?.errors??null};}catch(e){return {status:0,ok:false,result:null,errors:[{message:e.message}]};}}
async function cf(path){const x=await get(`${base}/accounts/${account}${path}`);if(!x.ok)throw new Error(`CF_${x.status}:${JSON.stringify(x.errors||[])}`);return x.result;}
async function probe(origin,path){const u=new URL(path,origin);u.searchParams.set('flagRouteAudit',`${Date.now()}-${Math.random()}`);const r=await fetch(u,{headers:{'Cache-Control':'no-cache','Pragma':'no-cache','User-Agent':'Ball46-FlagRoute-Audit/2.0'},redirect:'follow'});const text=await r.text();return {url:u.toString(),status:r.status,ok:r.ok,sha:sha(text),bytes:Buffer.byteLength(text),headers:{age:r.headers.get('age'),cacheControl:r.headers.get('cache-control'),cfCacheStatus:r.headers.get('cf-cache-status'),etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified'),server:r.headers.get('server')},hasFlagScript:/league-flags-343\.js/.test(text),token343b:text.includes('343-league-flags-menu-143-20261004b'),hasLazy:text.includes("img.loading='lazy'"),hasEager:text.includes("img.loading='eager'"),sample:text.slice(0,180)};}
const dep=await cf('/workers/scripts/ball46-production/deployments?per_page=3');
const active=dep.deployments?.[0]?.versions||[];
const out={checkedAt:new Date().toISOString(),activeVersions:active,origins:{},zoneAudit:null};
for(const origin of ['https://www.ball46.com','https://ball46-production.mccarey-supon.workers.dev']){
  out.origins[origin]={index:await probe(origin,'/index.html'),flags:await probe(origin,'/league-flags-343.js')};
}
const zoneLookup=await get(`${base}/zones?name=ball46.com&account.id=${encodeURIComponent(account)}`);
const zones=Array.isArray(zoneLookup.result)?zoneLookup.result:[];
const zone=zones.find(z=>z?.name==='ball46.com')||zones[0];
out.zoneAudit={lookup:{status:zoneLookup.status,ok:zoneLookup.ok,errors:zoneLookup.errors},zone:zone?{id:zone.id,name:zone.name,status:zone.status,paused:zone.paused,type:zone.type}:null,cacheRules:null,pageRules:null,workerRoutes:null};
if(zone?.id){
  out.zoneAudit.cacheRules=await get(`${base}/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`);
  out.zoneAudit.pageRules=await get(`${base}/zones/${zone.id}/pagerules?status=active&per_page=100`);
  out.zoneAudit.workerRoutes=await get(`${base}/zones/${zone.id}/workers/routes`);
}
mkdirSync('audit/flag-route-current',{recursive:true});
writeFileSync('audit/flag-route-current/report.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
