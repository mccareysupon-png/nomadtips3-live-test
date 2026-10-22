import {createHash} from 'node:crypto';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,SCRIPT='ball46-production';
const link='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+SCRIPT+'/deployments?per_page=3';
const response=await fetch(link,{headers:{Authorization:'Bearer '+TOKEN}});
const api=await response.json();if(!api.success)throw Error(JSON.stringify(api.errors));
console.log('B46_V13_READONLY_ACTIVE_DEPLOYMENTS',JSON.stringify(api.result.deployments.map(x=>({id:x.id,created_on:x.created_on,versions:x.versions}))));
for(const base of ['https://ball46.com','https://www.ball46.com','https://83e1752e-ball46-production.mccarey-supon.workers.dev']){
 for(const p of ['/','/dashboard-v2-stage3-featured-facts-20261013a.js']){
  for(let i=0;i<3;i++){
   const url=new URL(p,base);url.searchParams.set('diag_v13',Date.now()+'-'+i);
   const r=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   const src=await r.text(),sha=createHash('sha256').update(src).digest('hex');
   console.log('B46_V13_READONLY_EDGE',JSON.stringify({base,p,i,status:r.status,sha,bytes:src.length,
     hasV13Style:src.includes('b46-globe-hidden-v13-20261022'),
     hasV13Script:src.includes('B46_V13_FEATURED_STABLE_RENDER'),
     hasV12:src.includes('V12 | Stabilize V11 team headings'),hasStat:src.includes('b46-statistics-no-old-flash-20261022'),
     server:r.headers.get('server'),cfCache:r.headers.get('cf-cache-status'),age:r.headers.get('age'),cfRay:r.headers.get('cf-ray'),
     contentType:r.headers.get('content-type')}));
  }
 }
}
