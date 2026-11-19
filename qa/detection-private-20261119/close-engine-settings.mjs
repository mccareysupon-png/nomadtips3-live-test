import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token);
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers',prod='nomadtips3-engine-343',origin='https://ball46.com',direct='https://nomadtips3-engine-343.mccarey-supon.workers.dev',test='https://ball46-sidebar-spacing-test-v3-20261119.mccarey-supon.workers.dev';
const tag='b46-engine-settings-private-20261119',entry='engine-settings-private-entry-20261119.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));fs.mkdirSync('evidence',{recursive:true});
const report={scope:'Owner-approved direct engine settings access closure, no engine logic changes',result:'INITIAL'};const save=()=>fs.writeFileSync('evidence/production-report.json',JSON.stringify(report,null,2));
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const d=await api('/scripts/'+prod+'/deployments?per_page=1');const v=d.deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100);return v[0].version_id}
async function version(id){const v=await api('/workers/'+prod+'/versions/'+id+'?include=modules');assert(v.main_module&&v.modules?.length);return v}
async function schedules(){const d=await api('/scripts/'+prod+'/schedules');return (Array.isArray(d)?d:d.schedules).map(x=>x.cron).sort()}
async function settings(){const s=await api('/scripts/'+prod+'/settings');const omit=new Set(['annotations','modified_on','created_on','updated_on','last_deployed_from','last_deployed_at','etag','version_id','deployment_id','tag','version']);return Object.fromEntries(Object.entries(s).filter(([k])=>!omit.has(k)).map(([k,v])=>[k,sha(canonical(v))]))}
async function pub(path,base=origin){let last;for(let i=0;i<3;i++){try{const u=new URL(path,base);if(!u.pathname.startsWith('/b46-receiver-v1/'))u.searchParams.set('b46QA',process.env.GITHUB_RUN_ID+'-'+Date.now());const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(r.ok)return await r.text();last=Error('HTTP '+u.pathname+' '+r.status)}catch(e){last=e}console.log('READ_RETRY '+path+' '+String(last));await delay(1000)}throw last}
async function health(){const out={};for(const [k,p]of [['engine','/api/engine/health'],['market','/api/full-market/health'],['board','/api/engine/board'],['signals','/api/engine/signals'],['graph','/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all']]){const j=JSON.parse(await pub(p));if(k==='signals')assert(Array.isArray(j.signals));else assert(j.ok===true,'HEALTH '+k);if(k==='board')assert(Array.isArray(j.fixtures));if(k==='graph')assert(j.source==='RECEIVER'&&j.summary.rows===j.summary.wins+j.summary.pushes+j.summary.losses);out[k]={ok:true,...(j.summary?{rows:j.summary.rows,sequence:j.sequence}:{}),...(Array.isArray(j.fixtures)?{count:j.fixtures.length}:{}),...(Array.isArray(j.signals)?{count:j.signals.length}:{})}}return out}
const manifest=v=>v.modules.map(m=>({name:m.name,hash:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
async function activate(id,msg){await api('/scripts/'+prod+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
async function upload(v,source){const listed=await api('/scripts/'+prod+'/versions?per_page=1');const latest=(listed.items||listed.versions||[])[0]?.id;assert.equal(latest,await active(),'LATEST_SECRET_SOURCE_MUST_BE_ACTIVE');const md={main_module:entry,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings.map(b=>({type:'inherit',name:b.name,version_id:'latest'})),annotations:{'workers/tag':tag,'workers/message':'Deny public access to engine settings; preserve internal service calls'}};if(v.assets?.config)md.assets={config:v.assets.config};if(v.placement)md.placement=v.placement;const f=new FormData();f.append('metadata',new Blob([JSON.stringify(md)],{type:'application/json'}),'metadata.json');for(const m of v.modules){assert(m.name!==entry);const type=m.content_type||(/\.m?js$/.test(m.name)?'application/javascript+module':m.name.endsWith('.bin')?'application/octet-stream':m.name.endsWith('.txt')?'text/plain':null);assert(type,'MODULE_TYPE '+m.name);f.append(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type}),m.name)}f.append(entry,new Blob([source],{type:'application/javascript+module'}),entry);return (await api('/scripts/'+prod+'/versions?bindings_inherit=strict',{method:'POST',body:f})).id}


let base,candidate,attempt=false;
async function probe(host,p,method='GET'){
 const r=await fetch(new URL(p,host),{method,redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
 const body=await r.text();return {status:r.status,body,cache:r.headers.get('cache-control')||''};
}
try{
 base=await active();report.rollback=base;save();console.log('ENGINE_BASE '+base);
 const v=await version(base);assert(v.modules.some(m=>m.name===v.main_module));
 const old=await probe(direct,'/settings');assert.equal(old.status,200,'EXPECTED_EXPOSED_SETTINGS');JSON.parse(old.body);
 assert.equal((await probe(origin,'/detection-test.html')).status,404);
 assert.equal((await probe(origin,'/api/engine/settings')).status,404);
 const source='import original from '+JSON.stringify('./'+v.main_module)+';\nexport * from '+JSON.stringify('./'+v.main_module)+';\nfunction blocked(url){const u=new URL(url);let p=u.pathname;try{for(let i=0;i<3;i++){const q=decodeURIComponent(p);if(q===p)break;p=q}}catch{}p=p.replace(/\\\\/g,"/").replace(/\\/{2,}/g,"/").replace(/\\/+$/,"").toLowerCase();return (p==="/settings"||p.startsWith("/settings/"))&&!["engine.internal","ball46-cron.internal"].includes(u.hostname.toLowerCase())}\nexport default {...original,async fetch(request,env,ctx){if(blocked(request.url))return new Response(request.method==="HEAD"?null:"Not Found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"}});return original.fetch(request,env,ctx)}};\n';
 const guard=source.slice(source.indexOf('function blocked'),source.indexOf('export default'));
 const blocked=new Function(guard+';return blocked')();
 const probes=['/settings','/settings?audit=1','/SETTINGS','/%73ettings','/settings/'];
 for(const p of probes){assert(blocked(direct+p));assert(blocked(origin+p));assert(!blocked('https://engine.internal'+p))}
 for(const p of ['/health','/board','/signals','/scan','/settle'])assert(!blocked(direct+p),'GUARD_OVERREACH');
 const baselineSettings=await settings(),crons=await schedules();report.backendBefore=await health();assert.equal(await active(),base);
 candidate=await upload(v,source);report.candidate=candidate;save();console.log('ENGINE_STAGED '+candidate);
 const cv=await version(candidate);assert.equal(cv.main_module,entry);assert.equal(canonical(cv.bindings),canonical(v.bindings));assert.equal(canonical(cv.assets?.config),canonical(v.assets?.config));assert.equal(cv.compatibility_date,v.compatibility_date);assert.equal(canonical(cv.compatibility_flags||[]),canonical(v.compatibility_flags||[]));assert.equal(canonical(cv.placement),canonical(v.placement));
 assert.deepEqual(manifest(cv),[...manifest(v),{name:entry,hash:sha(source)}].sort((a,b)=>a.name.localeCompare(b.name)));
 assert.equal(await active(),base);assert.deepEqual(await settings(),baselineSettings);assert.deepEqual(await schedules(),crons);
 attempt=true;await activate(candidate,'Owner-approved direct settings privacy only');
 let result;for(let i=0;i<15;i++){
  result=await Promise.all(probes.map(async p=>{try{const r=await probe(direct,p);return {path:p.split('?')[0],status:r.status,blocked:r.status===404&&r.body==='Not Found'&&r.cache.includes('no-store')}}catch{return {path:p,status:0,blocked:false}}}));
  if(result.every(r=>r.blocked))break;await delay(1200);
 }
 report.access=result;save();assert(result.every(r=>r.blocked),'UPSTREAM_CLOSURE_NOT_CONFIRMED');
 assert.equal((await probe(direct,'/settings','HEAD')).status,404);
 assert.equal((await probe(origin,'/detection-test.html')).status,404);assert.equal((await probe(origin,'/api/engine/settings')).status,404);
 report.backendAfter=await health();assert.equal(await active(),candidate);assert.deepEqual(await settings(),baselineSettings);assert.deepEqual(await schedules(),crons);
 report.result='SUCCESS';report.active=candidate;save();
 console.log('UPSTREAM_SETTINGS_PRIVATE_PASS '+JSON.stringify({version:candidate,rollback:base,blocked:result,head:404,backend:report.backendAfter,originalModulesUnchanged:true}));
}catch(e){report.result='FAIL';report.error=String(e);try{report.actualActive=await active()}catch{} save();console.error('UPSTREAM_SETTINGS_PRIVATE_STOP '+JSON.stringify({base,candidate,attempt,actualActive:report.actualActive,error:report.error}));process.exitCode=1}
