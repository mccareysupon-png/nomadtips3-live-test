import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const ROOT='work/cloudflare-speed-audit-20261110',A='62cb0db544160e6591342abd6b4f35cc',W='ball46-production';
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(ROOT+'/fresh',{recursive:true});
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_READ_'+r.status);return j.result;}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{version:d.versions[0].version_id,deployment:d.id};}
async function get(path){const start=performance.now(),r=await fetch(new URL(path,'https://ball46.com'),{signal:AbortSignal.timeout(45000)}),ttfb=performance.now()-start,body=Buffer.from(await r.arrayBuffer());return{path,status:r.status,bytes:body.length,sha:sha(body),ttfbMs:Math.round(ttfb),totalMs:Math.round(performance.now()-start),headers:Object.fromEntries(['content-type','cache-control','etag','vary','cf-cache-status','content-encoding'].map(k=>[k,r.headers.get(k)])),body};}
const report={productionWrites:0,upstreamProviderRequests:0,at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID};
try{
report.active=await active();const v=await cf('/workers/workers/'+W+'/versions/'+report.active.version+'?include=modules');report.main=v.main_module;report.modules=v.modules.map(m=>({name:m.name,type:m.content_type,sha:sha(Buffer.from(m.content_base64,'base64'))}));report.configFingerprint={bindings:sha(JSON.stringify(v.bindings)),assets:sha(JSON.stringify(v.assets)),settings:sha(JSON.stringify(await cf('/workers/scripts/'+W+'/settings'))),cron:sha(JSON.stringify(await cf('/workers/scripts/'+W+'/schedules')))};
const main=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64');await writeFile(ROOT+'/fresh/index.mjs',main);const root=await get('/');assert.equal(root.status,200);const html=root.body.toString();await writeFile(ROOT+'/fresh/index.html',html);const{body,...meta}=root;report.root=meta;
const paths=[...new Set([...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)].map(m=>new URL(m[1],'https://ball46.com')).filter(u=>u.hostname==='ball46.com'&&/\.(?:js|css)$/.test(u.pathname)).map(u=>u.pathname+u.search))];assert(paths.length>10&&paths.length<100);report.files=[];
for(const path of paths){const{body,...meta}=await get(path);report.files.push(meta);await writeFile(ROOT+'/fresh/'+sha(path)+'.txt',body);}
report.activeAfter=await active();assert.deepEqual(report.activeAfter,report.active,'CONCURRENT_PRODUCTION_CHANGE');assert(report.files.every(f=>f.status===200),'MISSING_REFERENCED_ASSET');report.ok=true;
}catch(e){report.ok=false;report.error=String(e.stack);process.exitCode=1;}
await writeFile(ROOT+'/fresh/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,active:report.active,assets:report.files?.length,error:report.error}));