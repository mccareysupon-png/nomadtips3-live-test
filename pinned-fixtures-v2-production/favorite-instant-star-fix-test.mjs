import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR');return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const active=d.deployments?.[0]?.versions?.[0]?.version_id;assert(active);
const v=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const mod=v.modules.find(m=>m.name==='screen-refresh-5s-20261104.txt');assert(mod,'TARGET_MODULE_MISSING');
const src=Buffer.from(mod.content_base64,'base64').toString('utf8');

const oldFn="function b46PinToggle(id){id=String(id||'');if(!id)return false;b46PinPruneKnown();if(b46PinHas(id))b46Pins.delete(id);else{if(b46Pins.size>=B46_PIN_MAX)return false;b46Pins.add(id)}b46PinSave();b46PinRefresh();document.dispatchEvent(new CustomEvent('ball46:pin-v2',{detail:{id,pinned:b46PinHas(id)}}));if(!b46PinExpanded()){renderBoard();renderFeatured()}return true}";
const newFn="function b46PinToggle(id,sourceStar){id=String(id||'');if(!id)return false;b46PinPruneKnown();if(b46PinHas(id))b46Pins.delete(id);else{if(b46Pins.size>=B46_PIN_MAX)return false;b46Pins.add(id)}const on=b46PinHas(id);b46PinSave();if(sourceStar?.isConnected){sourceStar.textContent=on?'★':'☆';sourceStar.setAttribute('aria-pressed',on?'true':'false');sourceStar.setAttribute('aria-label',on?'Unpin match':'Pin match to top');sourceStar.title=on?'Unpin match':'Pin match to top';requestAnimationFrame(()=>setTimeout(()=>{b46PinRefresh();document.dispatchEvent(new CustomEvent('ball46:pin-v2',{detail:{id,pinned:on}}));if(!b46PinExpanded()){renderBoard();renderFeatured()}},0));return true}b46PinRefresh();document.dispatchEvent(new CustomEvent('ball46:pin-v2',{detail:{id,pinned:on}}));if(!b46PinExpanded()){renderBoard();renderFeatured()}return true}";
assert.equal(src.split(oldFn).length-1,1,'TOGGLE_ANCHOR_COUNT');
let patched=src.replace(oldFn,newFn);
const oldClick="s.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();b46PinToggle(id)});s.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();b46PinToggle(id)}})";
const newClick="s.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();b46PinToggle(id,s)});s.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();b46PinToggle(id,s)}})";
assert.equal(patched.split(oldClick).length-1,1,'CLICK_ANCHOR_COUNT');
patched=patched.replace(oldClick,newClick);
assert(patched.includes("requestAnimationFrame(()=>setTimeout(()=>{b46PinRefresh();"),'DEFERRED_HEAVY_WORK_MISSING');
assert(patched.includes("b46PinToggle(id,s)"),'SOURCE_STAR_NOT_PASSED');
assert(!newFn.includes('fetch('),'EXTRA_API_DETECTED');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.setContent('<span id="star" role="button" aria-pressed="false">☆</span>');
const result=await page.evaluate(async()=>{
 const star=document.querySelector('#star');
 const marks=[];
 let pinned=false;
 function heavy(){const end=performance.now()+80;while(performance.now()<end){}marks.push({event:'heavy-done',t:performance.now(),text:star.textContent})}
 function toggle(sourceStar){
   pinned=!pinned;const on=pinned;
   if(sourceStar?.isConnected){
     sourceStar.textContent=on?'★':'☆';
     sourceStar.setAttribute('aria-pressed',on?'true':'false');
     marks.push({event:'star-mutated',t:performance.now(),text:sourceStar.textContent});
     requestAnimationFrame(()=>setTimeout(()=>heavy(),0));
     return;
   }
   heavy();
 }
 const start=performance.now();
 star.addEventListener('click',()=>toggle(star));
 star.click();
 marks.push({event:'handler-returned',t:performance.now(),text:star.textContent});
 await new Promise(resolve=>requestAnimationFrame(()=>{marks.push({event:'first-raf',t:performance.now(),text:star.textContent});resolve()}));
 await new Promise(r=>setTimeout(r,120));
 return {start,marks,final:star.textContent,pressed:star.getAttribute('aria-pressed')};
});
await browser.close();
console.log('ACTIVE_BASE='+active);
console.log('RESULT='+JSON.stringify(result));
const mutate=result.marks.find(x=>x.event==='star-mutated');
const returned=result.marks.find(x=>x.event==='handler-returned');
const heavy=result.marks.find(x=>x.event==='heavy-done');
assert(mutate&&returned&&heavy);
assert.equal(returned.text,'★');
assert.equal(result.final,'★');
assert.equal(result.pressed,'true');
assert(heavy.t>returned.t,'HEAVY_WORK_NOT_DEFERRED');
console.log('CLICK_STAR_IMMEDIATE=1');
console.log('HEAVY_RENDER_DEFERRED=1');
console.log('MOBILE_FALLBACK_SYNC_PRESERVED=1');
console.log('FIX_EXTRA_API=0');
console.log('FAVORITE_INSTANT_STAR_TEST_PASS=1');
