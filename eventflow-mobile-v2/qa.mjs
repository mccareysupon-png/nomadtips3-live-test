
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import crypto from 'node:crypto';
fs.mkdirSync('audit',{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
async function api(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+p,{headers:{Authorization:'Bearer '+token}});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
const deps=await api('/scripts/ball46-production/deployments?per_page=3');
const deployment=deps.deployments[0];assert.equal(deployment.versions.length,1);assert.equal(deployment.versions[0].percentage,100);
const versionId=deployment.versions[0].version_id;
const version=await api('/workers/ball46-production/versions/'+versionId+'?include=modules');
const activeSource=Buffer.from(version.modules.find(m=>m.name===version.main_module).content_base64,'base64').toString('utf8');
const baselineVersion=process.env.VERIFY_PRODUCTION?await api('/workers/ball46-production/versions/82a493c8-2ed5-486d-91c4-3bc0e841ddce?include=modules'):version;
const source=Buffer.from(baselineVersion.modules.find(m=>m.name===baselineVersion.main_module).content_base64,'base64').toString('utf8');
fs.writeFileSync('audit/production-before.js',source);
let target;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='__B46_EVENTFLOW_SIGNAL_JS_20261002__')target=n.init;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert(target&&typeof target.value==='string');
const before=target.value,mobile=fs.readFileSync('eventflow-mobile-v2/mobile.js','utf8');
function once(s,a,b){assert.equal(s.split(a).length,2,'PATCH_ANCHOR:'+a);return s.replace(a,b);}
let after=once(before,'function renderFlow(f,history,signals=[]){','function renderFlow(f,history,signals=[]){\n  if(mobileFlowQuery.matches)return renderMobileFlow(f,history,signals);');
after=once(after,"document.addEventListener('click',e=>{","document.addEventListener('click',e=>{if(handleMobileFlowSelect(e))return;");
after=once(after,"document.addEventListener('keydown',e=>{","document.addEventListener('keydown',e=>{if(handleMobileFlowSelect(e))return;");
after=once(after,'if(eventFlowViewportExpanded)rerenderSignalEntries()','if(eventFlowViewportExpanded||mobileFlowQuery.matches||expandedEl?.querySelector(".b46-mf-chart"))rerenderSignalEntries()');
after=once(after,'function renderFlow(f,history,signals=[]){',mobile+'\nfunction renderFlow(f,history,signals=[]){');
parse(after,{ecmaVersion:'latest'});const candidate=source.slice(0,target.start)+JSON.stringify(after)+source.slice(target.end);parse(candidate,{ecmaVersion:'latest',sourceType:'module'});
assert.equal(source.slice(0,target.start),candidate.slice(0,target.start));assert(candidate.endsWith(source.slice(target.end)));
if(process.env.VERIFY_PRODUCTION){
  assert.equal(hash(activeSource),hash(candidate),'DEPLOYED_WORKER_NOT_EXACT_TESTED_PATCH');
  const canonical=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  for(const key of ['bindings','compatibility_date','compatibility_flags'])assert.equal(canonical(version[key]),canonical(baselineVersion[key]),'DEPLOYMENT_SETTING_CHANGED:'+key);
  assert.equal(canonical(version.assets?.config),canonical(baselineVersion.assets?.config),'ASSET_CONFIGURATION_CHANGED');
  for(const m of baselineVersion.modules.filter(m=>m.name!==baselineVersion.main_module)){assert.equal(version.modules.find(n=>n.name===m.name)?.content_base64,m.content_base64,'OTHER_MODULE_CHANGED:'+m.name);}
  for(const origin of ['https://ball46.com','https://ball46-production.mccarey-supon.workers.dev']){
    const r=await fetch(origin+'/expanded-match-343.js?eventflow-v2-verify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});
    assert(r.ok);assert.equal(hash(await r.text()),hash(after),'PUBLIC_SCRIPT_HASH_MISMATCH');
    assert(/no-store/.test(r.headers.get('cache-control')||''),'SCRIPT_CACHE_NOT_DISABLED');
  }
}
fs.writeFileSync('audit/expanded-before.js',before);fs.writeFileSync('audit/expanded-after.js',after);fs.writeFileSync('audit/production-candidate.js',candidate);
const report={versionId,sourceSha:hash(source),candidateSha:hash(candidate),beforeSha:hash(before),afterSha:hash(after),scope:'Only __B46_EVENTFLOW_SIGNAL_JS_20261002__ literal',deploy:Boolean(process.env.VERIFY_PRODUCTION),tests:[]};
fs.writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function json(path){const r=await fetch('https://ball46.com'+path);assert(r.ok,'HTTP '+r.status);return r.json();}
const board=await json('/api/engine/board'),sig=await json('/api/engine/signals'),rows=sig.signals;
assert(Array.isArray(board.fixtures)&&Array.isArray(rows));
let chosen,history;
const fixtureScore=f=>{const ss=rows.filter(s=>String(s.fixtureId)===String(f.fixtureId??f.id)),groups=new Map();for(const s of ss){const k=String(s.matchTime??s.entryClock??s.entryMinute??s.minute);groups.set(k,(groups.get(k)||0)+1);}return ss.length+100*Math.max(0,...groups.values());};
const fixtures=[...board.fixtures].sort((a,b)=>fixtureScore(b)-fixtureScore(a));
for(const f of fixtures.slice(0,25)){const id=String(f.fixtureId??f.id);const h=await json('/api/engine/history?fixtureId='+encodeURIComponent(id)+'&window=10');if(h.pressure?.length>=2){chosen=f;history=h;if(rows.some(s=>String(s.fixtureId)===id))break;}}
assert(chosen,'NO_REAL_FIXTURE_WITH_HISTORY: QA STOP');
const id=String(chosen.fixtureId??chosen.id),signals=rows.filter(s=>String(s.fixtureId)===id);
assert(signals.length,'NO_REAL_SIGNAL_FOR_HISTORY_FIXTURE: QA STOP');
fs.writeFileSync('audit/real-test-data.json',JSON.stringify({fixture:chosen,history,signals},null,2));
let css='';for(const path of ['/expanded-match-343.css','/dashboard-v2.css','/dashboard-v2-tune.css']){const r=await fetch('https://ball46.com'+path);if(r.ok)css+='\n'+await r.text();}
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function setup(script,width){
  await page.setViewportSize({width,height:1000});
  await page.goto('https://ball46.com/robots.txt');
  await page.setContent('<html data-theme="dark"><head><style>body{margin:0;background:#030605;color:#fff;font-family:Arial}.workspace{width:100%;box-sizing:border-box}.match-expanded-inner{display:block!important}.expand-full-market-card{display:none!important}.match-expanded{margin:0!important;padding:0!important}.expand-flow-card{box-sizing:border-box;width:100%}.expand-flow-line{fill:none;stroke-width:2}.expand-flow-line.home{stroke:#31b878}.expand-flow-line.away{stroke:#e2c94c}.expand-flow-grid{stroke:#33443c;stroke-width:.5}.expand-flow-axis{fill:#a7b8b0;font-size:10px}'+css+'</style></head><body><main class="workspace singlepage"><div data-board-sections><div class="match-row" data-match-id="'+id+'">Real fixture: '+id+'</div></div></main></body></html>');
  await page.route('**/api/engine/board*',r=>r.fulfill({json:{...board,fixtures:[chosen]}}));
  await page.route('**/api/engine/history*',r=>r.fulfill({json:history}));
  await page.evaluate(s=>{window.NOMAD343_DASHBOARD_V2={getSignals:()=>s};},signals);
  await page.addScriptTag({content:script});
  await page.evaluate(id=>window.NOMAD343_EXPANDED_MATCH.open(id),id);
  await page.locator('.expand-flow-chart').waitFor();
}
for(const width of [320,375,390,430,1280]){
  await setup(before,width);const beforeHTML=await page.locator('.expand-flow-card').innerHTML();
  const beforePng=await page.screenshot({path:'audit/before-'+width+'.png',fullPage:true,animations:'disabled'});
  await setup(after,width);
  const afterPng=await page.screenshot({path:'audit/after-'+width+'.png',fullPage:true,animations:'disabled'});
  if(width===1280){assert.equal(await page.locator('.expand-flow-card').innerHTML(),beforeHTML,'DESKTOP_DOM_CHANGED');assert(beforePng.equals(afterPng),'DESKTOP_PIXELS_CHANGED');report.tests.push({width,desktopDOM:'identical',desktopPixels:'identical'});continue;}
  assert.equal(await page.locator('.b46-mf-chart').count(),1);
  const geometry=await page.evaluate(()=>{const chart=document.querySelector('.b46-mf-chart'),r=chart.getBoundingClientRect();return {height:r.height,overflow:document.documentElement.scrollWidth>innerWidth,viewWidth:Number(chart.querySelector('svg').getAttribute('viewBox').split(' ')[2]),width:r.width};});
  assert.equal(geometry.height,300);assert(!geometry.overflow,'HORIZONTAL_OVERFLOW');
  assert(Math.abs(geometry.viewWidth-geometry.width)<20,'RESPONSIVE_COORDINATES');
  const buttons=page.locator('.b46-mf-nav button'),count=await buttons.count();assert(count>0);
  for(let i=0;i<count;i++){await buttons.nth(i).click();assert.equal(await page.locator('.b46-mf-panel strong').innerText(),'Signal '+(i+1));}
  const markers=page.locator('.b46-mf-marker');const markerCount=await markers.count();assert(markerCount>0);
  for(let i=0;i<markerCount;i++){await markers.nth(i).click();assert.equal(await page.locator('.b46-mf-panel strong').innerText(),'Signal '+(i+1));}
  const selected=await page.locator('.b46-mf-nav button[aria-pressed="true"]').getAttribute('data-mf-signal');
  await page.evaluate(s=>window.dispatchEvent(new CustomEvent('ball46:signals-snapshot',{detail:{signals:s}})),rows);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.b46-mf-nav button[aria-pressed="true"]').getAttribute('data-mf-signal'),selected,'SELECTION_CHANGED_ON_UPDATE');
  const centers=await page.locator('.b46-mf-disc').evaluateAll(nodes=>nodes.map(n=>({x:Number(n.getAttribute('cx')),y:Number(n.getAttribute('cy'))})));
  for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)assert(Math.hypot(centers[i].x-centers[j].x,centers[i].y-centers[j].y)>=41,'MARKER_OVERLAP');
  await page.screenshot({path:'audit/after-selected-'+width+'.png',fullPage:true,animations:'disabled'});
  report.tests.push({width,geometry,signals:count,markers:markerCount,selection:'pass',liveSnapshot:'pass'});
}

await page.unroute('**/api/engine/board*');await page.unroute('**/api/engine/history*');
await page.route('**/api/engine/board*',r=>r.fulfill({json:board}));
await page.route('**/api/engine/history*',r=>r.fulfill({json:history}));
await page.route('**/api/engine/signals*',r=>r.fulfill({json:sig}));
for(const width of [320,375,390,430,1280]){
  await page.setViewportSize({width,height:1000});
  for(const [label,script] of [['before',before],['after',after]]){
    await page.unroute('**/expanded-match-343.js*');
    if(label==='before'||!process.env.VERIFY_PRODUCTION)await page.route('**/expanded-match-343.js*',r=>r.fulfill({contentType:'application/javascript',body:script}));
    await page.goto('https://ball46.com/?view=signal');
    const row=page.locator('.match-row[data-match-id="'+id+'"]');
    await row.waitFor({timeout:60000});
    await row.click();
    await page.locator('.expand-flow-chart').waitFor();
    await page.locator('.expand-flow-card').scrollIntoViewIfNeeded();
    if(label==='after'&&width<=767){
      await page.locator('.b46-mf-marker').first().click();
      assert.equal(await page.locator('.b46-mf-panel').count(),1);
      const g=await page.locator('.expand-flow-card').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};});
      assert(g.left>=-1&&g.right<=g.width+1,'ACTUAL_SITE_FLOW_OVERFLOW');
    }
    await page.screenshot({path:'audit/site-'+label+'-'+width+'.png',fullPage:false,animations:'disabled'});
  }
  report.tests.push({width,actualProductionPage:'pass'});
}
assert.equal(errors.length,0,errors.join('\n'));

const now=await api('/scripts/ball46-production/deployments?per_page=1');assert.equal(now.deployments[0].versions[0].version_id,versionId,'PRODUCTION_CHANGED_DURING_QA');
report.result='PASS';report.consoleErrors=errors;
fs.writeFileSync('audit/report.json',JSON.stringify(report,null,2));
await browser.close();console.log(JSON.stringify(report,null,2));
