import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const id=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const url='https://api.cloudflare.com/client/v4/accounts/'+id+'/workers/scripts/ball46-production/deployments?per_page=1';
const x=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}).then(r=>r.json());
assert(x.success);
console.log('STATS_PC_V23_CURRENT_ACTIVE',JSON.stringify(x.result.deployments[0].versions));
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const base of ['https://ball46.com','https://www.ball46.com','https://b1ec3645-ball46-production.mccarey-supon.workers.dev']){
 for(const path of ['/', '/index.html']){
  const u=base+path+'?stats_v23_recovery='+Date.now()+Math.random();
  const r=await fetch(u,{signal:AbortSignal.timeout(35000),headers:{'Cache-Control':'no-cache'}});
  const s=await r.text();
  const p={url:u,status:r.status,sha:hash(s),len:s.length,marker:s.includes('b46-statistics-pc-single-row-v23-preview-20261020'),ribbon:s.includes('b46-statistics-v23-single-row-14-20261020'),themeBoot:s.includes('b46-statistics-pc-v2-preview-theme'),stats:s.includes('sp-stats-content'),headTag:s.match(/<head[^>]*>/)?.[0]};
  console.log('STATS_PC_V23_PUBLIC_HASH',JSON.stringify(p));
 }
}
