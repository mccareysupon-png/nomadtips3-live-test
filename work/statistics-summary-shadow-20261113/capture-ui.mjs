// Current public HTML/static assets only. Never executes browser JS or calls data APIs.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const D='work/statistics-summary-shadow-20261113',A='62cb0db544160e6591342abd6b4f35cc',W='ball46-production',R=D+'/qa/ui-capture';
const sha=b=>createHash('sha256').update(b).digest('hex');await mkdir(R+'/files',{recursive:true});
const activeProof=JSON.parse(await readFile(D+'/source/active.json')),expected=activeProof.workers.find(x=>x.worker===W);
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});assert(r.ok,'CONTROL_HTTP_'+r.status);const j=await r.json();assert(j.success,'CONTROL_READ_FAILED');return j.result;}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return d.versions[0].version_id;}
assert.equal(await active(),expected.active,'WEBSITE_DRIFT_BEFORE_CAPTURE');
assert.equal((await cf('/workers/scripts/'+W+'/subdomain')).enabled,true,'WEBSITE_WORKERS_DEV_DISABLED_STOP');
const sub=(await cf('/workers/subdomain')).subdomain;assert(/^[a-z0-9-]+$/.test(sub));const origin='https://'+W+'.'+sub+'.workers.dev';
const files=[],seen=new Set(),pending=[],statsReferences=[];
async function get(path){assert(!path.startsWith('/api/'),'DATA_API_FORBIDDEN');const r=await fetch(new URL(path,origin),{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'STATIC_HTTP_'+r.status+':'+path);return {body:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||''};}
const root=await get('/');assert(root.type.includes('text/html'),'HTML_MISSING');const html=root.body.toString();await writeFile(R+'/index.html',root.body);
function enqueue(raw,base='/'){
 raw=raw.replaceAll('&amp;','&').trim();if(!raw||/^(data:|blob:|#)/.test(raw))return;
 let u;try{u=new URL(raw,new URL(base,origin));}catch{return;}
 if(![new URL(origin).hostname,'ball46.com','www.ball46.com'].includes(u.hostname))return;
 if(!/\.(?:js|mjs|css|png|webp|jpe?g|svg|avif|ico|woff2?|ttf)$/i.test(u.pathname))return;
 const path=u.pathname+u.search;if(!seen.has(path)){seen.add(path);pending.push(path);}
}
for(const m of html.matchAll(/<(?:script|link|img|source)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi))enqueue(m[1]);
for(const m of html.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi))enqueue(m[1]);
function refs(text,path){for(const m of text.matchAll(/.{0,70}(?:api\/engine\/statistics|BALL46_STATISTICS_DATA).{0,140}/g))if(statsReferences.length<35)statsReferences.push({path,code:m[0]});}
refs(html,'/');
while(pending.length){assert(files.length<200,'STATIC_RESOURCE_BOUND');const path=pending.shift(),{body,type}=await get(path),file=sha(path)+'.bin';await writeFile(R+'/files/'+file,body);files.push({path,file,type,sha:sha(body),bytes:body.length});if(type.includes('css'))for(const m of body.toString().matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi))enqueue(m[1],path);if(/javascript/.test(type)||/\.m?js(?:\?|$)/.test(path))refs(body.toString(),path);}
for(const name of ['/singlepage-workspace-343.js','/longterm-performance-343.js']){const f=files.find(f=>new URL(f.path,origin).pathname===name),known=expected.assets.find(a=>a.path.split('?')[0]===name);assert(f&&known,'REQUIRED_ASSET_MISSING_'+name);assert.equal(f.sha,known.sha,'PUBLIC_ASSET_HASH_DRIFT_'+name);}
assert.equal(await active(),expected.active,'WEBSITE_CHANGED_DURING_CAPTURE');
const report={ok:true,at:new Date().toISOString(),active:expected.active,mainSha:expected.sha,origin,htmlSha:sha(root.body),files,statsReferences,productionWrites:0,dataApiRequests:0,providerRequests:0};await writeFile(R+'/capture.json',JSON.stringify(report,null,2));console.log('UI_CAPTURE '+JSON.stringify({ok:true,active:report.active,assets:files.length,statsReferences}));
