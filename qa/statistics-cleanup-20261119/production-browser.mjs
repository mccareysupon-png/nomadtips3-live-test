import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const origin='https://ball46.com';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const markets=['all','ah','1x2','ou','corners','btts','cards','other'];
const palette={dark:'rgb(255, 103, 121)',light:'rgb(199, 54, 73)'};
function assertLive(s,theme){assert.equal(s.color,palette[theme]);assert.equal(s.minute,palette[theme]);assert.equal(s.mark,palette[theme]);assert.equal(s.dot,palette[theme]);assert.equal(s.background,'rgba(0, 0, 0, 0)');assert.equal(s.image,'none');assert.equal(s.border,'rgba(0, 0, 0, 0)');assert.equal(s.shadow,'none')}
async function readFixture(p){return p.evaluate(()=>{
 const root=document.querySelector('#b46-cleanup-fixture');
 const state=e=>{const s=getComputedStyle(e),m=e.querySelector('.b46-sc-minute'),mark=e.querySelector('.b46-sc-mark'),dot=e.querySelector('.b46-sc-dot');return {text:e.textContent.trim(),color:s.color,background:s.backgroundColor,image:s.backgroundImage,border:s.borderTopColor,shadow:s.boxShadow,minute:m?getComputedStyle(m).color:null,mark:mark?getComputedStyle(mark).color:null,dot:dot?getComputedStyle(dot).backgroundColor:null}};
 return {hero:getComputedStyle(document.querySelector('.sp-stat-hero')).display,desktop:[...root.querySelectorAll('.sp-result.b46-sc-result')].map(state),mobile:[...root.querySelectorAll('.b46m-outcome.b46-sc-result')].map(state),theme:document.documentElement.dataset.theme};
 })}

export async function checkUI({column,css,preflight,baseline,cssPath}){
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let fixture;const results=[],originals={};
 try{
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
 const navigate=async id=>{
  const u=origin+'/index.html?view=statistics&market='+id+'&b46QA='+process.env.GITHUB_RUN_ID+'-'+Date.now();
  const res=await p.goto(u,{waitUntil:'domcontentloaded',timeout:45000});assert(res?.ok(),'PAGE_HTTP '+id);
  await p.waitForFunction(()=>document.body.dataset.workspaceView==='statistics'&&!!document.querySelector('.workspace.singlepage .sp-stats-content .sp-stat-hero'),{timeout:25000});
  await p.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('b46-statistics-columns-20261102.css')),{timeout:20000});
  if(!preflight)await p.waitForFunction(path=>[...document.styleSheets].some(s=>s.href&&new URL(s.href).pathname===path),{timeout:20000},cssPath);
 };
 await navigate('all');
 const insert=()=>p.evaluate(html=>{if(document.querySelector('#b46-cleanup-fixture'))return;const n=document.createElement('div');n.innerHTML=html;document.querySelector('.sp-stats-content').append(n.firstElementChild)},fixtureHtml);
 await insert();
 if(preflight){
  const o={};for(const theme of ['dark','light']){await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);o[theme]=await readFixture(p)}
  assert(o.dark.hero!=='none'||o.light.hero!=='none','HERO_ALREADY_HIDDEN');
  originals[device]=o;await p.addStyleTag({content:css});
 }
 for(const id of markets){
  if(id!=='all'){
   const nav='button[data-stat-market="'+id+'"]';
   try{await p.waitForSelector(nav,{timeout:12000});await p.$eval(nav,e=>e.click());await p.waitForFunction(m=>new URL(location.href).searchParams.get('market')===m,{timeout:8000},id)}
   catch(e){console.log('NAV_RETRY '+device+' '+id);await navigate(id);if(preflight)await p.addStyleTag({content:css})}
  }
  await p.waitForFunction(()=>!!document.querySelector('.sp-stat-hero'),{timeout:12000});await insert();
  for(const theme of ['dark','light']){
   await p.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
   const s=await readFixture(p),o=(preflight?originals:baseline)[device][theme];
   assert.equal(s.hero,'none','HERO_VISIBLE '+device+' '+id);assert.equal(s.theme,theme);
   for(const kind of ['desktop','mobile']){assertLive(s[kind][0],theme);assert.deepEqual(s[kind].slice(1),o[kind].slice(1),'SETTLED_OR_PENDING_CHANGED '+device+' '+id+' '+kind+' '+theme)}
   const actual=await p.evaluate(()=>[...document.querySelectorAll('.sp-stats-content .b46-sc-result.b46-sc-live')].filter(e=>!e.closest('#b46-cleanup-fixture')).map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})));
   for(const a of actual){assert.equal(a.color,palette[theme]);assert.equal(a.background,'rgba(0, 0, 0, 0)')}
   results.push({device,id,theme,heroHidden:true,clock:s.desktop[0].text,actualLiveBadges:actual.length,settledUnchanged:true});
   console.log((preflight?'PRECHECK':'LIVE_CHECK')+' '+JSON.stringify(results.at(-1)));
   if(id==='all'){await p.screenshot({path:'evidence/'+(preflight?'pre-':'live-')+device+'-'+theme+'.png'});await p.$eval('#b46-cleanup-fixture',e=>e.scrollIntoView({block:'start'}));await (await p.$('#b46-cleanup-fixture')).screenshot({path:'evidence/'+(preflight?'pre-':'live-')+device+'-result-'+theme+'.png'});}
  }
 }
 assert.deepEqual(errors,[],'PAGE_ERRORS '+device);await p.close()
 }
 assert.equal(results.length,32);return {results,originals};
 }finally{await browser.close()}
}
