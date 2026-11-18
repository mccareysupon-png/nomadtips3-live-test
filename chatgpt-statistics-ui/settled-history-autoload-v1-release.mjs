// Owner-approved history-only frontend repair; existing Receiver/Engine/data unchanged.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {patchHistoryAutoload,patchHistoryWorkspace} from './settled-history-autoload-v1.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const site='ball46-production',rec='ball46-shadow-receiver-production',eng='nomadtips3-engine-343';
const base='24506262-2590-493f-aace-2932057458d2',receiver='571103b5-12ce-402b-8720-3e154f89634d',engine='db65134e-a12d-4084-937e-3ce6e986c251';
const root='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc',token=process.env.CLOUDFLARE_API_TOKEN;
assert(token);const direct='https://'+site+'.mccarey-supon.workers.dev',pub='https://www.ball46.com',chart='/longterm-performance-343.js',workspace='/singlepage-workspace-343.js',target='b46-site-graph-patch-20261118.mjs';
const out=process.env.RUNNER_TEMP+'/settled-history-release';await mkdir(out,{recursive:true});
const h=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),decode=m=>Buffer.from(m.content_base64,'base64');
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function cf(p,method='GET',body){if(method!=='GET')assert(method==='POST'&&['/workers/scripts/'+site+'/versions?bindings_inherit=strict','/workers/scripts/'+site+'/deployments'].includes(p),'WRITE_SCOPE');const r=await fetch(root+p,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+method+'_'+r.status+'_'+(j.errors??[]).map(e=>e.code).join('_'));return j.result}
async function active(n){const v=(await cf('/workers/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100,'TRAFFIC_DRIFT_'+n);return v[0].version_id}
async function guard(id){assert.equal(await active(site),id,'SITE_DRIFT');assert.equal(await active(rec),receiver,'RECEIVER_DRIFT');assert.equal(await active(eng),engine,'ENGINE_DRIFT')}
async function version(id){for(let i=0;i<10;i++)try{return await cf('/workers/workers/'+site+'/versions/'+id+'?include=modules')}catch(e){if(i===9||!String(e).includes('10071'))throw e;await sleep(1200)}}
async function assign(id){await cf('/workers/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-approved automatic history restore after graph render'}})}
async function waitActive(id){for(let i=0;i<15;i++){if(await active(site)===id)return;await sleep(1500)}throw Error('ACTIVE_NOT_CONFIRMED')}
async function get(host,path){const r=await fetch(host+path,{headers:{'user-agent':'Mozilla/5.0 B46-VisualRelease','cache-control':'no-cache'},redirect:'manual',signal:AbortSignal.timeout(25000)});return {status:r.status,raw:Buffer.from(await r.arrayBuffer())}}
const unchanged=['/bulk-odds-compat-343.js','/b46-statistics-fast-v1-20261116.js'];
async function confirmScripts(host,expected){for(let i=0;i<24;i++){const r=await Promise.all(Object.keys(expected).map(async path=>{const x=await get(host,path);return x.status===200&&h(x.raw)===expected[path]}));if(r.every(Boolean))return;await sleep(2500)}throw Error('SCRIPT_PROPAGATION_FAILED_'+host)}

async function homepage(host){
 const b=await chromium.launch({headless:true});
 try{
  const p=await b.newPage(),calls=[],graphs=[];
  p.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/engine/statistics')calls.push([...u.searchParams.entries()].filter(([k])=>!['t','_','ts','cacheBust'].includes(k)).sort());if(u.pathname==='/b46-receiver-v1/graph')graphs.push(u.search)});
  await p.goto(host+'/',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>document.body?.dataset.workspaceView==='live');await p.waitForTimeout(3500);
  const flags=await p.evaluate(()=>({requested:!!window.__B46_FAST_DETAILS_REQUESTED,queued:!!window.__B46_HISTORY_AUTOLOAD_QUEUED,view:document.body?.dataset.workspaceView}));
  return {calls,graphs,flags};
 }finally{await b.close()}
}
function homeParity(a,b){assert.equal(b.flags.view,'live');assert.equal(b.flags.queued,false);assert.equal(b.flags.requested,a.flags.requested);assert.equal(b.graphs.length,a.graphs.length);assert(b.calls.length<=a.calls.length,'LIVE_EXTRA_HISTORY');for(const q of b.calls)assert(a.calls.some(x=>JSON.stringify(x)===JSON.stringify(q)),'LIVE_NEW_QUERY')}
async function qa(host,phase){
 const b=await chromium.launch({headless:true});
 try{for(const mobile of [false,true]){
  const ctx=await b.newContext({viewport:{width:mobile?390:1612,height:mobile?844:856},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const p=await ctx.newPage(),errors=[],history=[],seen=new Map();
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')history.push(r.url())});
  p.on('response',async r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph'&&r.status()===200)try{const d=await r.json();if(d.sidebarWinRates)seen.set(d.sequence,d.sidebarWinRates)}catch{}});
  await p.addInitScript(()=>{window.__historyReleaseFetch=[];const original=window.fetch;window.fetch=function(input,...rest){let url;try{url=new URL(typeof input==='string'?input:input.url,location.href)}catch{}if(url?.pathname==='/api/engine/statistics')window.__historyReleaseFetch.push({source:document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource,visible:!!document.querySelector('#b46-finance-chart-card .f46-plot')?.getClientRects().length,requested:!!window.__B46_FAST_DETAILS_REQUESTED});return original.call(this,input,...rest)}});
  const started=Date.now();await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver'&&document.querySelectorAll('[data-b46-win-rate]').length===8,null,{timeout:30000});
  const graphMs=Date.now()-started;
  await p.waitForFunction(()=>{const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return d?.ok&&Array.isArray(d.ledgerRows)&&d.ledgerRows.length===d.ledgerTotal&&d.ledgerRows.length>0},null,{timeout:120000});
  if(mobile)await p.getByText(/^\+?\s*Match details$/i).first().waitFor({state:'visible',timeout:30000});
  else await p.waitForFunction(()=>[...document.querySelectorAll('.sp-stats-content table tbody tr')].some(x=>x.cells.length>=4&&x.getClientRects().length>0),null,{timeout:30000});
  const d=await p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card'),s=window.BALL46_STATISTICS_DATA.getSnapshot();return {source:c.dataset.b46StatisticsSource,seq:Number(c.dataset.b46Sequence),settled:Number(c.dataset.b46Settled),total:s.ledgerRows.length,pending:s.pending,first:window.__historyReleaseFetch[0],rows:[...document.querySelectorAll('table tbody tr')].filter(e=>e.cells.length>=4&&e.getClientRects().length>0).length,example:[...document.querySelectorAll('table tbody tr')].find(e=>e.cells.length>=4)?.textContent.slice(0,160),sidebar:[...document.querySelectorAll('[data-stat-market] b')].map(e=>({market:e.closest('[data-stat-market]').dataset.statMarket,text:e.textContent,font:parseFloat(getComputedStyle(e).fontSize),after:getComputedStyle(e,'::after').content,color:getComputedStyle(e).color}))}});
  const cards=mobile?await p.getByText(/^\+?\s*Match details$/i).evaluateAll(els=>els.filter(e=>e.getClientRects().length>0).length):0;
  assert.equal(d.source,'receiver');assert(d.first?.source==='receiver'&&d.first.visible&&d.first.requested,'HISTORY_BEFORE_GRAPH');assert(mobile?cards>0:d.rows>0,'NO_VISIBLE_MATCHES');
  const aliases={all:'all','1x2':'1X2',ah:'AH',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
  assert.deepEqual(d.sidebar.map(x=>x.market),Object.keys(aliases));for(let i=0;i<20&&!seen.has(d.seq);i++)await sleep(100);const rates=seen.get(d.seq);assert(rates,'MISSING_RATES');
  for(const x of d.sidebar){const v=rates[aliases[x.market]].rate,round=v===null?null:Number(v.toFixed(2));assert.equal(x.text,v===null?'—':v.toFixed(2)+'%');assert(x.font>0&&x.after==='none');assert.equal(x.color,round===null?'rgb(145, 170, 155)':round>50?'rgb(34, 197, 94)':round<50?'rgb(248, 113, 113)':'rgb(250, 204, 21)')}
  assert.equal(errors.length,0,JSON.stringify(errors));await p.screenshot({path:out+'/'+phase+'-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
  console.log('HISTORY_RELEASE_BROWSER_PASS='+JSON.stringify({phase,mobile,graphMs,historyMs:Date.now()-started,settled:d.settled,loaded:d.total,pending:d.pending,rows:d.rows,cards,requests:history.length,source:d.source,jsErrors:errors.length,sidebar:d.sidebar,example:d.example}));
  await ctx.close();
 }}finally{await b.close()}
}
let candidate=null;
try{
 await guard(base);const v=await version(base),settings=await cf('/workers/scripts/'+site+'/settings'),sub=await cf('/workers/scripts/'+site+'/subdomain');assert(sub.enabled&&sub.previews_enabled);
 const old=v.modules.find(x=>x.name===target);assert(old&&v.modules.length===57,'MODULE_DRIFT');
 const src=decode(old).toString();
 const a='export function patchChart(s){return sidebarChart(basePatchChart(s))}',b='export function patchWorkspace(s){return sidebarWorkspace(basePatchWorkspace(s)).source}';
 assert(src.split(a).length===2&&src.split(b).length===2,'WRAPPER_DRIFT');
 const helper=await readFile(new URL('./settled-history-autoload-v1.mjs',import.meta.url),'utf8');
 const next=src.replace(a,()=>a.replace('return sidebarChart(basePatchChart(s))','return patchHistoryAutoload(sidebarChart(basePatchChart(s)))')).replace(b,()=>b.replace('return sidebarWorkspace(basePatchWorkspace(s)).source','return patchHistoryWorkspace(sidebarWorkspace(basePatchWorkspace(s)).source)'))+'\n'+helper;
 const expected={};for(const [p,patch] of [[chart,patchHistoryAutoload],[workspace,patchHistoryWorkspace]]){const r=await get(direct,p);assert.equal(r.status,200);const s=patch(r.raw.toString());new Function(s);expected[p]=h(Buffer.from(s))}
 const before={};for(const p of unchanged){const r=await get(direct,p);assert.equal(r.status,200);before[p]=h(r.raw)}
 const baseline=await homepage(pub);console.log('HISTORY_RELEASE_HOME_BASE='+JSON.stringify(baseline));
 const modules=v.modules.map(x=>x.name===target?{...x,content_base64:Buffer.from(next).toString('base64')}:x);assert(modules.reduce((n,m)=>n+gzipSync(decode(m)).length,0)<10*1024*1024,'WORKER_SIZE');
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags??[],bindings:v.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:base}:x),keep_assets:true,annotations:{'workers/message':'History autoload and sidebar selector fix only'}};
 if(v.assets?.config)meta.assets={config:v.assets.config};for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const x of modules)form.set(x.name,new Blob([decode(x)],{type:x.content_type}),x.name);
 await guard(base);candidate=(await cf('/workers/scripts/'+site+'/versions?bindings_inherit=strict','POST',form)).id;assert(candidate&&candidate!==base);
 const n=await version(candidate);assert.equal(n.main_module,v.main_module);assert.equal(n.modules.length,v.modules.length);assert.equal(canon(n.assets?.config),canon(v.assets?.config));assert.equal(n.bindings.length,v.bindings.length);
 for(const x of v.bindings){const y=n.bindings.find(z=>z.name===x.name);assert(y&&y.type===x.type);if(x.type!=='secret_text')assert.equal(canon(y),canon(x))}
 for(const x of modules){const y=n.modules.find(z=>z.name===x.name);assert(y&&h(decode(y))===h(decode(x)),'MODULE_HASH_'+x.name)}
 const preview='https://'+candidate.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';console.log('HISTORY_RELEASE_CANDIDATE='+JSON.stringify({candidate,base,preview,changedModules:1}));await writeFile(out+'/versions.json',JSON.stringify({candidate,base,receiver,engine,preview}));
 await confirmScripts(preview,expected);for(const p of unchanged){const r=await get(preview,p);assert.equal(r.status,200);assert.equal(h(r.raw),before[p])}
 await qa(preview,'candidate');const preHome=await homepage(preview);console.log('HISTORY_RELEASE_HOME_CANDIDATE='+JSON.stringify(preHome));homeParity(baseline,preHome);
 await guard(base);await assign(candidate);await waitActive(candidate);await guard(candidate);
 await confirmScripts(pub,expected);await qa(pub,'production');const liveHome=await homepage(pub);console.log('HISTORY_RELEASE_HOME_LIVE='+JSON.stringify(liveHome));homeParity(baseline,liveHome);await guard(candidate);
 for(const p of unchanged){const r=await get(direct,p);assert.equal(r.status,200);assert.equal(h(r.raw),before[p])}
 console.log('HISTORY_RELEASE_SUCCESS='+JSON.stringify({site:candidate,rollback:base,receiver,engine,changedModules:1,routeWrites:0,historyAutoload:true,sidebarPreserved:true,production:true}));
}catch(e){console.log('HISTORY_RELEASE_STOP='+JSON.stringify({candidate,error:String(e.message).slice(0,500)}));if(candidate&&await active(site)===candidate){await assign(base);await waitActive(base);console.log('HISTORY_RELEASE_ROLLBACK='+base)}throw e}
