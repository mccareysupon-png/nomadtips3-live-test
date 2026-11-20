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
const out=process.env.RUNNER_TEMP+'/stats-roi-production-proof';await mkdir(out,{recursive:true});
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
async function assign(id){await cf('/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-approved statistics ROI sign colors'}})}
async function waitActive(id){for(let i=0;i<12;i++){if(await active(site)===id)return;await wait(1500)}throw Error('ACTIVE_NOT_CONFIRMED')}
async function http(host,path){const t=performance.now(),r=await fetch(host+path,{redirect:'follow',headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-SidebarRelease'},signal:AbortSignal.timeout(30000)});const body=Buffer.from(await r.arrayBuffer());let data=null,monitor=null;try{data=JSON.parse(body.toString())}catch{}try{monitor=JSON.parse(r.headers.get('x-b46-monitor-rates'))}catch{}return {status:r.status,body,data,monitor,ms:performance.now()-t}}

const dashboard='/dashboard-v2-stage3-featured-facts-20261013a.js';
const immutablePaths=['/singlepage-workspace-343.js','/bulk-odds-compat-343.js'];
const uaMobile='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
async function asset(host,path,mobile=false){const res=await fetch(host+path,{headers:{'cache-control':'no-cache','user-agent':mobile?uaMobile:'Mozilla/5.0 B46-UIRelease'},signal:AbortSignal.timeout(30000)});assert.equal(res.status,200,path);return res.text()}
async function preflight(host,mobile=false,patched=false){
 const h=await asset(host,'/index.html',mobile);
 const href=[...h.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]).find(x=>x.includes(dashboard.slice(1)));assert(href,'DASHBOARD_NOT_FOUND');
 const d=new URL(href,host),j=await asset(host,d.pathname+d.search,mobile);
 const html=h,js=j;
 assert(html.includes('id="b46-stats-clean-filters-20261120"'),'PREVIOUS_LAYOUT_MISSING');assert(html.includes('id="b46-stats-source-label-20261120"'),'PREVIOUS_SOURCE_MASK_MISSING');
 const f=await asset(host,'/longterm-performance-343.js',mobile);assert(f.includes('function b46DisplayFixed'),'PREVIOUS_NUMBER_FORMAT_MISSING');assert.equal(html.includes('id="b46-stats-roi-color-20261120"'),patched,'ROI_CSS_VERSION '+host);for(const path of ['/longterm-performance-343.js','/b46-statistics-card-20261116.js','/b46-statistics-fast-v1-20261116.js']){const code=await asset(host,path,mobile);assert.equal(code.includes('function b46RoiTone'),patched,'ROI_RENDERER_VERSION '+path);new Function(code)}
 const marks=['>Live Predictions</span>','b46-member-promo-cta-test-20261120','brightness(1.08)','content:"ACTIVE PREDICTIONS"'];assert(marks.every(m=>html.includes(m)),'HTML_UI_PATCH '+JSON.stringify({host,mobile,matched:marks.map(m=>html.includes(m))}));
 assert(js.includes("hasSignals?'FEATURED LIVE PREDICTION':'FEATURED MATCH'")&&js.includes("label=n===1?'Prediction':'Predictions'"),'DASHBOARD_UI_PATCH');
 new Function(js);console.log('SOURCE_PREFLIGHT '+JSON.stringify({host,mobile,patched}));
}
async function sameAssets(host,expected){for(const [p,hash]of Object.entries(expected)){const r=await http(host,p);assert.equal(r.status,200,p);assert.equal(sha(r.body),hash,'ORIGINAL_ASSET_CHANGED '+p)}}
async function graphParity(host){
 const p='/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all';
 for(let i=0;i<5;i++){const [a,b]=await Promise.all([http(direct,p),http(host,p)]);assert(a.status===200&&b.status===200,'API_GRAPH_HTTP');if(a.data?.sequence===b.data?.sequence){assert.deepEqual(b.data,a.data,'API_GRAPH_BODY_DRIFT');console.log('GRAPH_PARITY '+JSON.stringify({host,sequence:b.data?.sequence}));return}await wait(600)}
 throw Error('GRAPH_SEQUENCE_RACE');
}
async function browserQA(base,label){
const browser=await chromium.launch();try{await Promise.all(['wide-dark','desktop-light','mobile-dark','mobile-light'].map(async mode=>{const mobile=mode.startsWith('mobile'),theme=mode.endsWith('dark')?'dark':'light';
const p=await browser.newPage(mobile?{...devices['iPhone 13'],serviceWorkers:'block'}:{viewport:{width:mode.startsWith('wide')?1920:1440,height:950},serviceWorkers:'block'});
await p.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);
await p.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(base+'/index.html?view=statistics',{waitUntil:'domcontentloaded'});
for(const path of ['/longterm-performance-343.js','/b46-statistics-card-20261116.js','/b46-statistics-fast-v1-20261116.js']){
  const src=await p.request.get(base+path);assert.equal(src.status(),200);const js=await src.text();new Function(js);const helper=js.match(/function b46RoiTone\(v\)\{[^\n]+\}/)?.[0];assert(helper,'ROI_HELPER_MISSING');const tone=new Function(helper+';return b46RoiTone')();assert.deepEqual(['2.8%','-2.8%','0%','0.0%','-0.0%','—'].map(tone),['green','red','yellow','yellow','yellow','neutral']);
}
await p.waitForFunction(()=>[...document.querySelectorAll('[data-sp-table-body] tr')].some(r=>r.cells.length>=4),null,{timeout:90000});
for(const market of ['all','1x2','ah','ou','btts','corners','cards','other','all']){
if(!mobile)await p.locator('[data-stat-market="'+market+'"]').first().click();
else{await p.locator('[data-stat-market="'+market+'"]').first().evaluate(e=>e.click())}
await p.waitForFunction(m=>document.querySelector('[data-stat-market].active')?.dataset.statMarket===m&&document.querySelector('#b46-finance-chart-card')?.getBoundingClientRect().height>0&&document.querySelector('.sp-results')?.getBoundingClientRect().height>0,market,{timeout:15000});await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card .f46-card')?.getBoundingClientRect().height>0,null,{timeout:20000});await p.waitForTimeout(2000);
const proof=await p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card');const items=[...c.querySelectorAll('.f46-metrics > div,.b46-stage-summary-item,.b46-v1-market-detail')].filter(e=>e.querySelector('span,small')?.textContent.trim()==='ROI').map(e=>{const v=e.querySelector('b,strong');return {value:v?.textContent.trim(),tone:v?.dataset.b46RoiTone,color:v?getComputedStyle(v).color:null,visible:!!v?.getClientRects().length}});return {active:document.querySelector('[data-stat-market].active')?.dataset.statMarket,theme:document.documentElement.dataset.theme,items}});
console.log('ROI_PROOF '+JSON.stringify({label,mode,market,...proof}));assert.equal(proof.active,market);const visible=proof.items.filter(x=>x.visible);assert(visible.length>0,'ROI_NOT_VISIBLE');for(const x of visible){const n=parseFloat(x.value),tone=Number.isNaN(n)?'neutral':n>0?'green':n<0?'red':'yellow';assert.equal(x.tone,tone,'WRONG_ROI_TONE');if(tone!=='neutral'){const palette=proof.theme==='dark'?{green:'rgb(85, 214, 161)',red:'rgb(255, 114, 126)',yellow:'rgb(245, 206, 87)'}:{green:'rgb(8, 124, 80)',red:'rgb(180, 35, 54)',yellow:'rgb(148, 98, 0)'};assert.equal(x.color,palette[tone],'WRONG_ROI_PAINT')}}
}await p.close()
}))}finally{await browser.close()}

}
let candidate=null;
try{
 await guard(start.site);
 await preflight(direct,false,false);await preflight(direct,true,false);
 const base=await version(start.site),settings=await cf('/scripts/'+site+'/settings'),sub=await cf('/scripts/'+site+'/subdomain');
 assert(base.main_module&&Array.isArray(base.modules)&&base.modules.length>0,'BASE_MODULES_MISSING');assert(sub.enabled&&sub.previews_enabled,'NO_INACTIVE_PREVIEW');
 const expected={};for(const p of immutablePaths){const a=await http(direct,p);assert.equal(a.status,200,p);expected[p]=sha(a.body)}
 const wrapper=(await readFile(new URL('./wrapper.mjs',import.meta.url),'utf8')).replaceAll('__ORIGINAL_MAIN__',base.main_module);
 const wrapperName='b46-stats-roi-entry-20261120.mjs';
 const added=[{name:wrapperName,content_type:'application/javascript+module',content_base64:Buffer.from(wrapper).toString('base64')}];
 const modules=[...base.modules,...added];assert(new Set(modules.map(m=>m.name)).size===modules.length,'DUPLICATE_MODULE');
 const bytes=added.reduce((n,m)=>n+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);assert(bytes<=16384,'ADDITIVE_SIZE');console.log('ADDED_MODULES '+JSON.stringify({count:added.length,compressedBytes:bytes}));
 const bindings=base.bindings??[];
 const meta={main_module:wrapperName,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags??[],bindings:bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:start.site}:b),keep_assets:true,annotations:{'workers/message':'Owner-approved statistics ROI sign colors only'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));for(const m of modules)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 await guard(start.site);candidate=(await cf('/scripts/'+site+'/versions?bindings_inherit=strict','POST',form)).id;assert(candidate&&candidate!==start.site);
 const v=await version(candidate),vm=new Map(v.modules.map(m=>[m.name,m]));assert.equal(v.main_module,wrapperName);assert.equal(v.modules.length,modules.length);
 for(const m of modules){const n=vm.get(m.name);assert(n&&n.content_type===m.content_type&&sha(Buffer.from(n.content_base64,'base64'))===sha(Buffer.from(m.content_base64,'base64')),'MODULE_DRIFT '+m.name)}
 assert.equal(v.bindings.length,bindings.length);for(const b of bindings){const n=v.bindings.find(x=>x.name===b.name);assert(n&&n.type===b.type);if(b.type!=='secret_text')assert.equal(canon(n),canon(b),'BINDING_DRIFT '+b.name)}
 assert.equal(canon(v.compatibility_flags??[]),canon(base.compatibility_flags??[]));assert.equal(v.compatibility_date,base.compatibility_date);assert.equal(canon(v.assets?.config),canon(base.assets?.config));
 const preview='https://'+candidate.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';
 console.log('INACTIVE_CANDIDATE '+JSON.stringify({candidate,preview,rollback:start.site}));await writeFile(out+'/candidate.json',JSON.stringify({candidate,preview,rollback:start.site}));
 let ready=false;for(let i=0;i<15;i++){try{await preflight(preview,false,true);ready=true;break}catch(e){if(i===14)throw e;await wait(1500)}}assert(ready,'PREVIEW_NOT_READY');
 await preflight(preview,true,true);await sameAssets(preview,expected);await graphParity(preview);await browserQA(preview,'candidate');
 await guard(start.site);await assign(candidate);await waitActive(candidate);await guard(candidate);
 // Cloudflare's deployment record can become visible before globally served routes refresh.
 let propagated=false;for(let i=0;i<20;i++){await guard(candidate);try{await preflight(direct,false,true);await preflight(direct,true,true);await preflight(publicSite,false,true);propagated=true;break}catch(e){console.log('EDGE_PROPAGATION_CHECK '+JSON.stringify({attempt:i+1,reason:String(e.message).slice(0,350)}));if(i===19)throw e;await wait(2500)}}assert(propagated,'EDGE_PROPAGATION_TIMEOUT');
 await sameAssets(direct,expected);await graphParity(publicSite);await browserQA(publicSite,'production');await guard(candidate);
 console.log('PRODUCTION_RELEASE_PASS '+JSON.stringify({active:candidate,rollback:start.site,engine:start.engine,receiver:start.receiver}));
}catch(e){
 console.log('RELEASE_STOP '+JSON.stringify({message:String(e.message).slice(0,600),candidate}));
 if(candidate&&await active(site)===candidate){await assign(start.site);await waitActive(start.site);console.log('PRODUCTION_ROLLBACK '+start.site)}
 throw e;
}
