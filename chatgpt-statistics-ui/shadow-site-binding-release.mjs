// Authorized binding-only production release. Does NOT switch statistics sources or edit routes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {collect} from './shadow-seed-snapshot.mjs';
import {readFullBook,compare,auditCredential} from './shadow-seed-audit.mjs';
const SITE='ball46-production',ENGINE='nomadtips3-engine-343',RECEIVER='ball46-shadow-receiver-production';
const EXPECTED='f5d9cf21-4b41-46da-bdd8-a841fa733d82',ENG='db65134e-a12d-4084-937e-3ce6e986c251',REC='c04ec442-b6af-47f4-859c-a29fabc6f37b';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',API='https://api.cloudflare.com/client/v4',ROOT='/accounts/'+ACCOUNT;
const DIRECT='https://ball46-production.mccarey-supon.workers.dev',PUBLIC='https://www.ball46.com';
const RECV='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev',PROBE='/_b46/internal/receiver-preflight-v1';
const token=process.env.CLOUDFLARE_API_TOKEN;assert(token,'MISSING_WORKERS_TOKEN');
const auditKey=auditCredential(),probeKey=createHmac('sha256',token).update('ball46/site/binding-preflight/v1/20261118').digest('hex');
console.log('::add-mask::'+auditKey);console.log('::add-mask::'+probeKey);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),hash=x=>createHash('sha256').update(x).digest('hex');
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
let candidate=null,activated=false;
async function cf(p,method='GET',body,credential=token){
 if(method!=='GET')assert(method==='POST'&&[ROOT+'/workers/scripts/'+SITE+'/versions?bindings_inherit=strict',ROOT+'/workers/scripts/'+SITE+'/deployments'].includes(p),'WRITE_SCOPE');
 const r=await fetch(API+p,{method,headers:{authorization:'Bearer '+credential,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error('CF_'+method+'_'+r.status+'_'+(d.errors??[]).map(e=>e.code).join('_'));return d.result;
}
async function active(n){
 const d=(await cf(ROOT+'/workers/scripts/'+n+'/deployments?per_page=1')).deployments[0];
 assert(d.versions.length===1&&Number(d.versions[0].percentage)===100,'TRAFFIC_DRIFT_'+n);return d.versions[0].version_id;
}
async function guard(id){assert.equal(await active(SITE),id,'SITE_DRIFT');assert.equal(await active(ENGINE),ENG,'ENGINE_DRIFT');assert.equal(await active(RECEIVER),REC,'RECEIVER_DRIFT')}
async function version(id){for(let i=0;i<10;i++)try{return await cf(ROOT+'/workers/workers/'+SITE+'/versions/'+id+'?include=modules')}catch(e){if(i===9||!String(e).includes('10071'))throw e;await wait(1500)}}
async function assign(id){await cf(ROOT+'/workers/scripts/'+SITE+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Binding-only preflight; public statistics source unchanged'}})}
async function waitActive(id){for(let i=0;i<12;i++){if(await active(SITE)===id)return;await wait(1500)}throw Error('ACTIVE_VERSION_NOT_CONFIRMED')}
async function http(host,path,key){
 const r=await fetch(host+path,{method:'GET',redirect:'manual',headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Binding-Preflight',...(key?{authorization:'Bearer '+key}:{})},signal:AbortSignal.timeout(25000)});
 const body=Buffer.from(await r.arrayBuffer());let data=null;try{data=JSON.parse(body.toString())}catch{}
 return {status:r.status,type:r.headers.get('content-type')??'',bytes:body.length,body,data};
}
const staticPaths=['/singlepage-workspace-343.js','/longterm-performance-343.js','/bulk-odds-compat-343.js','/b46-statistics-fast-v1-20261116.js'];
async function fingerprints(host){const out={};for(const p of staticPaths){const r=await http(host,p);assert(r.status===200&&r.bytes>0,'STATIC_HTTP_'+p+'_'+r.status);out[p]=hash(r.body)}return out}
async function siteHealth(host){
 for(const p of ['/','/?view=statistics']){const r=await http(host,p);assert(r.status===200&&r.type.includes('text/html')&&r.bytes>1000,'PAGE_HTTP_'+p+'_'+r.status)}
 for(const p of ['/b46-fast-v1/head','/b46-fast-v1/chart']){const r=await http(host,p);assert(r.status===200&&r.type.includes('application/json')&&r.data?.ok,'LEGACY_SOURCE_HTTP_'+p+'_'+r.status)}
}
async function probe(host){
 for(let i=0;i<4;i++){
  const a=await http(RECV,'/audit-statistics-summary-v1',auditKey),p=await http(host,PROBE,probeKey),b=await http(RECV,'/audit-statistics-summary-v1',auditKey);
  if(a.status===200&&p.status===200&&b.status===200&&p.type.includes('application/json')&&p.data?.ok&&a.data?.total===b.data?.total&&p.data.settled===b.data.total&&Math.abs(p.data.pnl-b.data.total_pnl)<1e-7&&p.data.publicSourceChanged===false){
   const unauth=await http(host,PROBE),wrong=await http(host,PROBE,'0'.repeat(64));
   assert.equal(unauth.status,403);assert.equal(wrong.status,403);
   console.log('SITE_BINDING_PROBE='+JSON.stringify({host,http:p.status,...p.data,unauth:unauth.status,wrong:wrong.status}));return p.data;
  }
  console.log('SITE_BINDING_PROBE_RETRY='+JSON.stringify({host,attempt:i+1,http:p.status,error:p.data?.error??null,sourceBefore:a.data?.total??null,sourceAfter:b.data?.total??null}));await wait(1500);
 }throw Error('SITE_BINDING_PROBE_NOT_VERIFIED');
}
try{
 const cfg=await readFile(new URL('./wrangler.production.toml',import.meta.url),'utf8');
 assert(cfg.includes('name = "ball46-production"')&&cfg.includes('account_id = "'+ACCOUNT+'"')&&cfg.includes('entrypoint = "MarketStatisticsReader"'),'PRODUCTION_MANIFEST_DRIFT');
 await guard(EXPECTED);
 // Check route privileges, but do not write routes or use a wider token to bypass restrictions.
 const routeToken=process.env.CLOUDFLARE_ROUTES_TOKEN||token;
 try{
  const z=await cf('/zones?name=ball46.com&account.id='+ACCOUNT,'GET',undefined,routeToken);
  assert(z.length===1);const routes=await cf('/zones/'+z[0].id+'/workers/routes','GET',undefined,routeToken);
  console.log('SITE_ROUTE_READ='+JSON.stringify({http:200,routes:routes.map(x=>({pattern:x.pattern,script:x.script??null})),routeEditVerified:false}));
 }catch(e){console.log('SITE_ROUTE_READ_LIMIT='+JSON.stringify({error:String(e.message),routeEditVerified:false,routeWrites:0}))}
 for(const path of ['/audit-projection-status-v1','/audit-projection-graph-v1','/audit-projection-pending-v1?limit=1']){
  const r=await http(RECV,path,auditKey);console.log('SITE_DIRECT_RECEIVER_CONTROL='+JSON.stringify({path,http:r.status,ok:r.data?.ok??null}));assert(r.status===200&&r.data?.ok,'DIRECT_RECEIVER_NOT_READY');
 }
 const src=await collect({includeRaw:true}),book=await readFullBook(auditKey);
 assert(compare(src,book).exact,'CANONICAL_BOOK_PARITY_FAILED');
 console.log('SITE_BASELINE_PARITY='+JSON.stringify({settled:book.totals.total,pending:src.other.PENDING,exact:true}));
 const base=await version(EXPECTED),settings=await cf(ROOT+'/workers/scripts/'+SITE+'/settings'),subdomain=await cf(ROOT+'/workers/scripts/'+SITE+'/subdomain');
 assert(base.main_module==='statistics-fast-v1-release-20261116.mjs'&&base.modules?.length===52,'PRODUCTION_MODULE_DRIFT');
 assert(subdomain.enabled===true&&subdomain.previews_enabled===true,'INACTIVE_PREVIEW_UNAVAILABLE');
 const bindings=base.bindings??[];
 assert(!bindings.some(b=>['B46_MARKET_READER','B46_SITE_PROBE_TOKEN'].includes(b.name)),'NEW_BINDING_ALREADY_EXISTS');
 const staticHashes=await fingerprints(DIRECT);await siteHealth(DIRECT);
 const probeModule='b46-site-receiver-probe-20261118.mjs',wrapper='b46-site-receiver-preflight-entry-20261118.mjs';
 const probeCode=await readFile(new URL('./shadow-site-binding-probe.mjs',import.meta.url),'utf8');
 const wrapperCode='import original from "./'+base.main_module+'";\nexport * from "./'+base.main_module+'";\nimport {withReceiverProbe} from "./'+probeModule+'";\nexport default withReceiverProbe(original);\n';
 const added=[{name:probeModule,content_type:'application/javascript+module',content_base64:Buffer.from(probeCode).toString('base64')},{name:wrapper,content_type:'application/javascript+module',content_base64:Buffer.from(wrapperCode).toString('base64')}];
 const modules=[...base.modules,...added];assert(modules.reduce((n,m)=>n+gzipSync(Buffer.from(m.content_base64,'base64')).length,0)<10*1024*1024-100*1024,'WORKER_SIZE_LIMIT');
 const newBinding={name:'B46_MARKET_READER',type:'service',service:RECEIVER,environment:'production',entrypoint:'MarketStatisticsReader'};
 const meta={main_module:wrapper,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags??[],bindings:[...bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:EXPECTED}:b),newBinding,{name:'B46_SITE_PROBE_TOKEN',type:'secret_text',text:probeKey}],keep_assets:true,annotations:{'workers/message':'Pre-cutover binding only; no public source or route changes'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of modules)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 await guard(EXPECTED);
 candidate=(await cf(ROOT+'/workers/scripts/'+SITE+'/versions?bindings_inherit=strict','POST',form)).id;
 assert(candidate&&candidate!==EXPECTED,'INVALID_CANDIDATE');
 const v=await version(candidate),vm=new Map(v.modules.map(m=>[m.name,m]));
 assert.equal(v.main_module,wrapper);assert.equal(v.modules.length,54);assert.equal(v.compatibility_date,base.compatibility_date);assert.equal(canon(v.compatibility_flags??[]),canon(base.compatibility_flags??[]));assert.equal(canon(v.assets?.config),canon(base.assets?.config));
 for(const m of modules){const n=vm.get(m.name);assert(n&&n.content_type===m.content_type&&hash(Buffer.from(n.content_base64,'base64'))===hash(Buffer.from(m.content_base64,'base64')),'MODULE_HASH_DRIFT_'+m.name)}
 assert.equal(v.bindings.length,bindings.length+2);for(const b of bindings){const n=v.bindings.find(x=>x.name===b.name);assert(n&&n.type===b.type,'BINDING_DRIFT_'+b.name);if(b.type!=='secret_text')assert.equal(canon(n),canon(b),'BINDING_RESOURCE_DRIFT_'+b.name)}
 const nb=v.bindings.find(b=>b.name===newBinding.name);assert(nb?.type==='service'&&nb.service===RECEIVER&&nb.entrypoint==='MarketStatisticsReader','NAMED_BINDING_DRIFT');
 assert(v.bindings.some(x=>x.name==='B46_SITE_PROBE_TOKEN'&&x.type==='secret_text'));
 console.log('SITE_BINDING_CANDIDATE='+JSON.stringify({candidate,rollback:EXPECTED,unchangedModules:52,addedModules:2,existingBindingsRetained:bindings.length,assetsRetained:true,routeWrites:0}));
 const preview='https://'+candidate.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';
 await probe(preview);assert.deepEqual(await fingerprints(preview),staticHashes,'PREVIEW_STATIC_DRIFT');await siteHealth(preview);
 if(process.env.B46_BINDING_DIAGNOSTIC_ONLY==='1'){console.log('SITE_BINDING_DIAGNOSTIC_PASS='+JSON.stringify({candidate,activated:false}));process.exit(0)}
 await guard(EXPECTED);
 await assign(candidate);activated=true;await waitActive(candidate);await guard(candidate);
 const live=await probe(DIRECT);await probe(PUBLIC);assert.deepEqual(await fingerprints(DIRECT),staticHashes,'LIVE_STATIC_DRIFT');await siteHealth(DIRECT);await siteHealth(PUBLIC);await guard(candidate);
 console.log('SITE_BINDING_RELEASE_SUCCESS='+JSON.stringify({candidate,rollback:EXPECTED,settled:live.settled,pending:live.pending,coverageVerified:live.coverageVerified,cutoverReady:live.cutoverReady,publicSourceChanged:false,routeWrites:0,engineChanged:false,receiverChanged:false,wranglerDeployRun:false}));
}catch(e){
 console.log('SITE_BINDING_RELEASE_STOP='+JSON.stringify({error:String(e.message).slice(0,250),candidate,activated}));
 if(candidate&&await active(SITE)===candidate){await assign(EXPECTED);await waitActive(EXPECTED);console.log('SITE_BINDING_ROLLBACK='+EXPECTED)}
 throw e;
}
