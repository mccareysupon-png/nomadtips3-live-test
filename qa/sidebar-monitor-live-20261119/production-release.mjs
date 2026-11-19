// Owner-confirmed release. Upload an inactive version first; never replace another active release.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_AUTH_MISSING');
const site='ball46-production',engine='nomadtips3-engine-343',receiver='ball46-shadow-receiver-production',cache='ball46-sidebar-monitor-cache-20261119';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const direct='https://ball46-production.mccarey-supon.workers.dev',publicSite='https://ball46.com';
const out=process.env.RUNNER_TEMP+'/sidebar-production-proof';await mkdir(out,{recursive:true});
const require=createRequire(new URL('./.runtime/package.json',import.meta.url)),{chromium,devices}=require('playwright');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),sha=x=>createHash('sha256').update(x).digest('hex');
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function cf(path,method='GET',body){
 if(method!=='GET')assert(method==='POST'&&['/scripts/'+site+'/versions?bindings_inherit=strict','/scripts/'+site+'/deployments'].includes(path),'WRITE_SCOPE');
 const r=await fetch(api+path,{method,headers:{authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const j=await r.json();assert(r.ok&&j.success,'CF '+method+' '+path+' '+r.status+' '+JSON.stringify(j.errors??[]));return j.result;
}
async function active(n){const a=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;assert(a.length===1&&Number(a[0].percentage)===100,'TRAFFIC_DRIFT '+n);return a[0].version_id}
const start={site:await active(site),engine:await active(engine),receiver:await active(receiver)};
console.log('RELEASE_BASELINE '+JSON.stringify(start));await writeFile(out+'/rollback.json',JSON.stringify(start));
async function guard(id){assert.equal(await active(site),id,'SITE_CHANGED');assert.equal(await active(engine),start.engine,'ENGINE_CHANGED');assert.equal(await active(receiver),start.receiver,'RECEIVER_CHANGED')}
async function version(id){for(let i=0;i<10;i++){try{return await cf('/workers/'+site+'/versions/'+id+'?include=modules')}catch(e){if(i===9)throw e;await wait(1500)}}}
async function assign(id){await cf('/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-approved Sidebar Win Rate presentation and read-only monitor'}})}
async function waitActive(id){for(let i=0;i<12;i++){if(await active(site)===id)return;await wait(1500)}throw Error('ACTIVE_NOT_CONFIRMED')}
async function http(host,path){const t=performance.now(),r=await fetch(host+path,{redirect:'follow',headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-SidebarRelease'},signal:AbortSignal.timeout(30000)});const body=Buffer.from(await r.arrayBuffer());let data=null,monitor=null;try{data=JSON.parse(body.toString())}catch{}try{monitor=JSON.parse(r.headers.get('x-b46-monitor-rates'))}catch{}return {status:r.status,body,data,monitor,ms:performance.now()-t}}
const markets=['all','1X2','AH','O/U','BTTS','Corners','Cards','Other'];
const query=m=>'/b46-receiver-v1/graph?'+new URLSearchParams({market:m,variant:'all',filter:'all',range:'all'});
function valid(s){return s&&Number.isSafeInteger(s.sequence)&&s.rates&&Object.keys(s.rates).length===8&&Object.values(s.rates).every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100)}
async function warm(host){for(let i=0;i<16;i++){const v=await http(host,query('all'));if(v.status===200&&valid(v.monitor)&&v.monitor.sequence>=v.data?.sequence)return v.monitor;await wait(1200)}throw Error('NO_REAL_MONITOR_HEADER')}
async function parity(host){const report=[];for(const m of markets){let ok=false;for(let i=0;i<5;i++){const [a,b]=await Promise.all([http(direct,query(m)),http(host,query(m))]);if(a.status===200&&b.status===200&&a.data?.sequence===b.data?.sequence){assert.deepEqual(b.data,a.data,'GRAPH_BODY_DRIFT '+m);if(valid(b.monitor)){assert(b.monitor.sequence>=b.data.sequence);ok=true;report.push({market:m,rows:b.data.summary.rows,sequence:b.data.sequence,ms:Math.round(b.ms)});break}}await wait(800)}assert(ok,'PARITY '+m)}console.log('GRAPH_PARITY '+JSON.stringify(report));return report}
async function sameAssets(host,expected){for(const [p,hash]of Object.entries(expected)){const r=await http(host,p);assert.equal(r.status,200,p);assert.equal(sha(r.body),hash,'ORIGINAL_ASSET_CHANGED '+p)}}
async function browserQA(host,label,fixture=false){
 const browser=await chromium.launch({headless:true});try{
  for(const mobile of [false,true]){
   const p=await browser.newPage(mobile?{...devices['iPhone 13'],serviceWorkers:'block'}:{viewport:{width:1440,height:950},serviceWorkers:'block'});
   await p.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
   const errors=[],seen=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/b46-receiver-v1/graph'))seen.push(r.headers()['x-b46-monitor-rates']??null)});
   try{
    await p.goto(host+'/index.html?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
    if(mobile){
     await p.waitForFunction(()=>document.querySelector('[data-b46m-open]')&&[...document.querySelectorAll('[data-sp-table-body] tr')].some(r=>r.cells.length>=4),null,{timeout:90000});
     await p.locator('[data-b46m-open]').click();
     await p.waitForFunction(()=>document.querySelector('[data-b46m-open]')?.getAttribute('aria-expanded')==='true',null,{timeout:10000});
     const mobileView=await p.evaluate(()=>({overlay:document.querySelectorAll('[data-b46-rate-snapshot]').length,mask:!!document.getElementById('b46-css-only-mask'),bridge:!!document.querySelector('script[src*="b46-sidebar-monitor-client"]'),drawer:!!document.querySelector('#b46m-drawer'),drawerText:document.querySelector('#b46m-drawer')?.innerText?.slice(0,300),rows:[...document.querySelectorAll('[data-sp-table-body] tr')].filter(r=>r.cells.length>=4).length,graph:!!document.querySelector('#b46-finance-chart-card'),width:innerWidth}));
     assert(mobileView.overlay===0&&!mobileView.mask&&!mobileView.bridge&&mobileView.drawer&&mobileView.rows>0&&mobileView.graph,'MOBILE_NATIVE_LAYOUT');
     assert(!seen.some(Boolean),'MOBILE_MONITOR_HEADER_UNEXPECTED');
     assert.deepEqual(errors,[],'MOBILE_BROWSER_ERRORS');
     await p.screenshot({path:out+'/'+label+'-mobile-native.png',fullPage:false});
     console.log('MOBILE_NATIVE_PASS '+JSON.stringify({label,...mobileView}));continue;
    }
    await p.waitForFunction(()=>document.querySelectorAll('[data-b46-rate-snapshot]').length===8&&document.querySelectorAll('[data-stat-market] b').length===8,null,{timeout:35000});
    await p.waitForFunction(()=>[...document.querySelectorAll('[data-sp-table-body] tr')].some(r=>r.cells.length>=4),null,{timeout:90000});
    await p.waitForFunction(()=>[...document.querySelectorAll('[data-b46-rate-snapshot]')].every(e=>e.dataset.b46MonitorLive==='1'),null,{timeout:50000});
    const view=await p.evaluate(()=>({labels:[...document.querySelectorAll('[data-b46-rate-snapshot]')].map(e=>({k:e.dataset.b46RateSnapshot,v:e.textContent,seq:e.dataset.b46MonitorSequence,font:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight,visible:!!e.getClientRects().length})),counts:[...document.querySelectorAll('[data-stat-market] b')].map(e=>({v:e.textContent,hidden:getComputedStyle(e).visibility==='hidden'})),rows:document.querySelectorAll('[data-sp-table-body] tr').length}));
    assert.equal(view.labels.length,8);assert(view.labels.every(x=>x.seq&&x.font==='10px'&&x.weight==='700'&&x.visible));assert(view.counts.length===8&&view.counts.every(x=>x.hidden));assert(view.rows>0&&seen.some(Boolean),'REAL_BROWSER_HEADER_MISSING');
    if(!mobile){
     for(const m of ['all','1x2','ah','ou','btts','corners','cards','other']){
      const b=p.locator('[data-stat-market="'+m+'"]').first();assert(await b.isVisible(),'MISSING_MARKET '+m);await b.click();await p.waitForTimeout(400);
      const identity=await p.evaluate(m=>{const n=[...document.querySelectorAll('[data-sp-table-body] tr')],c=[...document.querySelectorAll('[data-stat-market] b')];const style=document.getElementById('b46-css-only-mask');const a=n.map(x=>x.textContent);style.disabled=true;const same=n.every((x,i)=>x===document.querySelectorAll('[data-sp-table-body] tr')[i]);style.disabled=false;return {same,unchanged:a.every((x,i)=>x===n[i].textContent),counts:c.length,active:document.querySelector('[data-stat-market].active')?.dataset.statMarket}},m);assert(identity.same&&identity.unchanged&&identity.counts===8&&identity.active===m,'NAV '+m);
     }
     if(fixture){
      const current=JSON.parse(seen.filter(Boolean).at(-1)),fake={...current,sequence:current.sequence+100000,rates:{...current.rates,all:12.34}};
      // Browser-only test; never submit a fake settlement or alter any remote data.
      await p.route('**/b46-receiver-v1/graph?*',async route=>{const r=await route.fetch();await route.fulfill({response:r,headers:{...r.headers(),'x-b46-monitor-rates':JSON.stringify(fake)}})},{times:1});
      const v=await p.evaluate(async()=>{const prior=document.querySelector('[data-stat-market="all"] b'),text=prior.textContent;const r=await fetch('/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all');await r.json();await new Promise(r=>setTimeout(r,100));return {ok:r.ok,rate:document.querySelector('[data-b46-rate-snapshot="all"]').textContent,same:prior===document.querySelector('[data-stat-market="all"] b')&&text===prior.textContent}});
      assert(v.ok&&v.same&&v.rate==='12.34%','BROWSER_DYNAMIC_UPDATE');console.log('BROWSER_DYNAMIC_UPDATE_PASS');
     }
    }
    assert.deepEqual(errors,[],'BROWSER_ERRORS');
    await p.screenshot({path:out+'/'+label+'-'+(mobile?'mobile':'pc')+'.png',fullPage:true});
    console.log('BROWSER_REAL_PASS '+JSON.stringify({label,mobile,...view}));
   }catch(e){console.log('BROWSER_STOP '+JSON.stringify({label,mobile,reason:e.message,errors,headers:seen.filter(Boolean).length}));await p.screenshot({path:out+'/'+label+'-failure.png',fullPage:true}).catch(()=>{});throw e}finally{await p.close()}
  }
 }finally{await browser.close()}
}
let candidate=null;
try{
 await guard(start.site);
 const base=await version(start.site),settings=await cf('/scripts/'+site+'/settings'),sub=await cf('/scripts/'+site+'/subdomain');
 assert(base.main_module&&Array.isArray(base.modules)&&base.modules.length>0,'BASE_MODULES_MISSING');
 assert(sub.enabled&&sub.previews_enabled,'NO_INACTIVE_PREVIEW');
 const binding={name:'B46_SIDEBAR_MONITOR',type:'service',service:cache,environment:'production'};
 assert(!(base.bindings??[]).some(b=>b.name===binding.name),'BINDING_EXISTS');
 const expected={};for(const p of ['/singlepage-workspace-343.js','/longterm-performance-343.js','/b46-statistics-fast-v1-20261116.js','/bulk-odds-compat-343.js']){const a=await http(direct,p);assert.equal(a.status,200);expected[p]=sha(a.body)}
 const wrapper=(await readFile(new URL('./production-wrapper.mjs',import.meta.url),'utf8')).replaceAll('__ORIGINAL_MAIN__',base.main_module);
 const js=await readFile(new URL('./production-client.js',import.meta.url),'utf8');new Function(js);
 const wrapperName='b46-sidebar-monitor-entry-20261119.mjs',sourceName='b46-sidebar-monitor-client-source-20261119.mjs';
 const added=[{name:wrapperName,content_type:'application/javascript+module',content_base64:Buffer.from(wrapper).toString('base64')},{name:sourceName,content_type:'application/javascript+module',content_base64:Buffer.from('export const BRIDGE_SOURCE='+JSON.stringify(js)+';').toString('base64')}];
 const modules=[...base.modules,...added];assert(new Set(modules.map(m=>m.name)).size===modules.length,'DUPLICATE_MODULE');
 assert(modules.reduce((n,m)=>n+gzipSync(Buffer.from(m.content_base64,'base64')).length,0)<10*1024*1024-100*1024,'SIZE_LIMIT');
 const bindings=base.bindings??[];
 const meta={main_module:wrapperName,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags??[],bindings:[...bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:start.site}:b),binding],keep_assets:true,annotations:{'workers/message':'Sidebar only, original application modules retained'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const m of modules)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 await guard(start.site);candidate=(await cf('/scripts/'+site+'/versions?bindings_inherit=strict','POST',form)).id;assert(candidate&&candidate!==start.site);
 const v=await version(candidate),vm=new Map(v.modules.map(m=>[m.name,m]));assert.equal(v.main_module,wrapperName);assert.equal(v.modules.length,modules.length);
 for(const m of modules){const n=vm.get(m.name);assert(n&&n.content_type===m.content_type&&sha(Buffer.from(n.content_base64,'base64'))===sha(Buffer.from(m.content_base64,'base64')),'MODULE_DRIFT '+m.name)}
 assert.equal(v.bindings.length,bindings.length+1);for(const b of bindings){const n=v.bindings.find(x=>x.name===b.name);assert(n&&n.type===b.type);if(b.type!=='secret_text')assert.equal(canon(n),canon(b),'BINDING_DRIFT '+b.name)}
 assert(v.bindings.some(b=>b.name===binding.name&&b.service===cache&&b.type==='service'));
 assert.equal(canon(v.compatibility_flags??[]),canon(base.compatibility_flags??[]));assert.equal(v.compatibility_date,base.compatibility_date);assert.equal(canon(v.assets?.config),canon(base.assets?.config));
 const preview='https://'+candidate.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';
 console.log('INACTIVE_CANDIDATE '+JSON.stringify({candidate,preview,rollback:start.site,modules:base.modules.length,addedModules:added.length}));await writeFile(out+'/candidate.json',JSON.stringify({candidate,preview,rollback:start.site}));
 let ready=false;for(let i=0;i<15;i++){const a=await http(preview,'/b46-sidebar-monitor-client-20261119.js');if(a.status===200&&sha(a.body)===sha(Buffer.from(js))){ready=true;break}await wait(1500)}assert(ready,'PREVIEW_NOT_READY');
 const snapshot=await warm(preview);console.log('CANDIDATE_REAL_MONITOR '+JSON.stringify(snapshot));await sameAssets(preview,expected);await parity(preview);
 await browserQA(preview,'candidate',true);
 const samples=[];for(let i=0;i<10;i++){const [a,b]=await Promise.all([http(direct,query('all')),http(preview,query('all'))]);assert(a.status===200&&b.status===200,'BENCH_HTTP');samples.push({base:Math.round(a.ms),candidate:Math.round(b.ms)})}
 const median=x=>{const a=x.slice().sort((a,b)=>a-b);return (a[4]+a[5])/2};
 const baseline=median(samples.map(s=>s.base)),after=median(samples.map(s=>s.candidate));console.log('API_BENCH '+JSON.stringify({baseline,after,samples}));
 // Owner approved the observed +27.5ms; retain the prior 144ms reference as a safety limit.
 const ceiling=Math.max(144,baseline+27.5);console.log('OWNER_SPEED_ACCEPTANCE '+JSON.stringify({baseline,after,ceiling,approvedDeltaMs:27.5}));assert(after<=ceiling,'API_SLOWDOWN_ABOVE_APPROVED_GUARD');
 await guard(start.site);
 await assign(candidate);await waitActive(candidate);await guard(candidate);
 await sameAssets(direct,expected);await warm(direct);await parity(direct);await browserQA(publicSite,'production',false);await guard(candidate);
 console.log('PRODUCTION_RELEASE_PASS '+JSON.stringify({active:candidate,rollback:start.site,engine:start.engine,receiver:start.receiver,baseline,after}));
}catch(e){
 console.log('RELEASE_STOP '+JSON.stringify({message:String(e.message).slice(0,500),candidate}));
 // Never rollback another operator's version; only our activated version.
 if(candidate&&await active(site)===candidate){await assign(start.site);await waitActive(start.site);console.log('PRODUCTION_ROLLBACK '+start.site)}
 throw e;
}
