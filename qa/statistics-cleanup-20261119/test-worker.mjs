import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const origin='https://ball46.com',prod='ball46-production',name='ball46-statistics-cleanup-test-20261119';
const css=fs.readFileSync('qa/statistics-cleanup-20261119/statistics-cleanup.css','utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token);const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,opts={}){const r=await fetch(root+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const d=await api('/scripts/'+prod+'/deployments?per_page=1');return d.deployments[0].versions}
async function read(path){const r=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert(r.ok,'HTTP '+path+' '+r.status);return r.text()}
const before=await active();console.log('PRODUCTION_BEFORE '+JSON.stringify(before));
const column=await read('/b46-statistics-columns-20261102.js');
assert(column.includes('b46-sc-minute')&&column.includes('b46-sc-result')&&column.includes('b46-sc-dot')&&column.includes('mobileCard'));
console.log('COLUMN_SOURCE '+sha(column));
fs.mkdirSync('evidence',{recursive:true});
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const markets=[['all','Total · All Markets'],['ah','AH'],['1x2','1X2'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const results=[],snapshots={};let fixture,productionCSS;
const palette={dark:'rgb(255, 103, 121)',light:'rgb(199, 54, 73)'};
function assertLive(s,theme){assert.equal(s.color,palette[theme]);assert.equal(s.minute,palette[theme]);assert.equal(s.mark,palette[theme]);assert.equal(s.dot,palette[theme]);assert.equal(s.background,'rgba(0, 0, 0, 0)');assert.equal(s.image,'none');assert.equal(s.border,'rgba(0, 0, 0, 0)');assert.equal(s.shadow,'none')}
async function readFixture(p){return p.evaluate(()=>{
 const root=document.querySelector('#b46-cleanup-fixture');
 const state=e=>{const s=getComputedStyle(e),m=e.querySelector('.b46-sc-minute'),mark=e.querySelector('.b46-sc-mark'),dot=e.querySelector('.b46-sc-dot');return {text:e.textContent.trim(),color:s.color,background:s.backgroundColor,image:s.backgroundImage,border:s.borderTopColor,shadow:s.boxShadow,minute:m?getComputedStyle(m).color:null,mark:mark?getComputedStyle(mark).color:null,dot:dot?getComputedStyle(dot).backgroundColor:null}};
 return {hero:getComputedStyle(document.querySelector('.sp-stat-hero')).display,desktop:[...root.querySelectorAll('.sp-result.b46-sc-result')].map(state),mobile:[...root.querySelectorAll('.b46m-outcome.b46-sc-result')].map(state),theme:document.documentElement.dataset.theme};
 })}
try{
 // Use the exact currently served row/card renderer in a blank QA browser, not the real site's runtime.
 const q=await browser.newPage();await q.setContent('<!doctype html><html><body></body></html>');
 await q.evaluate(()=>{window.NOMAD343_DASHBOARD_V2={getFixture:id=>id==='qa-live'?{boardState:'live',minute:58,goals:{home:1,away:1}}:null}});
 await q.addScriptTag({content:column});
 fixture=await q.evaluate(()=>{const api=window.B46_STAT_COLUMNS;
 const base={league:'QA sample',date:'19 Nov',market:'AH',pick:'Home',line:'0',odds:'1.95',bookmaker:'Example',entryScore:'0-0',entryHtml:'',fallbackScore:'1-1',finalScore:'2-1',finalCorners:'',resultSource:''};
 const rows=[],cards=[];
 for(const [id,res,settled]of [['qa-live','PENDING',false],['qa-win','WIN',true],['qa-draw','PUSH',true],['qa-loss','LOSS',true],['qa-wait','PENDING',false]]){
  const html=api.row({id,fixtureId:id,home:{name:'Example Home'},away:{name:'Example Away'},entryMinute:42,selection:'HOME'},{...base,res,settled});
  rows.push(html);const t=document.createElement('tbody');t.innerHTML=html;const d=api.readRow(t.firstElementChild,rows.length-1);cards.push(api.mobileCard(d,rows.length-1,false).outerHTML);
 }
 return {rows,cards};
 });
 await q.close();
 assert(fixture.rows[0].includes('b46-sc-live')&&fixture.cards[0].includes('b46-sc-live')&&fixture.rows[2].includes('DRAW'),'EXACT_RENDERER_FIXTURE_BAD');
 const fixtureHtml='<section id="b46-cleanup-fixture" class="sp-results"><div class="sp-results-head"><div><h3>Result appearance · QA sample</h3><p>Renderer examples, not live match records.</p></div></div><div class="sp-table-wrap"><table class="sp-table" data-b46-score-layout="20261102"><thead><tr>'+['Date','Match','Market','Pick','Line','Odds','Bookmaker','Entry','Score','Result'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+fixture.rows.join('')+'</tbody></table></div><div class="b46m-history"><div class="b46m-history-list">'+fixture.cards.join('')+'</div></div></section>';
 for(const [device,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const p=await browser.newPage();await p.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});await p.setCacheEnabled(false);await p.setBypassServiceWorker(true);
  const errors=[];p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(origin+'/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID,{waitUntil:'domcontentloaded',timeout:45000});
  await p.waitForFunction(()=>document.body.dataset.workspaceView==='statistics'&&!!document.querySelector('.workspace.singlepage .sp-stats-content .sp-stat-hero'),{timeout:25000});
  // Wait until existing style sheets have loaded before recording baseline styles.
  await p.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('b46-statistics-columns-20261102.css')),{timeout:20000});
  await p.evaluate(html=>{const box=document.createElement('div');box.innerHTML=html;document.querySelector('.sp-stats-content').append(box.firstElementChild)},fixtureHtml);
  // Record untouched WIN/DRAW/LOSS/PENDING styles, then change only live badges and hero.
  const original={};
  for(const theme of ['dark','light']){await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);original[theme]=await readFixture(p)}
  assert(original.dark.hero!=='none'||original.light.hero!=='none','HERO_ALREADY_HIDDEN');
  assert.equal(original.dark.desktop.length,5);assert.equal(original.dark.mobile.length,5);
  if(device==='desktop'){
   productionCSS=await p.evaluate(()=>[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n'));
   assert(productionCSS.includes('.b46-sc-live')&&productionCSS.includes('.sp-stat-hero'),'BASE_CSS_MISSING');
  }
  await p.addStyleTag({content:css});
  for(const [id,label]of markets){
   if(id!=='all'){
    const nav='button[data-stat-market="'+id+'"]';
    await p.waitForSelector(nav,{timeout:12000});
    await p.$eval(nav,e=>e.click());
    try{await p.waitForFunction(m=>new URL(location.href).searchParams.get('market')===m,{timeout:8000},id)}
    catch(e){throw Error('MARKET_NAV '+device+' '+id+' '+e)}
   }
   await p.waitForFunction(()=>!!document.querySelector('.sp-stat-hero'),{timeout:12000});
   if(!(await p.$('#b46-cleanup-fixture')))await p.evaluate(html=>{const n=document.createElement('div');n.innerHTML=html;document.querySelector('.sp-stats-content').append(n.firstElementChild)},fixtureHtml);
   for(const theme of ['dark','light']){
    await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
    const s=await readFixture(p);assert.equal(s.hero,'none','HERO_VISIBLE '+device+' '+id);assert.equal(s.theme,theme);
    for(const kind of ['desktop','mobile']){assertLive(s[kind][0],theme);assert.deepEqual(s[kind].slice(1),original[theme][kind].slice(1),'SETTLED_OR_PENDING_CHANGED '+device+' '+id+' '+kind+' '+theme)}
    const actual=await p.evaluate(()=>[...document.querySelectorAll('.sp-stats-content .b46-sc-result.b46-sc-live')].filter(e=>!e.closest('#b46-cleanup-fixture')).map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})));
    for(const a of actual){assert.equal(a.color,palette[theme]);assert.equal(a.background,'rgba(0, 0, 0, 0)')}
    results.push({device,id,theme,heroHidden:true,clock:s.desktop[0].text,actualLiveBadges:actual.length,settledUnchanged:true});console.log('UI_CASE_PASS '+JSON.stringify(results.at(-1)));
   }
   if(device==='desktop'){
    // The test Worker uses static public presentation snapshots and the real renderer's sample rows.
    // Never connect its frontend to production APIs; no private or account content is included.
    if(['all','ah','1x2','ou','corners'].includes(id))await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver',{timeout:12000}).catch(()=>{});
    snapshots[id]=await p.evaluate(()=>{const hero=document.querySelector('.sp-stat-hero'),graph=document.querySelector('#b46-finance-chart-card'),parent=graph?.closest('.sp-trend')||graph;const clean=e=>{if(!e)return '';const c=e.cloneNode(true);c.querySelectorAll('script,iframe,object,embed,form').forEach(x=>x.remove());for(const x of [c,...c.querySelectorAll('*')])for(const a of [...x.attributes])if(/^on/i.test(a.name)||a.name==='src'||a.name==='srcset')x.removeAttribute(a.name);return c.outerHTML};return{hero:clean(hero),graph:clean(parent),title:hero.querySelector('[data-sp-market-title]')?.textContent||''}});
   }
  }
  assert.deepEqual(errors,[],'PAGE_ERRORS '+device);await p.close();
 }
 assert.equal(results.length,32);
 console.log('REAL_PAGE_CSS_PASS '+results.length);
 // Publish only a standalone test Worker without routes, bindings, cron jobs or production proxy.
 const baseCSS=productionCSS.replace(/@import[^;]+;/gi,'');const previewStyle='html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}html[data-theme="dark"] body{background:#10241c;color:#e6f1ea}html[data-theme="light"] body{background:#edf3ef;color:#21352d}.qa-preview{max-width:1420px;margin:0 auto;padding:12px}.qa-nav{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.qa-nav a,.qa-toggle{font:600 12px system-ui;color:inherit;border:1px solid #668576;background:transparent;border-radius:7px;padding:8px 10px;text-decoration:none;cursor:pointer}.qa-nav a[aria-current]{background:#17895a;color:white}.qa-caption{font-size:12px;margin:8px 0 18px}.qa-head{display:flex;justify-content:space-between;align-items:center}.qa-preview .workspace.singlepage{display:block!important;position:relative!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important}.qa-preview .sp-stats-content{display:block!important}.qa-preview .sp-trend{margin-bottom:10px}.qa-preview #b46-cleanup-fixture{margin-top:12px}.qa-preview .sp-table-wrap{overflow-x:auto}.qa-preview .b46m-history{display:none!important}@media(max-width:850px){.qa-preview .sp-table-wrap{display:none!important}.qa-preview .b46m-history{display:block!important}.qa-preview .b46m-history-list{display:grid;gap:8px}.qa-preview #b46-cleanup-fixture{overflow:hidden}}';
 const nav=markets.map(([id,label])=>'<a data-market="'+id+'" href="?market='+id+'">'+label+'</a>').join('');
 const pages={};for(const [id,label]of markets){const s=snapshots[id];pages[id]='<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BALL46 · Statistics cleanup test</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/preview.css"><link rel="stylesheet" href="/statistics-cleanup.css"><script>document.documentElement.dataset.theme=new URLSearchParams(location.search).get("theme")==="light"?"light":"dark";</script></head><body data-workspace-view="statistics"><div class="qa-preview"><header class="qa-head"><b>ball<span style="color:#28b980">46</span> · ISOLATED TEST</b><button class="qa-toggle" type="button">Light / Dark</button></header><nav class="qa-nav">'+nav+'</nav><p class="qa-caption">Snapshot preview · '+label+' · QA sample result rows, not live matches. Chart is a static snapshot.</p><main class="workspace singlepage"><div class="sp-stats-content">'+s.hero+s.graph+fixtureHtml+'</div></main></div><script>const m='+JSON.stringify(id)+';function links(){document.querySelectorAll(".qa-nav a").forEach(a=>{a.href="?market="+a.dataset.market+"&theme="+document.documentElement.dataset.theme;if(a.dataset.market===m)a.setAttribute("aria-current","page")})}links();document.querySelector(".qa-toggle").onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==="dark"?"light":"dark";links()};</script></body></html>'}
 const proof={mode:'ISOLATED_STATS_CLEANUP_SNAPSHOT',cssSha:sha(css),columnSha:sha(column),cases:results.length,productionBefore:before};
 const worker='const pages='+JSON.stringify(pages)+';\nconst files='+JSON.stringify({'/base.css':baseCSS,'/preview.css':previewStyle,'/statistics-cleanup.css':css,'/health':JSON.stringify(proof)})+';\nexport default {async fetch(req){const u=new URL(req.url);const h={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src \\'none\\'; style-src \\'self\\' \\'unsafe-inline\\'; script-src \\'unsafe-inline\\'; img-src \\'self\\' data:; font-src \\'self\\'; connect-src \\'none\\'; frame-ancestors \\'none\\'","X-Content-Type-Options":"nosniff"};if(!["GET","HEAD"].includes(req.method))return new Response("test only",{status:405,headers:h});let body,type;if(u.pathname==="/"||u.pathname==="/index.html"){body=pages[u.searchParams.get("market")]||pages.all;type="text/html";}else if(Object.hasOwn(files,u.pathname)){body=files[u.pathname];type=u.pathname==="/health"?"application/json":"text/css"}else{return new Response("test only",{status:404,headers:h})}return new Response(req.method==="HEAD"?null:body,{headers:{...h,"Content-Type":type+"; charset=utf-8"}})}};';
 assert(name!==prod&&name.startsWith('ball46-statistics-cleanup-test-'));
 const list=await api('/scripts');assert(!list.some(w=>w.id===name),'TEST_WORKER_EXISTS');
 const sub=await api('/subdomain');const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
 await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 let ready=false;for(let i=0;i<30;i++){try{const r=await fetch(url+'/health');if(r.ok&&(await r.json()).cssSha===sha(css)){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}assert(ready);
 const check=await fetch(url+'/statistics-cleanup.css');assert.equal(sha(await check.text()),sha(css));
 console.log('TEST_WORKER_READY '+url);
 for(const [device,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  const p=await browser.newPage();await p.setViewport({width,height,isMobile:device==='mobile',hasTouch:device==='mobile'});
  for(const theme of ['dark','light']){
   await p.goto(url+'/?market=all&theme='+theme,{waitUntil:'load',timeout:30000});
   const s=await readFixture(p);assert.equal(s.hero,'none');assertLive(s[device][0],theme);
   await p.screenshot({path:'evidence/'+device+'-'+theme+'.png',fullPage:true});
   await p.$eval('#b46-cleanup-fixture',e=>e.scrollIntoView({block:'start'}));
   await (await p.$('#b46-cleanup-fixture')).screenshot({path:'evidence/'+device+'-result-'+theme+'.png'});
  }
  await p.close()
 }
 const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED');
 fs.writeFileSync('evidence/report.json',JSON.stringify({url,proof,results,productionAfter:after,productionUnchanged:true},null,2));console.log('CLEANUP_TEST_PASS '+JSON.stringify({url,cases:results.length,productionUnchanged:true,actualLiveBadges:results.reduce((a,r)=>a+r.actualLiveBadges,0)}));
}finally{await browser.close()}
