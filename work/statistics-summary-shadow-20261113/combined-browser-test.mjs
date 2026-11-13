import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {prepareUiReplay,startUiReplay} from './ui-replay.mjs';
process.env.B46_COMBINED_UI='1';
const D='work/statistics-summary-shadow-20261113',require=createRequire(resolve(D+'/.runtime/resolve.cjs')),{chromium}=require('playwright');
const prepared=await prepareUiReplay(),server=await startUiReplay(prepared),browser=await chromium.launch({headless:true}),results=[],errors=[];
try{for(const width of [1440,390])for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<1024,hasTouch:width<1024}),page=await context.newPage();
 await context.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);await page.clock.setFixedTime(new Date(prepared.input.asOf));
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===server.origin?r.continue():r.abort());
 await page.goto(server.origin+'/?status=live',{waitUntil:'domcontentloaded'});await page.locator('.match-row').first().waitFor({state:'attached',timeout:45000});
 if(width>=1024){
  await page.waitForFunction(()=>document.documentElement.dataset.b46OrbitDone==='1',null,{timeout:30000});
  const home=page.locator('.right-rail>.b46-match-monitor+.b46-home-member-promo');await home.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>{const i=document.querySelector('.b46-home-member-promo img');return i?.complete&&i.naturalWidth>0});
  const info=await page.evaluate(()=>{const e=document.querySelector('.right-rail>.b46-match-monitor+.b46-home-member-promo');return e?{href:e.querySelector('a').href,src:e.querySelector('img').src,width:e.getBoundingClientRect().width,previous:e.previousElementSibling.className}:null});assert(info,'BANNER_NOT_AFTER_MONITOR_AFTER_APP_READY');assert.equal(info.href,'https://member.ball46.com/pricing');assert(info.src.includes('home-'+theme));assert(info.previous.includes('b46-match-monitor'),JSON.stringify(info));results.push({width,theme,check:'Home placement, artwork and membership link',ok:true});
  await home.screenshot({path:D+'/qa/combined/home-'+theme+'.png'});
 }else assert.equal(await page.locator('.b46-home-member-promo').count(),0);
 assert.equal(server.requests.filter(r=>r.path==='/api/engine/statistics').length,0,'HISTORY_BEFORE_OPEN');
 await page.goto(server.origin+'/?view=statistics&market=all',{waitUntil:'domcontentloaded'});await page.locator('.sp-stat-hero').waitFor({state:'visible',timeout:60000});
 if(width>=1024){for(const market of ['all','1x2','ah','ou','btts','corners','cards','other']){
  await page.locator('.left-rail [data-stat-market="'+market+'"]').click();await page.waitForFunction(()=>{const a=document.querySelector('.b46-stat-member-top'),h=document.querySelector('.sp-stat-hero');return a&&h&&Math.abs(a.getBoundingClientRect().width-h.getBoundingClientRect().width)<1});
  const shape=await page.locator('.b46-stat-member-top').evaluate(e=>{const r=e.getBoundingClientRect(),h=document.querySelector('.sp-stat-hero').getBoundingClientRect();return {width:r.width,left:r.left,height:r.height,hero:{width:h.width,left:h.left,height:h.height},href:e.querySelector('a').href,logo:getComputedStyle(e.querySelector('.b46-member-wordmark')).fontStyle,count:document.querySelectorAll('.b46-stat-member-top').length}});
  assert.equal(shape.count,1);assert.equal(shape.logo,'normal');assert.equal(shape.href,'https://member.ball46.com/pricing');assert(Math.abs(shape.width-shape.hero.width)<1&&Math.abs(shape.left-shape.hero.left)<1&&Math.abs(shape.height-shape.hero.height*1.25)<1);results.push({width,theme,market,check:'Statistics banner dimensions, logo and link',ok:true});
 }await page.waitForFunction(()=>{const i=document.querySelector('.b46-stat-member-top img');return i?.complete&&i.naturalWidth>0});await page.locator('.b46-stat-member-top').screenshot({path:D+'/qa/combined/statistics-'+theme+'.png'});
 }else{assert.equal(await page.locator('.b46-stat-member-top').count(),0);assert.equal(await page.locator('.b46-home-member-promo').count(),0);results.push({width,theme,check:'Both banners absent on mobile',ok:true});}
 await context.close();server.requests.length=0;
}assert.deepEqual(errors,[]);assert.deepEqual(server.errors,[]);await writeFile(D+'/qa/combined/browser.json',JSON.stringify({ok:true,checks:results.length,results,pageErrors:errors,mode:'Recorded UI and Ledger replay; hosted candidate not activated'},null,2));console.log('COMBINED_BROWSER '+JSON.stringify({ok:true,checks:results.length}));
}finally{await browser.close();await server.close()}
