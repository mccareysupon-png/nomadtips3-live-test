import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers',origin='https://ball46.com';
const targets=['/api/engine/settings','/api/engine/scan'];
async function api(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status);return j.result}
async function get(url){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});return{status:r.status,type:r.headers.get('content-type')||'',body:await r.text()}}
const dep=(await api('/scripts/ball46-production/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await api('/workers/ball46-production/versions/'+dep+'?include=modules');
const hits=[];
for(const m of v.modules){if(!/\.(?:m?js|html|txt)$/.test(m.name))continue;const src=Buffer.from(m.content_base64,'base64').toString();
 for(const p of targets){const count=src.split(p).length-1;if(count)hits.push({module:m.name,path:p,count});}}
console.log('MODULE_REFERENCE_COUNTS '+JSON.stringify(hits));
const pageHits=[];
for(const url of [origin+'/',origin+'/index.html?view=signal',origin+'/index.html?view=statistics', 'https://member.ball46.com/','https://member2.ball46.com/']){
 try{const h=await get(url);let refs=targets.filter(p=>h.body.includes(p));const scripts=[...new Set([...h.body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>new URL(m[1],url).href))].filter(u=>/https:\/\/(?:[^/]+\.)?ball46\.com\//.test(u)).slice(0,50);
 const found=[];await Promise.all(scripts.map(async u=>{try{const r=await get(u);const paths=targets.filter(p=>r.body.includes(p));if(paths.length)found.push({script:new URL(u).pathname,paths})}catch{}}));
 pageHits.push({page:new URL(url).hostname+new URL(url).pathname,status:h.status,inlineRefs:refs,scriptRefs:found,scriptCount:scripts.length});
 }catch(e){pageHits.push({page:new URL(url).hostname,status:0,error:e.name})}
}
console.log('PUBLIC_UI_REFERENCE_AUDIT '+JSON.stringify(pageHits));
for(const host of [origin,'https://ball46-production.mccarey-supon.workers.dev','https://nomadtips3-engine-343.mccarey-supon.workers.dev','https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev']){
 for(const p of targets){try{const r=await get(host+p);let j=null;try{j=JSON.parse(r.body)}catch{}
 let numbers=0,objects=0,ruleKeys=0;function walk(x){if(typeof x==='number')numbers++;else if(x&&typeof x==='object'){objects++;for(const [k,val]of Object.entries(x)){if(/threshold|condition|rule|criteria|min|max|odds|market|setting|config|signal/i.test(k))ruleKeys++;walk(val)}}}walk(j);
 console.log('ENDPOINT_AUDIT '+JSON.stringify({host,path:p,status:r.status,json:!!j,numbers,objects,ruleKeys,bytes:Buffer.byteLength(r.body)}));
 }catch(e){console.log('ENDPOINT_AUDIT '+JSON.stringify({host,path:p,status:0,error:e.name}))}}
}
