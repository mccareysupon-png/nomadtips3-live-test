// Owner-approved frontend-only repair; preserve all active modules/bindings except one UI patch.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {patchVisual} from './sidebar-winrate-visual-hotfix.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const site='ball46-production',rec='ball46-shadow-receiver-production',eng='nomadtips3-engine-343';
const base='416e70e3-de42-46c8-9fe9-193648c3dc95',receiver='571103b5-12ce-402b-8720-3e154f89634d',engine='db65134e-a12d-4084-937e-3ce6e986c251';
const root='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc',token=process.env.CLOUDFLARE_API_TOKEN;
assert(token);const direct='https://'+site+'.mccarey-supon.workers.dev',pub='https://www.ball46.com',script='/singlepage-workspace-343.js',target='sidebar-winrate-v1-patch.mjs';
const out=process.env.RUNNER_TEMP+'/sidebar-visual-release';await mkdir(out,{recursive:true});
const h=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),decode=m=>Buffer.from(m.content_base64,'base64');
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function cf(p,method='GET',body){if(method!=='GET')assert(method==='POST'&&['/workers/scripts/'+site+'/versions?bindings_inherit=strict','/workers/scripts/'+site+'/deployments'].includes(p),'WRITE_SCOPE');const r=await fetch(root+p,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+method+'_'+r.status+'_'+(j.errors??[]).map(e=>e.code).join('_'));return j.result}
async function active(n){const v=(await cf('/workers/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;assert(v.length===1&&Number(v[0].percentage)===100,'TRAFFIC_DRIFT_'+n);return v[0].version_id}
async function guard(id){assert.equal(await active(site),id,'SITE_DRIFT');assert.equal(await active(rec),receiver,'RECEIVER_DRIFT');assert.equal(await active(eng),engine,'ENGINE_DRIFT')}
async function version(id){for(let i=0;i<10;i++)try{return await cf('/workers/workers/'+site+'/versions/'+id+'?include=modules')}catch(e){if(i===9||!String(e).includes('10071'))throw e;await sleep(1200)}}
async function assign(id){await cf('/workers/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-approved Win Rate visual-only legacy count attribute repair'}})}
async function waitActive(id){for(let i=0;i<15;i++){if(await active(site)===id)return;await sleep(1500)}throw Error('ACTIVE_NOT_CONFIRMED')}
async function get(host,path){const r=await fetch(host+path,{headers:{'user-agent':'Mozilla/5.0 B46-VisualRelease','cache-control':'no-cache'},redirect:'manual',signal:AbortSignal.timeout(25000)});return {status:r.status,raw:Buffer.from(await r.arrayBuffer())}}
const unchanged=['/longterm-performance-343.js','/bulk-odds-compat-343.js','/b46-statistics-fast-v1-20261116.js'];
async function confirmScripts(host,expected){for(let i=0;i<24;i++){const r=await get(host,script);if(r.status===200&&h(r.raw)===expected)return;await sleep(2500)}throw Error('SCRIPT_PROPAGATION_FAILED_'+host)}
const aliases={all:'all','1x2':'1X2',ah:'AH',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
const label=v=>v===null?'—':v.toFixed(2)+'%',color=v=>v===null?'rgb(145, 170, 155)':Number(v.toFixed(2))>50?'rgb(34, 197, 94)':Number(v.toFixed(2))<50?'rgb(248, 113, 113)':'rgb(250, 204, 21)';
async function qa(host,phase){
 const b=await chromium.launch({headless:true});
 try{for(const mobile of [false,true]){
  const ctx=await b.newContext({viewport:{width:mobile?390:1612,height:mobile?844:856},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const p=await ctx.newPage(),errors=[],history=[],seen=new Map();
  p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')history.push(r.url())});
  p.on('response',async r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph'&&r.status()===200)try{const d=await r.json();if(d.sidebarWinRates)seen.set(d.sequence,d.sidebarWinRates)}catch{}});
  async function inspect(m){
   await p.waitForFunction(m=>{const c=document.querySelector('#b46-finance-chart-card');const rows=[...document.querySelectorAll('[data-stat-market] b')];return c?.dataset.b46StatisticsSource==='receiver'&&c.dataset.b46Market===m&&rows.length===8&&rows.every(e=>e.dataset.b46WinRate==='1'&&!e.hasAttribute('data-b46-display')&&parseFloat(getComputedStyle(e).fontSize)>0&&getComputedStyle(e,'::after').content==='none')},m,{timeout:30000});
   const d=await p.evaluate(()=>({seq:Number(document.querySelector('#b46-finance-chart-card').dataset.b46Sequence),settled:Number(document.querySelector('#b46-finance-chart-card').dataset.b46Settled),rows:[...document.querySelectorAll('[data-stat-market] b')].map(e=>({market:e.closest('[data-stat-market]').dataset.statMarket,text:e.textContent,font:parseFloat(getComputedStyle(e).fontSize),after:getComputedStyle(e,'::after').content,color:getComputedStyle(e).color,display:e.dataset.b46Display??null,zero:e.dataset.b46Zero??null})),status:[...document.querySelectorAll('[data-status-filter] b')].map(e=>({text:e.textContent,display:e.dataset.b46Display??null})),detail:!!document.querySelector('[data-b46-legacy-details]')?.getClientRects().length}));
   for(let i=0;i<20&&!seen.has(d.seq);i++)await sleep(100);
   const rates=seen.get(d.seq);assert(rates,'MISSING_GRAPH_RATES');assert.deepEqual(d.rows.map(x=>x.market),Object.keys(aliases));
   for(const x of d.rows){const v=rates[aliases[x.market]].rate;assert.equal(x.text,label(v));assert.equal(x.color,color(v));assert(x.font>0);assert.equal(x.after,'none');assert.equal(x.display,null);assert.equal(x.zero,null)}
   if(!mobile)assert(d.status.some(x=>/^\d+$/.test(x.text.trim())&&x.display!==null),'STATUS_FORMATTER_DRIFT');
   assert(d.detail,'DETAIL_BUTTON_MISSING');assert.equal(history.length,0,'EARLY_HISTORY');assert.equal(errors.length,0,JSON.stringify(errors));return d;
  }
  assert.equal((await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000}))?.status(),200);
  const d=await inspect('all');await p.screenshot({path:out+'/'+phase+'-'+(mobile?'mobile':'desktop')+'.png'});
  if(!mobile){for(const [n,m] of [['corners','Corners'],['1x2','1X2']]){await p.locator('[data-stat-market="'+n+'"]').click();await inspect(m)}await p.waitForTimeout(16000);await inspect('1X2');await p.locator('[data-stat-market="all"]').click();await inspect('all')}
  console.log('VISUAL_RELEASE_BROWSER_PASS='+JSON.stringify({phase,mobile,sequence:d.seq,settled:d.settled,rows:d.rows,historyButton:d.detail,historyRequests:history.length,jsErrors:errors.length}));await ctx.close();
 }}finally{await b.close()}
}
let candidate=null;
try{
 await guard(base);const v=await version(base),settings=await cf('/workers/scripts/'+site+'/settings'),sub=await cf('/workers/scripts/'+site+'/subdomain');assert(sub.enabled&&sub.previews_enabled);
 const old=v.modules.find(x=>x.name===target);assert(old&&v.modules.length===57,'MODULE_DRIFT');
 const src=decode(old).toString(),staged=await readFile(new URL('./sidebar-winrate-v1-patch.mjs',import.meta.url),'utf8');assert.equal(src,staged,'PATCH_MODULE_DRIFT');
 const next=patchVisual(src);assert.notEqual(src,next);
 const oldScript=await get(direct,script);assert.equal(oldScript.status,200);
 const expected=patchVisual(oldScript.raw.toString());new Function(expected);
 const expectedHash=h(Buffer.from(expected));const before={};for(const p of unchanged){const r=await get(direct,p);assert.equal(r.status,200);before[p]=h(r.raw)}
 const modules=v.modules.map(x=>x.name===target?{...x,content_base64:Buffer.from(next).toString('base64')}:x);assert(modules.reduce((n,m)=>n+gzipSync(decode(m)).length,0)<10*1024*1024,'WORKER_SIZE');
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags??[],bindings:v.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:base}:x),keep_assets:true,annotations:{'workers/message':'Sidebar visual hotfix only; no data source changes'}};
 if(v.assets?.config)meta.assets={config:v.assets.config};for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const x of modules)form.set(x.name,new Blob([decode(x)],{type:x.content_type}),x.name);
 await guard(base);candidate=(await cf('/workers/scripts/'+site+'/versions?bindings_inherit=strict','POST',form)).id;assert(candidate&&candidate!==base);
 const n=await version(candidate);assert.equal(n.main_module,v.main_module);assert.equal(n.modules.length,v.modules.length);assert.equal(canon(n.assets?.config),canon(v.assets?.config));assert.equal(n.bindings.length,v.bindings.length);
 for(const x of v.bindings){const y=n.bindings.find(z=>z.name===x.name);assert(y&&y.type===x.type);if(x.type!=='secret_text')assert.equal(canon(y),canon(x))}
 for(const x of modules){const y=n.modules.find(z=>z.name===x.name);assert(y&&h(decode(y))===h(decode(x)),'MODULE_HASH_'+x.name)}
 const preview='https://'+candidate.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';
 console.log('VISUAL_RELEASE_CANDIDATE='+JSON.stringify({candidate,base,preview,changedModules:1}));await writeFile(out+'/versions.json',JSON.stringify({candidate,base,receiver,engine,preview}));
 await confirmScripts(preview,expectedHash);for(const p of unchanged){const r=await get(preview,p);assert.equal(r.status,200);assert.equal(h(r.raw),before[p])}
 await qa(preview,'candidate');await guard(base);await assign(candidate);await waitActive(candidate);await guard(candidate);
 await confirmScripts(pub,expectedHash);await qa(pub,'production');await guard(candidate);
 for(const p of unchanged){const r=await get(direct,p);assert.equal(r.status,200);assert.equal(h(r.raw),before[p])}
 console.log('VISUAL_RELEASE_SUCCESS='+JSON.stringify({site:candidate,rollback:base,receiver,engine,changedModules:1,routeWrites:0,production:true}));
}catch(e){console.log('VISUAL_RELEASE_STOP='+JSON.stringify({candidate,error:String(e.message).slice(0,400)}));if(candidate&&await active(site)===candidate){await assign(base);await waitActive(base);console.log('VISUAL_RELEASE_ROLLBACK='+base)}throw e}
