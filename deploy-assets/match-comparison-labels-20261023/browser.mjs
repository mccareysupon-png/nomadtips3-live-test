import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {NEW_HOME,NEW_AWAY,OLD_HOME,OLD_AWAY,BASE_HTML_SHA,sha} from './patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8'));assert(c.ok&&!c.trafficChanged&&c.preview,'INVALID_CANDIDATE');
const r=await fetch(c.preview+'/?cmpBrowserQa='+Date.now());assert.equal(r.status,200);const html=await r.text();
assert.equal(sha(Buffer.from(html)),c.htmlSha,'PREVIEW_HTML_HASH_DRIFT');
assert(html.includes(NEW_HOME)&&html.includes(NEW_AWAY)&&!html.includes(OLD_HOME)&&!html.includes(OLD_AWAY));
assert(html.includes('LIVE STATS')&&html.includes('MATCH COMPARISON'),'HEADINGS_MISSING');
const s=html.indexOf('<style id="b46-featured-approved-sections-v10-20261021">'),e=html.indexOf('</style>',s);
assert(s>=0&&e>s,'FEATURED_STYLE_MISSING');const css=html.slice(s,e).replace(/^<style[^>]*>/,'');
const browser=await chromium.launch({headless:true});let failed=false;const tests=[];
for(const mobile of [false,true])for(const theme of ['dark','light']){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,colorScheme:theme});
 const page=await ctx.newPage();let result={mobile,theme};
 try{
  const markup=mobile?'<section id="b46gn-detail"><div class="b46gn-featured"><div class="featured-card" data-featured><div class="feature-stats" data-v12-home="MC Oran (W)" data-v12-away="JF Khroub (W)"><div class="stat-row"><span>53%</span><span>Possession</span><span>47%</span></div></div></div></div></section>':'<div class="workspace singlepage"><div class="live-stage-grid"><aside class="right-rail"><section class="featured-card" data-featured><div class="feature-stats" data-v12-home="MC Oran (W)" data-v12-away="JF Khroub (W)"><div class="stat-row"><span>53%</span><span>Possession</span><span>47%</span></div></section></aside></div></div>';
  await page.setContent('<!DOCTYPE html><html data-theme="'+theme+'"><head><style>'+css+'</style></head><body>'+markup+'</body></html>');
  const v=await page.evaluate(()=>{const n=document.querySelector('.feature-stats'),a=getComputedStyle(n,'::before'),b=getComputedStyle(n,'::after');return{before:a.content,after:b.content,homeData:n.dataset.v12Home,awayData:n.dataset.v12Away,display:getComputedStyle(n).display,row:document.querySelector('.stat-row')?.textContent,pseudoLeft:a.left,pseudoRight:b.right};});
  result={...result,...v};
  assert(v.before.toUpperCase().includes('MATCH COMPARISON')&&v.before.toUpperCase().includes('HOME'),'HOME_LABEL_NOT_SHOWN');
  assert(v.after.toUpperCase().includes('LIVE STATS')&&v.after.toUpperCase().includes('AWAY'),'AWAY_LABEL_NOT_SHOWN');
  assert(!/Oran|Khroub|attr\(/i.test(v.before+v.after),'TEAM_NAME_STILL_SHOWN');
  assert.equal(v.homeData,'MC Oran (W)');assert.equal(v.awayData,'JF Khroub (W)');
  assert(v.row.includes('53%')&&v.row.includes('47%'),'STATS_CHANGED');
  result.pass=true;
 }catch(err){result.pass=false;result.error=err.message;failed=true;}
 tests.push(result);await ctx.close();
}
await browser.close();const out={at:new Date().toISOString(),preview:c.preview,ok:!failed,tests};await writeFile('audit/browser.json',JSON.stringify(out,null,2));
console.log('B46_COMPARE_BROWSER='+JSON.stringify({ok:out.ok,tests:tests.map(x=>({mobile:x.mobile,theme:x.theme,pass:x.pass,before:x.before,after:x.after,error:x.error}))}));
if(failed)process.exitCode=1;
