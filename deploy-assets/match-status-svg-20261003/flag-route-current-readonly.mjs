import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw new Error('CLOUDFLARE_AUTH_MISSING');
const sha=b=>createHash('sha256').update(b).digest('hex');
const apiRoot=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function cf(path){const r=await fetch(apiRoot+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});const j=await r.json();if(!r.ok||j.success!==true)throw new Error(`CF_${r.status}:${JSON.stringify(j.errors||[])}`);return j.result;}
async function probe(origin,path){const u=new URL(path,origin);u.searchParams.set('flagRouteAudit',`${Date.now()}-${Math.random()}`);const r=await fetch(u,{headers:{'Cache-Control':'no-cache','Pragma':'no-cache','User-Agent':'Ball46-FlagRoute-Audit/1.0'},redirect:'follow'});const text=await r.text();return {url:u.toString(),status:r.status,ok:r.ok,sha:sha(text),bytes:Buffer.byteLength(text),headers:{age:r.headers.get('age'),cacheControl:r.headers.get('cache-control'),cfCacheStatus:r.headers.get('cf-cache-status'),etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified'),server:r.headers.get('server')},hasFlagScript:/league-flags-343\.js/.test(text),token343b:text.includes('343-league-flags-menu-143-20261004b'),hasLazy:text.includes("img.loading='lazy'"),hasEager:text.includes("img.loading='eager'"),sample:text.slice(0,180)};}
const dep=await cf('/workers/scripts/ball46-production/deployments?per_page=3');
const active=dep.deployments?.[0]?.versions||[];
const out={checkedAt:new Date().toISOString(),activeVersions:active,origins:{}};
for(const origin of ['https://www.ball46.com','https://ball46-production.mccarey-supon.workers.dev']){
  out.origins[origin]={index:await probe(origin,'/index.html'),flags:await probe(origin,'/league-flags-343.js')};
}
mkdirSync('audit/flag-route-current',{recursive:true});
writeFileSync('audit/flag-route-current/report.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
