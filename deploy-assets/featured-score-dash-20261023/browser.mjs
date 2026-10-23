import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{chromium}from'playwright';
import{JS_PATH,NEW_TAG,NEW_SCORE,OLD_SCORE}from'./patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8'));assert(c.ok&&!c.trafficChanged&&c.preview,'INVALID_CANDIDATE');
const [h,j]=await Promise.all([fetch(c.preview+'/?scoreBrowserQa='+Date.now()),fetch(c.preview+JS_PATH+'?scoreBrowserQa='+Date.now())]);assert.equal(h.status,200);assert.equal(j.status,200);
const html=await h.text(),script=await j.text();assert(html.includes(NEW_TAG)&&!html.includes(OLD_SCORE),'OLD_SCRIPT_VERSION');assert(script.includes(NEW_SCORE)&&!script.includes(OLD_SCORE),'OLD_SCORE_FUNCTION');
const i=script.indexOf('function scoreLabel(f)'),end=script.indexOf('\nfunction scoreStack(f)',i);assert(i>0&&end>i,'SCORE_FUNCTION_UNAVAILABLE');
const fns=script.slice(i,end);
const st=html.indexOf('<style id="b46-featured-approved-sections-v10-20261021">'),en=html.indexOf('</style>',st);assert(st>=0&&en>st);
const style=html.slice(st,en).replace(/^<style[^>]*>/,'');
const browser=await chromium.launch({headless:true}),tests=[];let failed=false;
for(const mobile of [false,true])for(const theme of ['dark','light']){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,colorScheme:theme});
 const page=await ctx.newPage();let test={mobile,theme};
 try{
  const res=await page.goto(c.preview+'/?scoreLiveQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(res.status(),200);
  const scriptTag=await page.locator('script[src*="featured-facts-20261013a.js"]').first().getAttribute('src');assert(scriptTag.includes('score-short'),'CACHED_SCRIPT_TAG');
  const fixture=await ctx.newPage();
  const snippet=mobile?'<div id="b46gn-detail"><div class="b46gn-featured"><div class="featured-card" data-featured><div class="feature-score"><div><span>HOME</span><b>Al Ahli SC</b></div><strong data-featured-score>1-0</strong><div class="away"><span>AWAY</span><b>Al Najmah</b></div></div></div></div></div>':'<div class="workspace singlepage"><div class="live-stage-grid"><aside class="right-rail"><div class="featured-card" data-featured><div class="feature-score"><div><span>HOME</span><b>Al Ahli SC</b></div><strong data-featured-score>1-0</strong><div class="away"><span>AWAY</span><b>Al Najmah</b></div></div></div></aside></div></div>';
  await fixture.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+style+'</style></head><body>'+snippet+'</body></html>');
  await fixture.addScriptTag({content:"function classify(f){return f.state||'live'};function scorePair(f){return f.goals};function show(x){return String(x)};"+fns+"\nwindow.__scoreFn=scoreLabel;"});
  const result=await fixture.evaluate(()=>{
   const n=document.querySelector('[data-featured-score]');const examples=[{state:'live',goals:{home:1,away:0}},{state:'live',goals:{home:10,away:12}},{state:'scheduled',goals:{home:null,away:null}}].map(window.__scoreFn);
   const read=(v)=>{n.textContent=v;const computed=getComputedStyle(n),range=document.createRange();range.selectNodeContents(n);return{text:v,width:range.getBoundingClientRect().width,fontSize:computed.fontSize,fontWeight:computed.fontWeight,tracking:computed.letterSpacing,overflow:computed.overflow};};
   const old=read('1–0'),next=read('1-0');
   return{examples,old,next,scoreTag:n.tagName,dataAttr:n.hasAttribute('data-featured-score'),home:document.querySelector('.feature-score>div>b').textContent,away:document.querySelector('.feature-score>.away>b').textContent};
  });
  assert.deepEqual(result.examples,['1-0','10-12','—'],'INCORRECT_SCORE_LABELS');
  assert(result.next.width<result.old.width,'HYPHEN_NOT_SHORTER');
  assert(result.old.fontSize===result.next.fontSize&&result.old.fontWeight===result.next.fontWeight,'SCORE_FONT_CHANGED');
  assert(result.home==='Al Ahli SC'&&result.away==='Al Najmah','TEAM_LABELS_CHANGED');
  test={...test,pass:true,result};await fixture.close();
 }catch(e){test={...test,pass:false,error:e.message};failed=true;}
 tests.push(test);await ctx.close();
}
await browser.close();const out={time:new Date().toISOString(),ok:!failed,preview:c.preview,tests};await writeFile('audit/browser.json',JSON.stringify(out,null,2));
console.log('B46_SCORE_BROWSER='+JSON.stringify({ok:out.ok,tests:tests.map(t=>({mobile:t.mobile,theme:t.theme,pass:t.pass,error:t.error,examples:t.result?.examples,oldWidth:t.result?.old.width,newWidth:t.result?.next.width,font:t.result?.next.fontSize}))}));
if(failed)process.exitCode=1;
