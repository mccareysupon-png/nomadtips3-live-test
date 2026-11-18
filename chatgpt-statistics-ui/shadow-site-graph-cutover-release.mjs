// Owner-approved website statistics-only cutover. Exact active modules retained.
// Receiver + Engine untouched. Inactive version API upload; live activation only after real browser checks.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {patchChart,patchWorkspace,patchFastClient} from './shadow-site-graph-cutover-patch.mjs';
import {browserQA} from './shadow-site-graph-cutover-browser.mjs';
const SITE='ball46-production',ENGINE='nomadtips3-engine-343',RECEIVER='ball46-shadow-receiver-production';
const BASE='f5d9cf21-4b41-46da-bdd8-a841fa733d82',ENG='db65134e-a12d-4084-937e-3ce6e986c251',REC='55a7638c-d6e4-4698-9ad4-b3e1f821ed5f';
const ROOT='/accounts/62cb0db544160e6591342abd6b4f35cc',API='https://api.cloudflare.com/client/v4';
const DIRECT='https://ball46-production.mccarey-supon.workers.dev',PUBLIC='https://www.ball46.com',RECV='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev';
const token=process.env.CLOUDFLARE_API_TOKEN;assert(token,'WORKERS_TOKEN_MISSING');
const auditKey=createHmac('sha256',token).update('ball46/receiver/https-audit/v1/20261118').digest('hex');console.log('::add-mask::'+auditKey);
const hash=x=>createHash('sha256').update(x).digest('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const audit=process.env.RUNNER_TEMP+'/b46-site-release';await mkdir(audit,{recursive:true});
let candidate=null,activated=false;
async function cf(p,method='GET',body){
 if(method!=='GET')assert(method==='POST'&&[ROOT+'/workers/scripts/'+SITE+'/versions?bindings_inherit=strict',ROOT+'/workers/scripts/'+SITE+'/deployments'].includes(p),'WRITE_SCOPE');
 const r=await fetch(API+p,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error('CF_'+method+'_'+r.status+'_'+(d.errors??[]).map(x=>x.code).join('_'));return d.result;
}
async function active(n){const v=(await cf(ROOT+'/workers/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100,'TRAFFIC_DRIFT_'+n);return v[0].version_id}
async function guard(id){assert.equal(await active(SITE),id,'SITE_DRIFT');assert.equal(await active(ENGINE),ENG,'ENGINE_DRIFT');assert.equal(await active(RECEIVER),REC,'RECEIVER_DRIFT')}
async function version(id){for(let i=0;i<10;i++){try{return await cf(ROOT+'/workers/workers/'+SITE+'/versions/'+id+'?include=modules')}catch(e){if(i===9||!String(e).includes('10071'))throw e;await wait(1500)}}}
async function assign(id){await cf(ROOT+'/workers/scripts/'+SITE+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-approved statistics graph only; original history and all routes retained'}})}
async function waitActive(id){for(let i=0;i<12;i++){if(await active(SITE)===id)return;await wait(1500)}throw Error('ACTIVE_VERSION_NOT_CONFIRMED')}
async function http(host,path,key){
 const t=performance.now(),r=await fetch(host+path,{method:'GET',redirect:'manual',headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-StatisticsRelease',...(key?{authorization:'Bearer '+key}:{})},signal:AbortSignal.timeout(25000)});
 const body=Buffer.from(await r.arrayBuffer());let data=null;try{data=JSON.parse(body.toString())}catch{}
 return {status:r.status,type:r.headers.get('content-type')??'',source:r.headers.get('x-b46-statistics-source'),body,data,ms:Math.round(performance.now()-t)};
}
async function pristine(host){const r=await http(host,'/bulk-odds-compat-343.js');assert(r.status===200&&r.body.length>0,'LIVE_ASSET_HTTP');return hash(r.body)}
async function health(host){for(const p of ['/','/?view=statistics']){const r=await http(host,p);assert(r.status===200&&r.type.includes('text/html')&&r.body.length>1000,'PAGE_HTTP_'+p+'_'+r.status)}}
const markets=['all','AH','1X2','O/U','Corners','BTTS','Cards','Other'];
const query=m=>new URLSearchParams({market:m,variant:'all',filter:'all',range:'all'}).toString();
async function graphParity(host){
 const times=[];
 for(const m of markets){
  let passed=false;
  for(let i=0;i<4;i++){
   const [a,b]=await Promise.all([http(RECV,'/audit-projection-graph-v1?'+query(m),auditKey),http(host,'/b46-receiver-v1/graph?'+query(m))]);
   if(a.status===200&&b.status===200&&b.source==='RECEIVER'&&a.data?.sequence===b.data?.sequence){
    assert.equal(b.data.source,'RECEIVER');assert.deepEqual(b.data.summary,a.data.summary,'SUMMARY_'+m);assert.deepEqual(b.data.series,a.data.series,'SERIES_'+m);assert.deepEqual(b.data.counts,a.data.counts,'COUNTS_'+m);
    times.push({market:m,ms:b.ms,settled:b.data.summary.rows,sequence:b.data.sequence});passed=true;break;
   }
   await wait(1000);
  }
  assert(passed,'COHERENT_GRAPH_PARITY_'+m);
 }
 console.log('CUTOVER_GRAPH_PARITY='+JSON.stringify({host,markets:times,scope:'SETTLED_GRAPHS_ONLY'}));
 return times;
}
try{
 await guard(BASE);
 const [st,book]=await Promise.all([http(RECV,'/audit-projection-status-v1',auditKey),http(RECV,'/audit-statistics-summary-v1',auditKey)]);
 assert(st.status===200&&st.data?.graphReady&&st.data?.projection?.lastError===null&&st.data?.bookSequence===st.data?.projection?.sequence&&book.status===200&&book.data?.total>=16122,'RECEIVER_GRAPH_NOT_READY');
 console.log('CUTOVER_PRECHECK='+JSON.stringify({settled:book.data.total,sequence:st.data.bookSequence,graphReady:true,pendingCoverage:st.data.pendingLiveReady,scope:'SETTLED_GRAPHS_ONLY_PENDING_HISTORY_LEGACY'}));
 const base=await version(BASE),settings=await cf(ROOT+'/workers/scripts/'+SITE+'/settings'),subdomain=await cf(ROOT+'/workers/scripts/'+SITE+'/subdomain');
 assert(base.main_module==='statistics-fast-v1-release-20261116.mjs'&&base.modules?.length===52,'BASE_MODULE_DRIFT');
 assert(subdomain.enabled===true&&subdomain.previews_enabled===true,'INACTIVE_PREVIEW_UNAVAILABLE');
 const bindings=base.bindings??[];assert(!bindings.some(x=>x.name==='B46_MARKET_READER'),'BINDING_ALREADY_EXISTS');
 const originalLiveHash=await pristine(DIRECT);await health(DIRECT);
 const edits=[['/longterm-performance-343.js',patchChart,'patchChart'],['/singlepage-workspace-343.js',patchWorkspace,'patchWorkspace'],['/b46-statistics-fast-v1-20261116.js',patchFastClient,'patchFastClient']],paths=[];
 for(const [p,patch,name] of edits){
  const r=await http(DIRECT,p);assert(r.status===200&&r.body.length>1000,'SOURCE_READ_'+p);
  const old=r.body.toString('utf8'),next=patch(old);assert.notEqual(old,next);new Function(next);
  paths.push({path:p,name,hash:hash(Buffer.from(next)),baseHash:hash(r.body)});
  await writeFile(audit+'/'+p.slice(1),next);
 }
 const proxyName='b46-site-graph-cutover-20261118.mjs',patchName='b46-site-graph-patch-20261118.mjs',wrapper='b46-site-graph-entry-20261118.mjs';
 const proxy=await readFile(new URL('./shadow-site-graph-cutover.mjs',import.meta.url),'utf8'),patch=await readFile(new URL('./shadow-site-graph-cutover-patch.mjs',import.meta.url),'utf8');
 const wrapperCode='import orig from "./'+base.main_module+'";\nexport * from "./'+base.main_module+'";\nimport {withGraphCutover} from "./'+proxyName+'";\nimport {patchChart,patchWorkspace,patchFastClient} from "./'+patchName+'";\nexport default withGraphCutover(orig,{'+paths.map(p=>JSON.stringify(p.path)+':'+p.name).join(',')+'});\n';
 const added=[{name:patchName,content_type:'application/javascript+module',content_base64:Buffer.from(patch).toString('base64')},{name:proxyName,content_type:'application/javascript+module',content_base64:Buffer.from(proxy).toString('base64')},{name:wrapper,content_type:'application/javascript+module',content_base64:Buffer.from(wrapperCode).toString('base64')}];
 const modules=[...base.modules,...added],compressed=modules.reduce((n,m)=>n+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);console.log('CUTOVER_SIZE='+JSON.stringify({compressed,limit:10*1024*1024,addedModules:added.length}));assert(compressed<10*1024*1024-100*1024,'WORKER_SIZE_LIMIT');
 const newBinding={name:'B46_MARKET_READER',type:'service',service:RECEIVER,environment:'production',entrypoint:'MarketStatisticsReader'};
 const meta={main_module:wrapper,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags??[],bindings:[...bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:BASE}:b),newBinding],keep_assets:true,annotations:{'workers/message':'Settled statistics graph cutover; keep all base assets/bindings and original history routes'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const m of modules)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 await guard(BASE);candidate=(await cf(ROOT+'/workers/scripts/'+SITE+'/versions?bindings_inherit=strict','POST',form)).id;assert(candidate&&candidate!==BASE);
 const v=await version(candidate),vm=new Map(v.modules.map(m=>[m.name,m]));
 assert.equal(v.main_module,wrapper);assert.equal(v.modules.length,modules.length);assert.equal(v.compatibility_date,base.compatibility_date);assert.equal(canon(v.compatibility_flags??[]),canon(base.compatibility_flags??[]));assert.equal(canon(v.assets?.config),canon(base.assets?.config));
 for(const m of modules){const n=vm.get(m.name);assert(n&&n.content_type===m.content_type&&hash(Buffer.from(n.content_base64,'base64'))===hash(Buffer.from(m.content_base64,'base64')),'MODULE_HASH_DRIFT_'+m.name)}
 assert.equal(v.bindings.length,bindings.length+1);for(const b of bindings){const n=v.bindings.find(x=>x.name===b.name);assert(n&&n.type===b.type,'BINDING_DRIFT_'+b.name);if(b.type!=='secret_text')assert.equal(canon(n),canon(b),'BINDING_RESOURCE_DRIFT_'+b.name)}
 const nb=v.bindings.find(b=>b.name===newBinding.name);assert(nb?.type==='service'&&nb.service===RECEIVER&&nb.entrypoint==='MarketStatisticsReader','NAMED_BINDING_DRIFT');
 const preview='https://'+candidate.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';
 console.log('CUTOVER_CANDIDATE='+JSON.stringify({id:candidate,preview,rollback:BASE,originalModules:52,addedModules:added.length,originalBindings:bindings.length,addedBindings:1,routeWrites:0,scope:'GRAPH_ONLY'}));
 await writeFile(audit+'/candidate.json',JSON.stringify({candidate,preview,rollback:BASE,paths},null,2));
 // Edge propagation: retry GET only; all other paths are delegated unchanged.
 for(let i=0;i<12;i++){const r=await http(preview,paths[0].path);if(r.status===200&&hash(r.body)===paths[0].hash)break;if(i===11)throw Error('PREVIEW_ASSET_UNAVAILABLE');await wait(1500)}
 for(const p of paths){const r=await http(preview,p.path);assert(r.status===200&&hash(r.body)===p.hash,'CANDIDATE_PATCH_MISMATCH_'+p.path)}
 assert.equal(await pristine(preview),originalLiveHash,'LIVE_ASSET_CHANGED');await health(preview);
 await graphParity(preview);
 await browserQA(preview,'candidate',{full:true});
 await guard(BASE);
 // Existing source of historical rows/Pending, other API paths and routes unchanged.
 await assign(candidate);activated=true;await waitActive(candidate);await guard(candidate);
 await health(DIRECT);await health(PUBLIC);
 for(const p of paths){const r=await http(DIRECT,p.path);assert(r.status===200&&hash(r.body)===p.hash,'LIVE_PATCH_MISMATCH_'+p.path)}
 assert.equal(await pristine(DIRECT),originalLiveHash,'LIVE_ASSET_CHANGED');const live=await graphParity(PUBLIC);
 await browserQA(PUBLIC,'production',{full:false});await guard(candidate);
 console.log('CUTOVER_PRODUCTION_SUCCESS='+JSON.stringify({active:candidate,rollback:BASE,graphs:live,publicSource:'RECEIVER_SETTLED_GRAPH',legacyHistory:true,legacyPending:true,engineChanged:false,receiverChanged:false,routeWrites:0,bookReset:false}));
}catch(e){
 console.log('CUTOVER_STOP='+JSON.stringify({error:String(e.message).slice(0,450),candidate,activated}));
 if(candidate&&await active(SITE)===candidate){await assign(BASE);await waitActive(BASE);await guard(BASE);console.log('CUTOVER_ROLLBACK='+BASE)}
 throw e;
}
