// Owner-approved history-only frontend repair; existing Receiver/Engine/data unchanged.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {restoreHistoryChart,restoreHistoryWorkspace} from './restore-original-history-v1.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const site='ball46-production',rec='ball46-shadow-receiver-production',eng='nomadtips3-engine-343';
const base='b4f41a7d-4d48-4e11-aa16-e74ab5dd586a',receiver='55a7638c-d6e4-4698-9ad4-b3e1f821ed5f',engine='db65134e-a12d-4084-937e-3ce6e986c251';
const root='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc',token=process.env.CLOUDFLARE_API_TOKEN;
assert(token);const direct='https://'+site+'.mccarey-supon.workers.dev',pub='https://www.ball46.com',chart='/longterm-performance-343.js',workspace='/singlepage-workspace-343.js',target='b46-site-graph-patch-20261118.mjs';
const out=process.env.RUNNER_TEMP+'/restore-original-history';await mkdir(out,{recursive:true});
const h=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),decode=m=>Buffer.from(m.content_base64,'base64');
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function cf(p,method='GET',body){if(method!=='GET')assert(method==='POST'&&['/workers/scripts/'+site+'/versions?bindings_inherit=strict','/workers/scripts/'+site+'/deployments'].includes(p),'WRITE_SCOPE');const r=await fetch(root+p,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+method+'_'+r.status+'_'+(j.errors??[]).map(e=>e.code).join('_'));return j.result}
async function active(n){const v=(await cf('/workers/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100,'TRAFFIC_DRIFT_'+n);return v[0].version_id}
async function guard(id){assert.equal(await active(site),id,'SITE_DRIFT');assert.equal(await active(rec),receiver,'RECEIVER_DRIFT');assert.equal(await active(eng),engine,'ENGINE_DRIFT')}
async function version(id){for(let i=0;i<10;i++)try{return await cf('/workers/workers/'+site+'/versions/'+id+'?include=modules')}catch(e){if(i===9||!String(e).includes('10071'))throw e;await sleep(1200)}}
async function assign(id){await cf('/workers/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-requested original count/history restoration; no data changes'}})}
async function waitActive(id){for(let i=0;i<15;i++){if(await active(site)===id)return;await sleep(1500)}throw Error('ACTIVE_NOT_CONFIRMED')}
async function get(host,path){const r=await fetch(host+path,{headers:{'user-agent':'Mozilla/5.0 B46-VisualRelease','cache-control':'no-cache'},redirect:'manual',signal:AbortSignal.timeout(25000)});return {status:r.status,raw:Buffer.from(await r.arrayBuffer())}}
const unchanged=['/bulk-odds-compat-343.js','/b46-statistics-fast-v1-20261116.js'];
async function confirmScripts(host,expected){for(let i=0;i<24;i++){const r=await Promise.all(Object.keys(expected).map(async path=>{const x=await get(host,path);return x.status===200&&h(x.raw)===expected[path]}));if(r.every(Boolean))return;await sleep(2500)}throw Error('SCRIPT_PROPAGATION_FAILED_'+host)}


const aliases=['all','1x2','ah','ou','btts','corners','cards','other'];
async function qa(host,phase){
 const b=await chromium.launch({headless:true});
 try{
  const results=[];
  for(const mobile of [false,true]){
   const ctx=await b.newContext({viewport:{width:mobile?390:1612,height:mobile?844:856},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
   const p=await ctx.newPage(),errors=[],requests=[],responses=[];let firstGraph=0;
   p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/engine/statistics')requests.push({cursor:u.searchParams.has('cursor'),at:Date.now()})});
   p.on('response',async r=>{const u=new URL(r.url());if(u.pathname==='/api/engine/statistics'){if(responses.length<80){let d;try{d=await r.json()}catch{}responses.push({status:r.status(),cursor:u.searchParams.has('cursor'),total:d?.total,ledgerTotal:d?.ledgerTotal,returned:d?.rows?.length})}}});
   await p.addInitScript(()=>{
    window.__restoreProgress=[];
    document.addEventListener('b46:history-restore-progress',e=>{const d=e.detail;window.__restoreProgress.push({length:d.rows.length,total:d.total,ledgerTotal:d.ledgerTotal,byMarket:d.byMarket,source:document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource,at:Date.now()})});
   });
   const start=Date.now();
   try {
    assert.equal((await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
    await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver',null,{timeout:30000});firstGraph=Date.now()-start;
    await p.waitForFunction(()=>{const s=document.querySelector('[data-stat-market="all"] b'),r=document.querySelector('[data-sp-table-body]');return Number(s?.textContent.replace(/,/g,''))>0&&r&&[...r.querySelectorAll('tr')].some(x=>x.cells.length>=4)},null,{timeout:45000});
    if(mobile)await p.getByText(/^\+?\s*Match details$/i).first().waitFor({state:'visible',timeout:20000});
    else await p.waitForFunction(()=>[...document.querySelectorAll('[data-sp-table-body] tr')].some(e=>e.cells.length>=4&&e.getClientRects().length),null,{timeout:20000});
    const inspect=()=>p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card'),s=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return {source:c?.dataset.b46StatisticsSource,settled:Number(c?.dataset.b46Settled),count:document.querySelector('[data-sp-record-count]')?.textContent,sidebar:[...document.querySelectorAll('[data-stat-market] b')].map(e=>({m:e.closest('[data-stat-market]').dataset.statMarket,text:e.textContent,display:e.dataset.b46Display??null,after:getComputedStyle(e,'::after').content,font:parseFloat(getComputedStyle(e).fontSize)})),rows:[...document.querySelectorAll('[data-sp-table-body] tr')].filter(e=>e.cells.length>=4).length,example:[...document.querySelectorAll('[data-sp-table-body] tr')].find(e=>e.cells.length>=4)?.textContent.slice(0,160),progress:window.__restoreProgress,complete:s?.ok&&s.ledgerRows?.length===s.ledgerTotal?{rows:s.ledgerRows.length,settled:s.total,pending:s.pending}:null}});
    const d=await inspect();assert.equal(d.source,'receiver');assert.deepEqual(d.sidebar.map(x=>x.m),aliases);assert(d.rows>0&&d.example);assert(d.progress.length||d.complete,'NO_PROGRESS');
    const values=d.sidebar.map(x=>Number(x.text.replace(/,/g,'')));assert(values[0]>0&&values.slice(1).every(Number.isSafeInteger)&&values.slice(1).reduce((a,b)=>a+b,0)===values[0],'COUNT_PARITY');
    for(const x of d.sidebar){assert(/^\d+$/.test(x.text));if(!mobile)assert(x.display===Number(x.text).toLocaleString('en-US'),'VISIBLE_COUNT_'+x.m);else assert(x.font>0||x.after.includes(x.text))}
    if(d.progress.length)assert.equal(d.progress[0].source,'receiver','GRAPH_BEFORE_HISTORY');
    assert.equal(errors.length,0,JSON.stringify(errors));const firstMs=Date.now()-start;
    await p.screenshot({path:out+'/'+phase+'-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
    let full=false,complete=null;
    // One PC browser per phase verifies native full-ledger completion; no extra API calls.
    if(!mobile){
     try{await p.waitForFunction(()=>{const s=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return s?.ok&&s.ledgerRows?.length===s.ledgerTotal&&Number(document.querySelector('[data-stat-market="all"] b')?.textContent)===s.ledgerTotal},null,{timeout:60000});full=true}catch{}
     const end=await inspect();complete=end.complete;
     assert.equal(end.source,'receiver');assert(end.rows>0&&Number(end.sidebar[0].text)>0,'PREVIEW_LOST');
     if(full){const nums=end.sidebar.map(x=>Number(x.text));assert.equal(nums[0],complete.rows);assert.equal(nums.slice(1).reduce((a,b)=>a+b,0),nums[0]);assert.equal(end.count,complete.rows+' records');await p.screenshot({path:out+'/'+phase+'-desktop-complete.png',fullPage:true})}
     console.log('RESTORE_FULL='+JSON.stringify({phase,full,complete,latestProgress:end.progress.at(-1)??null,requests:requests.length,errors,ms:Date.now()-start}));
    }
    assert.equal(errors.length,0,JSON.stringify(errors));
    const row={phase,mobile,graphMs:firstGraph,firstMs,full,complete,counts:d.sidebar,rows:d.rows,example:d.example,recordCount:d.count,requests:requests.length,jsErrors:errors.length};results.push(row);console.log('RESTORE_VISIBLE_PASS='+JSON.stringify(row));
   }catch(e){console.log('RESTORE_BROWSER_DIAG='+JSON.stringify({phase,mobile,error:String(e.message).slice(0,200),errors,requests:requests.length,responses:responses.slice(0,5),view:await p.evaluate(()=>({count:document.querySelector('[data-sp-record-count]')?.textContent,progress:window.__restoreProgress?.slice(0,2),sidebar:[...document.querySelectorAll('[data-stat-market] b')].map(e=>e.textContent),source:document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource})).catch(()=>null)}));throw e}
   finally{await ctx.close()}
  }
  const ctx=await b.newContext(),p=await ctx.newPage(),graphs=[];p.on('request',r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph')graphs.push(r.url())});
  await p.goto(host+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>document.body?.dataset.workspaceView==='live');await p.waitForTimeout(800);
  assert.equal(graphs.length,0);assert.equal(await p.evaluate(()=>!!window.__B46_HISTORY_RESTORE_QUEUED||!!window.__B46_FAST_DETAILS_REQUESTED),false,'LIVE_AUTOLOAD');await ctx.close();
  return results;
 }finally{await b.close()}
}
let candidate=null;
try{
 await guard(base);
 const v=await version(base),settings=await cf('/workers/scripts/'+site+'/settings'),sub=await cf('/workers/scripts/'+site+'/subdomain');assert(sub.enabled&&sub.previews_enabled);
 const old=v.modules.find(x=>x.name===target);assert(old&&v.modules.length===55,'MODULE_DRIFT');
 const src=decode(old).toString(),basePatch=await readFile(new URL('./shadow-site-graph-cutover-patch.mjs',import.meta.url),'utf8');assert.equal(src,basePatch,'GRAPH_PATCH_DRIFT');
 const helper=await readFile(new URL('./restore-original-history-v1.mjs',import.meta.url),'utf8');
 const next=src.replace('export function patchChart(s){','function basePatchChart(s){').replace('export function patchWorkspace(s){','function basePatchWorkspace(s){')+'\n'+helper+'\nexport function patchChart(s){return restoreHistoryChart(basePatchChart(s))}\nexport function patchWorkspace(s){return restoreHistoryWorkspace(basePatchWorkspace(s))}\n';
 const expected={};for(const [p,patch] of [[chart,restoreHistoryChart],[workspace,restoreHistoryWorkspace]]){const r=await get(direct,p);assert.equal(r.status,200);const s=patch(r.raw.toString());new Function(s);expected[p]=h(Buffer.from(s))}
 const before={};for(const p of unchanged){const r=await get(direct,p);assert.equal(r.status,200);before[p]=h(r.raw)}
 const g0=JSON.parse((await get(pub,'/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all')).raw);assert(g0.ok&&g0.summary.rows>=16156);
 const modules=v.modules.map(x=>x.name===target?{...x,content_base64:Buffer.from(next).toString('base64')}:x);assert(modules.reduce((n,m)=>n+gzipSync(decode(m)).length,0)<10*1024*1024,'WORKER_SIZE');
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags??[],bindings:v.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:base}:x),keep_assets:true,annotations:{'workers/message':'Restore original numeric sidebar and native history progressively; no data changes'}};
 if(v.assets?.config)meta.assets={config:v.assets.config};for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const x of modules)form.set(x.name,new Blob([decode(x)],{type:x.content_type}),x.name);
 await guard(base);candidate=(await cf('/workers/scripts/'+site+'/versions?bindings_inherit=strict','POST',form)).id;assert(candidate&&candidate!==base);
 const n=await version(candidate);assert.equal(n.main_module,v.main_module);assert.equal(n.modules.length,v.modules.length);assert.equal(canon(n.assets?.config),canon(v.assets?.config));assert.equal(n.bindings.length,v.bindings.length);
 for(const x of v.bindings){const y=n.bindings.find(z=>z.name===x.name);assert(y&&y.type===x.type);if(x.type!=='secret_text')assert.equal(canon(y),canon(x))}
 for(const x of modules){const y=n.modules.find(z=>z.name===x.name);assert(y&&h(decode(y))===h(decode(x)),'MODULE_HASH_'+x.name)}
 const preview='https://'+candidate.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';console.log('RESTORE_CANDIDATE='+JSON.stringify({candidate,base,preview,changedModules:1}));await writeFile(out+'/versions.json',JSON.stringify({candidate,base,receiver,engine,preview}));
 await confirmScripts(preview,expected);for(const p of unchanged){const r=await get(preview,p);assert.equal(r.status,200);assert.equal(h(r.raw),before[p])}
 const staged=await qa(preview,'candidate');assert(staged.every(x=>x.rows>0));await guard(base);
 await assign(candidate);await waitActive(candidate);await guard(candidate);await confirmScripts(pub,expected);
 const live=await qa(pub,'production');await guard(candidate);
 for(const p of unchanged){const r=await get(direct,p);assert.equal(r.status,200);assert.equal(h(r.raw),before[p])}
 const g=JSON.parse((await get(pub,'/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all')).raw);assert(g.ok&&g.source==='RECEIVER'&&g.summary.rows>=g0.summary.rows);
 console.log('RESTORE_SUCCESS='+JSON.stringify({site:candidate,rollback:base,receiver,engine,changedModules:1,production:true,oldCounts:true,graph:g.summary.rows,net:g.summary.net,sequence:g.sequence,fullPC:live[0].full,complete:live[0].complete,pcMs:live[0].firstMs,mobileMs:live[1].firstMs,routeWrites:0}));
}catch(e){console.log('RESTORE_STOP='+JSON.stringify({candidate,error:String(e.message).slice(0,500)}));if(candidate&&await active(site)===candidate){await assign(base);await waitActive(base);console.log('RESTORE_ROLLBACK='+base)}throw e}
