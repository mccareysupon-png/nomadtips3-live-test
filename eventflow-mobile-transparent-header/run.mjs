
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from 'acorn';
import {chromium} from 'playwright';
fs.mkdirSync('audit',{recursive:true});
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',worker='ball46-production';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=o=>JSON.stringify(o,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...options.headers},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
async function active(){const d=await api('/scripts/'+worker+'/deployments?per_page=1');assert.equal(d.deployments[0].versions.length,1);assert.equal(d.deployments[0].versions[0].percentage,100);return d.deployments[0].versions[0].version_id;}
async function version(id){return api('/workers/'+worker+'/versions/'+id+'?include=modules');}
async function activate(id,message){return api('/scripts/'+worker+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})});}
const base=await active(),v=await version(base),source=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString('utf8');
let literal;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='__B46_EVENTFLOW_SIGNAL_JS_20261002__')literal=n.init;for(const val of Object.values(n))if(Array.isArray(val))val.forEach(walk);else if(val&&typeof val==='object')walk(val);}
walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert(literal&&typeof literal.value==='string','LIVE_EVENTFLOW_LITERAL_NOT_FOUND');
const before=literal.value;
const old='.expand-flow-card:has(.b46-mf-chart) .expand-card-head{flex-wrap:wrap;gap:4px;font-size:12px!important}';
const replacement='.expand-flow-card:has(.b46-mf-chart) .expand-card-head{flex-wrap:wrap;gap:4px;font-size:12px!important;background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important}';
assert.equal(before.split(old).length,2,'EXPECTED_MOBILE_HEADER_RULE_MISSING_STOP');
const after=before.replace(old,replacement);parse(after,{ecmaVersion:'latest'});
const candidate=source.slice(0,literal.start)+JSON.stringify(after)+source.slice(literal.end);parse(candidate,{ecmaVersion:'latest',sourceType:'module'});
assert.equal(after.replace(replacement,old),before,'SCOPE_EXCEEDED');
fs.writeFileSync('audit/production-before.js',source);fs.writeFileSync('audit/production-after.js',candidate);
const settings=await api('/scripts/'+worker+'/settings'),schedules=await api('/scripts/'+worker+'/schedules');
const report={baseVersion:base,sourceSha:hash(source),candidateSha:hash(candidate),eventFlowSha:hash(after),scope:'Only transparent background, image, border color and shadow of <=767px Event Flow header',tests:[],deployed:false};
const save=()=>fs.writeFileSync('audit/report.json',JSON.stringify(report,null,2));save();
async function json(path){const r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(45000)});assert(r.ok);return r.json();}
const board=await json('/api/engine/board'),signals=await json('/api/engine/signals');
const candidates=board.fixtures.filter(f=>f.boardState==='live'||f.status==='in_play').sort((a,b)=>signals.signals.filter(s=>String(s.fixtureId)===String(b.fixtureId??b.id)).length-signals.signals.filter(s=>String(s.fixtureId)===String(a.fixtureId??a.id)).length);
let fixture,history;
for(const f of candidates.slice(0,10)){const h=await json('/api/engine/history?fixtureId='+encodeURIComponent(f.fixtureId??f.id)+'&window=10');if(h.pressure?.length>1){fixture=f;history=h;break;}}
assert(fixture,'NO_REAL_LIVE_HISTORY_FOR_VISUAL_TEST_STOP');
const fid=String(fixture.fixtureId??fixture.id);report.fixtureId=fid;
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/engine/board*',r=>r.fulfill({json:board}));
await page.route('**/api/engine/history*',r=>r.fulfill({json:history}));
await page.route('**/api/engine/signals*',r=>r.fulfill({json:signals}));
async function load(script,width,live=false){
  await page.setViewportSize({width,height:1000});
  await page.unroute('**/expanded-match-343.js*');
  if(!live)await page.route('**/expanded-match-343.js*',r=>r.fulfill({contentType:'application/javascript',body:script}));
  await page.goto('https://ball46.com/?view=signal');
  await page.locator('.match-row[data-match-id="'+fid+'"]').waitFor({timeout:60000});
  await page.locator('.match-row[data-match-id="'+fid+'"]').click();
  await page.locator('.expand-flow-chart').waitFor({timeout:45000});
  return page.locator('.expand-flow-card').evaluate(card=>{
    const head=card.querySelector('.expand-card-head'),css=getComputedStyle(head),r=head.getBoundingClientRect(),chart=card.querySelector('.expand-flow-chart').getBoundingClientRect();
    return {background:css.backgroundColor,backgroundImage:css.backgroundImage,shadow:css.boxShadow,border:css.borderBottomColor,opacity:css.opacity,height:r.height,width:r.width,chartHeight:chart.height,html:card.innerHTML,markers:card.querySelectorAll('.b46-mf-marker').length};
  });
}
for(const width of [320,375,390,430,1280]){
 const b=await load(before,width);
 await page.locator('.expand-flow-card').screenshot({path:'audit/before-'+width+'.png',animations:'disabled'});
 const a=await load(after,width);
 await page.locator('.expand-flow-card').screenshot({path:'audit/after-'+width+'.png',animations:'disabled'});
 if(width<=767){assert.equal(a.background,'rgba(0, 0, 0, 0)');assert.equal(a.backgroundImage,'none');assert.equal(a.shadow,'none');assert.equal(a.border,'rgba(0, 0, 0, 0)');assert.equal(a.opacity,b.opacity);assert.equal(a.height,b.height);assert.equal(a.width,b.width);assert.equal(a.chartHeight,300);assert.equal(a.markers,b.markers);assert(a.markers>0);await page.locator('.b46-mf-nav button').last().click();assert(await page.locator('.b46-mf-panel strong').isVisible());}
 else {assert.equal(a.html,b.html,'DESKTOP_MARKUP_CHANGED');assert.deepEqual({...a,html:undefined},{...b,html:undefined},'DESKTOP_STYLE_CHANGED');}
 report.tests.push({width,beforeBackground:b.background,afterBackground:a.background,geometry:'unchanged',desktopUnchanged:width>767,passed:true});
 save();
}
assert.equal(errors.length,0,errors.join('\n'));
assert.equal(await active(),base,'PRODUCTION_MOVED_STOP');
assert.equal(canonical(await api('/scripts/'+worker+'/settings')),canonical(settings),'SETTINGS_MOVED_STOP');
const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_EVENTFLOW_MOBILE_TRANSPARENT_HEADER_20261020','workers/message':'Make only mobile Event Flow header transparent; retain text, geometry and Desktop'}};
for(const key of ['logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?candidate:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
const uploaded=await api('/scripts/'+worker+'/versions',{method:'POST',body:form}),id=uploaded.id;assert(id);
report.candidateVersion=id;save();
const next=await version(id);assert.equal(next.modules.length,v.modules.length);
for(const m of v.modules){const n=next.modules.find(n=>n.name===m.name);assert(n);assert.equal(hash(Buffer.from(n.content_base64,'base64')),m.name===v.main_module?hash(candidate):hash(Buffer.from(m.content_base64,'base64')));}
for(const key of ['bindings','compatibility_date','compatibility_flags','assets'])assert.equal(canonical(v[key]),canonical(next[key]),'CONFIG_CHANGED:'+key);
assert.equal(await active(),base,'PRODUCTION_MOVED_AFTER_UPLOAD_STOP');
try{
 await activate(id,'Mobile Event Flow header transparency only after 5 viewport checks');
 report.deployed=true;save();assert.equal(await active(),id);
 for(const origin of ['https://ball46.com','https://ball46-production.mccarey-supon.workers.dev']){
   let ok=false;for(let i=0;i<15;i++){const r=await fetch(origin+'/expanded-match-343.js?headerVerify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});if(r.ok&&hash(await r.text())===hash(after)){assert(/no-store/.test(r.headers.get('cache-control')||''));ok=true;break;}await new Promise(r=>setTimeout(r,1000));}
   assert(ok,'PUBLIC_SCRIPT_NOT_UPDATED:'+origin);
 }
 const mobileLive=await load(null,390,true);assert.equal(mobileLive.background,'rgba(0, 0, 0, 0)');assert.equal(mobileLive.chartHeight,300);
 await page.locator('.expand-flow-card').screenshot({path:'audit/production-mobile-390.png',animations:'disabled'});
 const desktopLive=await load(null,1280,true);const baselineDesktop=await load(before,1280);assert.equal(desktopLive.html,baselineDesktop.html);
 assert.equal(canonical(await api('/scripts/'+worker+'/settings')),canonical(settings),'SETTINGS_CHANGED_AFTER_DEPLOY');
 assert.equal(canonical(await api('/scripts/'+worker+'/schedules')),canonical(schedules),'SCHEDULES_CHANGED_AFTER_DEPLOY');
 assert.equal(errors.length,0,errors.join('\n'));
 report.result='PASS';report.assetsRetained=true;report.settingsUnchanged=true;report.desktopUnchanged=true;report.runtimeErrors=errors;save();console.log(JSON.stringify(report,null,2));
}catch(e){
 report.error=e.message;if(await active()===id){await activate(base,'Rollback mobile Event Flow header transparency validation failure');assert.equal(await active(),base);report.rollback='confirmed';}save();throw e;
}finally{await browser.close();}
