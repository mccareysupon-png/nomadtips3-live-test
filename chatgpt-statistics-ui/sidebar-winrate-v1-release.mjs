// One-time owner-authorized release: additive Receiver graph field, then website sidebar only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHmac,createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {patchProxy,patchWorkspace,patchBrowserChart} from './sidebar-winrate-v1-patch.mjs';
import {sidebarWinRates,validSidebar,SIDEBAR_MARKETS} from './sidebar-winrate-v1.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const SITE='ball46-production',REC='ball46-shadow-receiver-production',ENG='nomadtips3-engine-343';
const oldSite='b4f41a7d-4d48-4e11-aa16-e74ab5dd586a',oldRec='55a7638c-d6e4-4698-9ad4-b3e1f821ed5f',oldEng='db65134e-a12d-4084-937e-3ce6e986c251';
const root='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc',token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'WORKER_TOKEN_MISSING');
const key=createHmac('sha256',token).update('ball46/receiver/https-audit/v1/20261118').digest('hex');console.log('::add-mask::'+key);
const recHost='https://'+REC+'.mccarey-supon.workers.dev',siteHost='https://'+SITE+'.mccarey-supon.workers.dev',pub='https://www.ball46.com',graph='/b46-receiver-v1/graph';
const dir=process.env.RUNNER_TEMP+'/sidebar-release';await mkdir(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const writes=new Set(['/workers/workers/'+REC+'/versions?deploy=false','/workers/scripts/'+REC+'/deployments','/workers/scripts/'+SITE+'/versions?bindings_inherit=strict','/workers/scripts/'+SITE+'/deployments']);
async function cf(p,method='GET',body){
 if(method!=='GET')assert(method==='POST'&&writes.has(p),'WRITE_SCOPE');
 const r=await fetch(root+p,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+method+'_'+r.status+'_'+(j.errors??[]).map(x=>x.code).join('_'));return j.result;
}
async function active(n){const v=(await cf('/workers/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100,'TRAFFIC_DRIFT_'+n);return v[0].version_id}
async function guard(r,s){assert.equal(await active(REC),r,'RECEIVER_DRIFT');assert.equal(await active(SITE),s,'SITE_DRIFT');assert.equal(await active(ENG),oldEng,'ENGINE_DRIFT')}
async function version(n,id){for(let i=0;i<10;i++){try{return await cf('/workers/workers/'+n+'/versions/'+id+'?include=modules')}catch(e){if(i===9||!String(e).includes('10071'))throw e;await sleep(1000)}}}
async function assign(n,id){await cf('/workers/scripts/'+n+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],...(n===REC?{code_update_strategy:{mode:'immediate'}}:{}),annotations:{'workers/message':'Owner-approved Sidebar Win Rate V1 (additive graph data and sidebar only)'}})}
async function waitActive(n,id){for(let i=0;i<15;i++){if(await active(n)===id)return;await sleep(1500)}throw Error('ACTIVE_NOT_CONFIRMED_'+n)}
async function http(host,path,k){const t=performance.now(),r=await fetch(host+path,{headers:{'user-agent':'Mozilla/5.0 B46-SidebarRelease','cache-control':'no-cache',...(k?{authorization:'Bearer '+k}:{})},redirect:'manual',signal:AbortSignal.timeout(25000)}),body=Buffer.from(await r.arrayBuffer());let d=null;try{d=JSON.parse(body.toString())}catch{}return {status:r.status,body,d,ms:Math.round(performance.now()-t),source:r.headers.get('x-b46-statistics-source')}}
const q=(m='all',v='all',f='all',r='all')=>new URLSearchParams({market:m,variant:v,filter:f,range:r});
async function inspectGraphs(host,reader=false,withSidebar=true){
 for(let attempt=0;attempt<(withSidebar?24:6);attempt++){
  const rs=await Promise.all(SIDEBAR_MARKETS.map(async m=>[m,await http(host,(reader?'/audit-projection-graph-v1':graph)+'?'+q(m),reader?key:undefined)]));
  const seq=rs[0][1].d?.sequence;
  if(!rs.every(([m,r])=>r.status===200&&r.d?.ok&&r.d.market===m&&r.d.sequence===seq)){await sleep(1000);continue}
  const gs=Object.fromEntries(rs.map(([m,r])=>[m,r.d])),rates=sidebarWinRates(gs);
  if(withSidebar&&rs.some(([m,r])=>!validSidebar(r.d.sidebarWinRates))){console.log('SIDEBAR_PROPAGATION_WAIT='+JSON.stringify({host,attempt:attempt+1,missing:rs.filter(([m,r])=>!validSidebar(r.d.sidebarWinRates)).map(([m])=>m)}));await sleep(2500);continue}
  if(withSidebar)for(const [m,r] of rs){assert.deepEqual(r.d.sidebarWinRates,rates,'SIDEBAR_RATE_PARITY_'+m);assert(Buffer.byteLength(JSON.stringify({sidebarWinRates:r.d.sidebarWinRates}))<1024)}
  const result={host,sequence:seq,settled:gs.all.summary.rows,rates,ms:Object.fromEntries(rs.map(([m,r])=>[m,r.ms]))};console.log('SIDEBAR_GRAPH_PASS='+JSON.stringify(result));return result;
 }throw Error('COHERENT_GRAPH_READ_FAILED_'+host);
}
function sameBindings(a,b){assert.equal(a.length,b.length,'BINDING_COUNT');for(const x of a){const y=b.find(z=>z.name===x.name);assert(y&&y.type===x.type,'BINDING_TYPE_'+x.name);if(x.type!=='secret_text')assert.equal(canon(y),canon(x),'BINDING_RESOURCE_'+x.name)}}
const decode=m=>Buffer.from(m.content_base64,'base64'),mod=(name,code,ct='application/javascript+module')=>({name,content_type:ct,content_base64:Buffer.from(code).toString('base64')});
const chartPath='/longterm-performance-343.js',workspacePath='/singlepage-workspace-343.js',otherPath='/bulk-odds-compat-343.js';
const aliases={all:'all','1x2':'1X2',ah:'AH',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
const label=v=>v===null?'—':v.toFixed(2)+'%',color=v=>v===null?'rgb(145, 170, 155)':Number(v.toFixed(2))>50?'rgb(34, 197, 94)':Number(v.toFixed(2))<50?'rgb(248, 113, 113)':'rgb(250, 204, 21)';
async function qa(host,phase){
 const b=await chromium.launch({headless:true});
 try{
  for(const mobile of [false,true]){
   const ctx=await b.newContext({viewport:{width:mobile?390:1366,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',timezoneId:'Asia/Bangkok'});
   const p=await ctx.newPage(),errors=[],history=[],requests=[],responses=new Map;
   p.on('pageerror',e=>errors.push(e.message.slice(0,180)));
   p.on('request',r=>{const n=new URL(r.url()).pathname;if(n==='/api/engine/statistics')history.push(n);if(n===graph)requests.push(r.url());});
   p.on('response',async r=>{if(new URL(r.url()).pathname===graph&&r.status()===200)try{const d=await r.json();if(validSidebar(d.sidebarWinRates))responses.set(d.sequence,d.sidebarWinRates)}catch{}});
   const validate=async(m,range='all')=>{
    await p.waitForFunction(({m,range})=>{const c=document.querySelector('#b46-finance-chart-card');return c?.dataset.b46StatisticsSource==='receiver'&&c.dataset.b46Market===m&&c.dataset.b46Range===range&&document.querySelectorAll('[data-b46-win-rate]').length===8&&!!c.querySelector('.f46-plot')?.getClientRects().length;},{m,range},{timeout:25000});
    const d=await p.evaluate(()=>({seq:Number(document.querySelector('#b46-finance-chart-card')?.dataset.b46Sequence),order:[...document.querySelectorAll('[data-stat-market]')].map(x=>x.dataset.statMarket),rows:[...document.querySelectorAll('[data-stat-market]')].map(x=>({market:x.dataset.statMarket,text:x.querySelector('b')?.textContent,color:getComputedStyle(x.querySelector('b')).color})),overflow:document.documentElement.scrollWidth>innerWidth+2}));
    for(let i=0;i<15&&!responses.has(d.seq);i++)await sleep(100);
    const rates=responses.get(d.seq);assert(rates,'MISSING_UI_GRAPH_SEQUENCE');assert.deepEqual(d.order,Object.keys(aliases),'ORDER_DRIFT');
    for(const x of d.rows){const rate=rates[aliases[x.market]].rate;assert.equal(x.text,label(rate),'SIDEBAR_TEXT_'+x.market);assert.equal(x.color,color(rate),'SIDEBAR_COLOR_'+x.market)}
    assert(!d.overflow,'LAYOUT_OVERFLOW');assert.equal(history.length,0,'EARLY_HISTORY');assert.equal(errors.length,0,JSON.stringify(errors));return d;
   };
   const start=performance.now();assert.equal((await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
   const first=await validate('all'),firstMs=Math.round(performance.now()-start);
   await p.screenshot({path:dir+'/'+phase+'-'+(mobile?'mobile':'desktop')+'.png'});
   if(!mobile){
    for(const [n,m] of [['ou','O/U'],['corners','Corners'],['1x2','1X2']]){await p.locator('[data-stat-market="'+n+'"]').first().click();await validate(m)}
    await p.locator('[data-b46-range="d7"]').click();await validate('1X2','d7');
   }
   assert.equal(history.length,0);assert.equal(errors.length,0);console.log('SIDEBAR_BROWSER_LIVE_PASS='+JSON.stringify({phase,mobile,firstMs,sequence:first.seq,rows:first.rows,graphRequests:requests.length,historyRequests:0,jsErrors:0}));
   await ctx.close();
  }
  const ctx=await b.newContext({serviceWorkers:'block'}),p=await ctx.newPage(),calls=[];
  p.on('request',r=>{if(new URL(r.url()).pathname===graph)calls.push(r.url())});
  assert.equal((await p.goto(host+'/',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
  await p.waitForFunction(()=>document.body?.dataset.workspaceView==='live',null,{timeout:25000});await p.waitForTimeout(500);assert.equal(calls.length,0,'LIVE_GRAPH_LEAK');await ctx.close();
 }finally{await b.close()}
}
let newRec=null,newSite=null;
try{
 await guard(oldRec,oldSite);
 const rv=await version(REC,oldRec),sv=await version(SITE,oldSite);
 assert(rv.modules?.length===1&&rv.main_module===rv.modules[0].name,'RECEIVER_MODULE_SHAPE');
 assert.equal(hash(decode(rv.modules[0])),'4f9f2c3408b2a75198cfe40829a26f3bcf1dba8ec2e00c57e1b49ef9de10dd64','RECEIVER_BASE_HASH');
 assert(sv.modules?.some(x=>x.name===sv.main_module)&&sv.modules.some(x=>x.name==='b46-site-graph-entry-20261118.mjs'),'SITE_RELEASE_CHAIN_DRIFT');console.log('SIDEBAR_BASE_SITE='+JSON.stringify({id:oldSite,main:sv.main_module,modules:sv.modules.length}));
 assert(sv.bindings.some(x=>x.name==='B46_MARKET_READER'&&x.service===REC&&x.entrypoint==='MarketStatisticsReader'));
 assert(rv.bindings.some(x=>x.name==='SHADOW_STORE'&&x.type==='durable_object_namespace'&&x.class_name==='ShadowProductionStore'));
 const projBase=await readFile(new URL('./shadow-site-graph-cutover.mjs',import.meta.url),'utf8'),patchBase=await readFile(new URL('./shadow-site-graph-cutover-patch.mjs',import.meta.url),'utf8');
 const proxyName='b46-site-graph-cutover-20261118.mjs',patchName='b46-site-graph-patch-20261118.mjs';
 const getModule=n=>sv.modules.find(x=>x.name===n);
 assert.equal(decode(getModule(proxyName)).toString(),projBase,'PROXY_DRIFT');assert.equal(decode(getModule(patchName)).toString(),patchBase,'UI_PATCH_DRIFT');
 const baseline=await inspectGraphs(recHost,true,false);
 const beforeOther=await http(siteHost,otherPath);assert.equal(beforeOther.status,200);
 const baseChart=await http(siteHost,chartPath),baseWork=await http(siteHost,workspacePath);
 assert.equal(baseChart.status,200);assert.equal(baseWork.status,200);
 const chart=patchBrowserChart(baseChart.body.toString()),work=patchWorkspace(baseWork.body.toString()).source;new Function(chart);new Function(work);
 const rb=await readFile(process.env.RUNNER_TEMP+'/sidebar-receiver.mjs'),baseBundle=await readFile(process.env.RUNNER_TEMP+'/sidebar-receiver-baseline.mjs');assert.equal(hash(baseBundle),hash(decode(rv.modules[0])),'REBUILT_BASELINE_DIFFERS');
 const rs=await cf('/workers/scripts/'+REC+'/settings');
 const payload={main_module:rv.main_module,modules:[mod(rv.main_module,rb,rv.modules[0].content_type)],bindings:rv.bindings.map(x=>({name:x.name,type:'inherit',version_id:oldRec})),compatibility_date:rv.compatibility_date,compatibility_flags:rs.compatibility_flags??[],annotations:{'workers/message':'Sidebar Win Rate additive graph summary only'}};
 if(rv.usage_model)payload.usage_model=rv.usage_model;if(rv.migration_tag)payload.migration_tag=rv.migration_tag;
 await guard(oldRec,oldSite);
 newRec='571103b5-12ce-402b-8720-3e154f89634d';assert(newRec&&newRec!==oldRec);
 const rn=await version(REC,newRec);assert.equal(hash(decode(rn.modules[0])),hash(rb));sameBindings(rv.bindings,rn.bindings);
 console.log('SIDEBAR_RECEIVER_CANDIDATE='+JSON.stringify({id:newRec,rollback:oldRec}));
 // Prepare website version before activating Receiver. No duplicate large assets.
 const helperName='sidebar-winrate-v1.mjs',sidebarPatchName='sidebar-winrate-v1-patch.mjs';
 const helper=await readFile(new URL('./'+helperName,import.meta.url),'utf8'),sp=await readFile(new URL('./'+sidebarPatchName,import.meta.url),'utf8');
 assert(!getModule(helperName)&&!getModule(sidebarPatchName));
 const replacementProxy=patchProxy(projBase);
 const replacementPatch=patchBase.replace('export function patchChart(s){','function basePatchChart(s){').replace('export function patchWorkspace(s){','function basePatchWorkspace(s){')+'\nimport {patchBrowserChart as sidebarChart,patchWorkspace as sidebarWorkspace} from "./'+sidebarPatchName+'";\nexport function patchChart(s){return sidebarChart(basePatchChart(s))}\nexport function patchWorkspace(s){return sidebarWorkspace(basePatchWorkspace(s)).source}\n';
 const modules=sv.modules.map(x=>x.name===proxyName?mod(x.name,replacementProxy,x.content_type):x.name===patchName?mod(x.name,replacementPatch,x.content_type):x).concat([mod(helperName,helper),mod(sidebarPatchName,sp)]);
 const compressed=modules.reduce((n,m)=>n+gzipSync(decode(m)).length,0);assert(compressed<10*1024*1024,'WORKER_SIZE_LIMIT');console.log('SIDEBAR_SIZE='+compressed);
 const ss=await cf('/workers/scripts/'+SITE+'/settings'),sub=await cf('/workers/scripts/'+SITE+'/subdomain');assert(sub.enabled&&sub.previews_enabled,'PREVIEW_UNAVAILABLE');
 const meta={main_module:sv.main_module,compatibility_date:sv.compatibility_date,compatibility_flags:sv.compatibility_flags??[],bindings:sv.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:oldSite}:x),keep_assets:true,annotations:{'workers/message':'Sidebar Win Rate, colors and Corners order only'}};
 if(sv.assets?.config)meta.assets={config:sv.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(ss[k]!=null)meta[k]=ss[k];
 const form=new FormData;form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const x of modules)form.set(x.name,new Blob([decode(x)],{type:x.content_type}),x.name);
 await guard(oldRec,oldSite);newSite='416e70e3-de42-46c8-9fe9-193648c3dc95';assert(newSite&&newSite!==oldSite);
 const sn=await version(SITE,newSite);assert.equal(sn.modules.length,modules.length);assert.equal(sn.main_module,sv.main_module);assert.equal(canon(sn.assets?.config),canon(sv.assets?.config));sameBindings(sv.bindings,sn.bindings);
 for(const m of modules){const n=sn.modules.find(x=>x.name===m.name);assert(n&&hash(decode(n))===hash(decode(m)),'MODULE_CHANGED_'+m.name)}
 const preview='https://'+newSite.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';
 console.log('SIDEBAR_SITE_CANDIDATE='+JSON.stringify({id:newSite,rollback:oldSite,preview}));
 await writeFile(dir+'/versions.json',JSON.stringify({newRec,newSite,oldRec,oldSite,oldEng,preview},null,2));
 await guard(oldRec,oldSite);
 await assign(REC,newRec);await waitActive(REC,newRec);await guard(newRec,oldSite);
 let ready=false;
 for(let i=0;i<20;i++){const r=await http(recHost,'/audit-projection-graph-v1',key),p=await http(recHost,'/audit-projection-pending-v1?limit=1',key);if(r.status===200&&validSidebar(r.d?.sidebarWinRates)&&r.d.summary.rows>=baseline.settled&&p.status===200){ready=true;break}await sleep(2500)}
 assert(ready,'RECEIVER_ACTIVATION_FAILED');assert.equal((await http(recHost,'/audit-projection-graph-v1')).status,403);
 await inspectGraphs(recHost,true,true);
 // Existing active site still functions with new additive response and unchanged Book.
 const legacy=await http(siteHost,graph+'?'+q());assert.equal(legacy.status,200);assert(legacy.d?.ok);
 for(let i=0;i<12;i++){const r=await http(preview,chartPath);if(r.status===200&&hash(r.body)===hash(Buffer.from(chart)))break;if(i===11)throw Error('PREVIEW_CHART_MISMATCH');await sleep(1000)}
 assert.equal(hash((await http(preview,workspacePath)).body),hash(Buffer.from(work)));assert.equal(hash((await http(preview,otherPath)).body),hash(beforeOther.body));
 await inspectGraphs(preview,false,true);await qa(preview,'candidate');await guard(newRec,oldSite);
 await assign(SITE,newSite);await waitActive(SITE,newSite);await guard(newRec,newSite);
 const live=await inspectGraphs(pub,false,true);
 // Public CDN propagation is separate from active deployment status. Verify exact
 // served script bytes before browser acceptance, not an immediate mixed-edge read.
 for(let i=0;i<24;i++){
  const [c,w]=await Promise.all([http(pub,chartPath),http(pub,workspacePath)]);
  if(c.status===200&&w.status===200&&hash(c.body)===hash(Buffer.from(chart))&&hash(w.body)===hash(Buffer.from(work)))break;
  if(i===23)throw Error('PUBLIC_STATIC_PROPAGATION_FAILED');
  await sleep(2500);
 }
 await qa(pub,'production');await guard(newRec,newSite);
 assert.equal(hash((await http(siteHost,otherPath)).body),hash(beforeOther.body));
 console.log('SIDEBAR_PRODUCTION_SUCCESS='+JSON.stringify({site:newSite,receiver:newRec,engine:oldEng,rollbackSite:oldSite,rollbackReceiver:oldRec,...live,production:true,additionalSidebarRequests:0,bookReset:false,routeWrites:0}));
}catch(e){
 console.log('SIDEBAR_RELEASE_STOP='+JSON.stringify({error:String(e.message).slice(0,300),newRec,newSite}));
 if(newSite&&await active(SITE)===newSite){await assign(SITE,oldSite);await waitActive(SITE,oldSite);console.log('SIDEBAR_SITE_ROLLBACK='+oldSite)}
 if(newRec&&await active(REC)===newRec){await assign(REC,oldRec);await waitActive(REC,oldRec);console.log('SIDEBAR_RECEIVER_ROLLBACK='+oldRec)}
 throw e;
}
