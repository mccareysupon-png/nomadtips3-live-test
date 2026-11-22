// Owner-approved scoped production release, only Sidebar first-paint hydration.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_AUTH_MISSING');
const repo='qa/sidebar-firstpaint-release-20261122',site='ball46-production';
const engine='nomadtips3-engine-343',receiver='ball46-shadow-receiver-production';
const direct='https://ball46-production.mccarey-supon.workers.dev',publicSite='https://ball46.com';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const root=new URL('./',import.meta.url);
const proof=process.env.RUNNER_TEMP+'/ball46-sidebar-firstpaint-release-proof';
await mkdir(proof,{recursive:true});
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium,devices}=require('playwright');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
async function cf(path,method='GET',body){
 if(method!=='GET')assert(method==='POST'&&['/scripts/'+site+'/versions?bindings_inherit=strict','/scripts/'+site+'/deployments'].includes(path),'CF_WRITE_NOT_ALLOWED');
 const response=await fetch(api+path,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const json=await response.json();assert(response.ok&&json.success,'CLOUDFLARE '+method+' '+path+' '+response.status+' '+JSON.stringify(json.errors??[]));return json.result;
}
async function active(worker){const r=await cf('/scripts/'+worker+'/deployments?per_page=1');const v=r.deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100,'TRAFFIC_SPLIT '+worker);return v[0].version_id}
const start={site:await active(site),engine:await active(engine),receiver:await active(receiver)};
console.log('SIDEBAR_FIRSTPAINT_BASELINE '+JSON.stringify(start));
await writeFile(proof+'/rollback.json',JSON.stringify(start));
async function guard(version){assert.equal(await active(site),version,'SITE_VERSION_DRIFT');assert.equal(await active(engine),start.engine,'ENGINE_VERSION_DRIFT');assert.equal(await active(receiver),start.receiver,'RECEIVER_VERSION_DRIFT')}
async function ver(version){return cf('/workers/'+site+'/versions/'+version+'?include=modules')}
async function request(host,path,ua='Mozilla/5.0 BALL46 Sidebar Firstpaint Release'){
 const r=await fetch(host+path,{headers:{'cache-control':'no-cache','user-agent':ua},signal:AbortSignal.timeout(40000)});
 const body=Buffer.from(await r.arrayBuffer());return {status:r.status,headers:r.headers,body,text:body.toString('utf8')};
}
async function activate(v){await cf('/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:v,percentage:100}],annotations:{'workers/message':'Owner-approved Sidebar Win Rate initial snapshot retry only, Nov 22'}})}
async function waitActive(v){for(let i=0;i<15;i++){if(await active(site)===v)return;await pause(1500)}throw Error('ACTIVATION_NOT_CONFIRMED')}
const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
async function checkSnapshot(host){
 const s=await request(host,'/__b46_sidebar_initial_snapshot');
 assert.equal(s.status,200,'SNAPSHOT_HTTP_'+host+'_'+s.status);
 const x=JSON.parse(s.text).snapshot;assert(Number.isSafeInteger(x?.sequence)&&keys.every(k=>Object.hasOwn(x.rates,k)),'SNAPSHOT_SCHEMA');
 return x;
}
async function browserQA(host,label){
 const browser=await chromium.launch({headless:true});
 try{
  for(const mode of ['dark','light','mobile']){
   const mobile=mode==='mobile',p=await browser.newPage(mobile?{...devices['iPhone 13'],serviceWorkers:'block'}:{viewport:{width:1440,height:950},serviceWorkers:'block'});
   const errors=[];p.on('pageerror',e=>errors.push(String(e)));
   await p.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),mode==='light'?'light':'dark');
   try{
    for(let iteration=0;iteration<(mobile?1:3);iteration++){
     if(!mobile&&mode==='dark'&&iteration===0)await p.route('**/__b46_sidebar_initial_snapshot',r=>r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}),{times:1});
     const page=await p.goto(host+'/?view=live&firstpaintRelease='+label+'-'+mode+'-'+iteration,{waitUntil:'domcontentloaded',timeout:75000});assert(page?.ok(),'HTML_NOT_OK');
     if(mobile){assert.equal(await p.locator('[data-b46-rate-snapshot]').count(),0,'MOBILE_NATIVE_SIDEBAR_CHANGED');continue}
     await p.waitForFunction(()=>window.__b46SidebarFirstPaintState?.source==='monitor-cache',null,{timeout:45000});
     const info=await p.evaluate(()=>({state:window.__b46SidebarFirstPaintState,items:[...document.querySelectorAll('.left-rail [data-b46-rate-snapshot]')].map(e=>({k:e.dataset.b46RateSnapshot,v:e.textContent.trim(),sequence:e.dataset.b46MonitorSequence}))}));
     assert.equal(info.items.length,8,'SIDEBAR_EIGHT');
     assert.equal(info.state.requested,mode==='dark'&&iteration===0?2:1,'RETRY_COUNT');
     const snapshot=await checkSnapshot(host);
     for(const x of info.items){assert(keys.includes(x.k));if(snapshot.rates[x.k]!==null)assert.notEqual(x.v,'—','RATE_MISSING_'+x.k)}
     console.log('FIRST_PAINT_BROWSER_PASS '+JSON.stringify({label,mode,iteration,seq:info.state.sequence,requests:info.state.requested}));
    }
    assert.deepEqual(errors,[],'BROWSER_ERRORS');
   }finally{await p.close()}
  }
 }finally{await browser.close()}
}
let candidate=null;
try{
 await guard(start.site);
 const base=await ver(start.site),settings=await cf('/scripts/'+site+'/settings'),sub=await cf('/scripts/'+site+'/subdomain');
 assert(base.main_module&&Array.isArray(base.modules)&&base.modules.length>0,'BASE_MODULES_MISSING');
 assert((base.bindings??[]).some(b=>b.name==='B46_SIDEBAR_MONITOR'&&b.type==='service'),'SIDEBAR_MONITOR_BINDING_MISSING');
 assert(sub.enabled&&sub.previews_enabled,'PREVIEW_DISABLED');
 const baseline=await request(direct,'/index.html');
 assert.equal(baseline.status,200,'BASELINE_SITE_NOT_OK');
 assert(baseline.text.includes('data-b46-rate-snapshot'),'PREVIOUS_SIDEBAR_NOT_INSTALLED');
 const immutable=['/dashboard-v2-stage3-featured-facts-20261013a.js','/ui-sync-fixes-343-v2.js','/expanded-match-343.js','/singlepage-workspace-343.js'];
 const expected={};for(const path of immutable){const r=await request(direct,path);assert.equal(r.status,200,'BASE_ASSET_'+path);expected[path]=sha(r.body)}
 const rawWrapper=await readFile(new URL('./wrapper.mjs',root),'utf8');
 const client=await readFile(new URL('./client.mjs',root),'utf8');
 assert(!baseline.text.includes('/__b46_sidebar_initial_test.js'),'ALREADY_DEPLOYED');
 assert(rawWrapper.includes("await original.fetch(req,env,ctx)")&&client.includes('SIDEBAR_FIRSTPAINT_CLIENT'),'RELEASE_SOURCE_INVALID');
 const wrapper=rawWrapper.replaceAll('__ORIGINAL_MAIN__',base.main_module);
 const extra=[
  {name:'b46-sidebar-firstpaint-entry-20261122.mjs',content_type:'application/javascript+module',content_base64:Buffer.from(wrapper).toString('base64')},
  {name:'b46-sidebar-firstpaint-client-20261122.mjs',content_type:'application/javascript+module',content_base64:Buffer.from(client).toString('base64')}
 ];
 const modules=[...base.modules,...extra];assert(new Set(modules.map(m=>m.name)).size===modules.length,'MODULE_NAME_CONFLICT');
 const bindings=base.bindings??[];
 const meta={main_module:extra[0].name,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags??[],bindings:bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:start.site}:b),keep_assets:true,annotations:{'workers/message':'Sidebar first-paint snapshot retry only; original Worker preserved'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of modules)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 await guard(start.site);
 candidate=(await cf('/scripts/'+site+'/versions?bindings_inherit=strict','POST',form)).id;
 assert(candidate&&candidate!==start.site,'INACTIVE_UPLOAD_FAILED');
 const next=await ver(candidate),nm=new Map(next.modules.map(m=>[m.name,m]));
 assert.equal(next.main_module,extra[0].name);
 assert.equal(next.modules.length,modules.length,'MODULE_COUNT');
 for(const m of modules)assert(nm.has(m.name)&&sha(Buffer.from(nm.get(m.name).content_base64,'base64'))===sha(Buffer.from(m.content_base64,'base64')),'MODULE_DRIFT_'+m.name);
 assert.equal(next.bindings.length,bindings.length,'BINDING_COUNT_DRIFT');
 for(const b of bindings){const n=next.bindings.find(x=>x.name===b.name);assert(n&&n.type===b.type,'BINDING_'+b.name);if(b.type!=='secret_text')assert.equal(canon(n),canon(b),'BINDING_DRIFT_'+b.name)}
 assert.equal(next.compatibility_date,base.compatibility_date);
 assert.equal(canon(next.assets?.config),canon(base.assets?.config),'ASSET_CONFIG_DRIFT');
 const preview='https://'+candidate.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';
 console.log('SIDEBAR_FIRSTPAINT_CANDIDATE '+JSON.stringify({candidate,rollback:start.site,preview,baseModules:base.modules.length,newModules:extra.length}));
 await writeFile(proof+'/candidate.json',JSON.stringify({candidate,rollback:start.site,preview}));
 let ready=false;
 for(let i=0;i<15;i++){try{const s=await request(preview,'/__b46_sidebar_initial_test.js');if(s.status===200&&s.text.includes('SidebarFirstPaintTest')){ready=true;break}}catch{}await pause(1700)}
 assert(ready,'PREVIEW_NOT_READY');
 await checkSnapshot(preview);
 for(const [path,hash]of Object.entries(expected)){const s=await request(preview,path);assert.equal(sha(s.body),hash,'PREVIEW_ASSET_DRIFT_'+path)}
 await browserQA(preview,'preview');
 await guard(start.site);
 await activate(candidate);await waitActive(candidate);await guard(candidate);
 let live=false;
 for(let i=0;i<20;i++){try{const s=await request(publicSite,'/__b46_sidebar_initial_test.js');if(s.status===200&&s.text.includes('SidebarFirstPaintTest')){live=true;break}}catch{}await pause(2000)}
 assert(live,'PUBLIC_EDGE_NOT_UPDATED');
 await checkSnapshot(publicSite);
 for(const [path,hash]of Object.entries(expected)){const s=await request(direct,path);assert.equal(sha(s.body),hash,'PRODUCTION_ASSET_DRIFT_'+path)}
 await browserQA(publicSite,'production');
 await guard(candidate);
 console.log('SIDEBAR_FIRSTPAINT_PRODUCTION_RELEASE_PASS '+JSON.stringify({version:candidate,rollback:start.site,engine:start.engine,receiver:start.receiver}));
}catch(e){
 console.log('SIDEBAR_FIRSTPAINT_RELEASE_STOP '+JSON.stringify({error:String(e.stack||e).slice(0,1300),candidate}));
 if(candidate&&await active(site)===candidate){await activate(start.site);await waitActive(start.site);console.log('SIDEBAR_FIRSTPAINT_ROLLBACK '+start.site)}
 throw e;
}
