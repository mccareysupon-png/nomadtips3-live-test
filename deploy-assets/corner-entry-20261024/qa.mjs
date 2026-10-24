import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{chromium}from'playwright-core';
const dir='deploy-assets/corner-entry-20261024/audit';
const cfg=JSON.parse(await readFile(dir+'/candidate.json','utf8'));assert(cfg.ok&&!cfg.trafficChanged);
const res=await fetch(cfg.preview+'/dashboard-v2-stage3-featured-facts-20261013a.js?cornerRendererQA='+Date.now(),{signal:AbortSignal.timeout(55000)});assert.equal(res.status,200);
const src=await res.text(),beg=src.indexOf('function signalDetailsHtml(s)'),end=src.indexOf('\n/* B46_STABLE_RIGHT_SIGNAL_DOM',beg);
assert(beg>=0&&end>beg,'CANNOT_EXTRACT_FEATURED_RENDERER');
const fnSource=src.slice(beg,end);
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const pair=x=>({home:num(x?.home),away:num(x?.away)});
const show=(v,dec)=>dec===2?Number(v).toFixed(2):String(v??'—');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const render=new Function('num','pair','show','esc',fnSource+';return signalDetailsHtml;')(num,pair,show,esc);
const seed={entryMinute:57,mirrorMinute:67,entryScore:{home:0,away:1},mirrorScore:{home:0,away:2},entryCorners:{home:3,away:4},mirrorCorners:{home:7,away:8},marketLabel:'Corners OVER',selection:'OVER',odds:2.03,bookmaker:'Bet365',line:10.5};
const checks=[
 {name:'FT Corner OVER locked entry snapshot',s:{...seed,market:'ft_corner_over'},entry:'Entry Corners 3–4'},
 {name:'HT Corner UNDER locked entry snapshot',s:{...seed,market:'ht_corner_under'},entry:'Entry Corners 3–4'},
 {name:'FT Corner AH locked entry snapshot',s:{...seed,market:'ft_corner_ah'},entry:'Entry Corners 3–4'},
 {name:'1X2 unchanged',s:{...seed,market:'ft_1x2'},entry:'Entry 0–1'},
 {name:'Goals OVER unchanged',s:{...seed,market:'ft_over'},entry:'Entry 0–1'},
 {name:'Corner unavailable never substitute live value',s:{...seed,market:'ft_corner_over',entryCorners:null},entry:'Entry Corners —'}
];
for(const c of checks){const html=render(c.s);assert(html.includes(c.entry),c.name+': '+html);assert(html.includes('Live 67&#39; · 0–2')||html.includes("Live 67' · 0–2"),'LIVE_SCORE_CHANGED_'+c.name);assert(!html.includes('7–8'),'WRONGLY_USED_LIVE_CORNERS_'+c.name)}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const views=[];
try{
 for(const dim of[{name:'PC',width:1366,height:768},{name:'Mobile',width:390,height:844}]){
  const page=await browser.newPage({viewport:{width:dim.width,height:dim.height}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const r=await page.goto(cfg.preview+'/?b46CornerCandidate='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});assert.equal(r.status(),200);
  await page.waitForTimeout(7000);
  const d=await page.evaluate(()=>({title:document.title,hasFeatured:!!document.querySelector('.featured-card[data-featured]'),hasSignalHost:!!document.querySelector('[data-featured-signal]'),newScript:!!document.querySelector('script[src*="entry-corners-20261024"]'),signalTimeline:[...document.querySelectorAll('.featured-card .feature-signal-meta')].slice(0,5).map(n=>n.innerText)}));
  assert(d.newScript,'SCRIPT_QUERY_NOT_BUSTED_'+dim.name);
  assert.equal(errors.length,0,'JS_PAGE_ERROR_'+dim.name+':'+errors.slice(0,2));
  views.push({name:dim.name,...d});
  await page.close();
 }
}finally{await browser.close()}
const report={at:new Date().toISOString(),ok:true,checks:checks.map(x=>x.name),views};await writeFile(dir+'/qa.json',JSON.stringify(report,null,2));
console.log('B46_CORNER_PREVIEW_QA='+JSON.stringify(report).slice(0,6800));
