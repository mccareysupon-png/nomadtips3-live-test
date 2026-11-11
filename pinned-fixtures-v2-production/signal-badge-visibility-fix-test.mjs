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

const old="function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');";
const neu="function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const pinned=!!row.closest?.('[data-status-section=\"pinned\"]');if(pinned&&matchMedia('(min-width:761px)').matches&&row.dataset.b46MarketCompact!=='1'){const h=row.getBoundingClientRect().height;if(h)row.style.setProperty('--b46-league-market-row-height',h+'px');row.dataset.b46MarketCompact='1'}const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');";
assert.equal(src.split(old).length-1,1,'ANCHOR_COUNT');
const patched=src.replace(old,neu);
assert.notEqual(patched,src,'NO_CHANGE');
assert(patched.includes("row.dataset.b46MarketCompact='1'"),'COMPACT_FLAG_MISSING');
assert(patched.includes("row.closest?.('[data-status-section=\"pinned\"]')"),'PINNED_SCOPE_MISSING');
assert(patched.includes("matchMedia('(min-width:761px)').matches"),'DESKTOP_GUARD_MISSING');
assert(!neu.includes('fetch('),'EXTRA_API_DETECTED');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.setContent(`<style>
.b46-league-market-signal-count{display:none!important}
@media(min-width:761px){
 .match-row[data-b46-market-compact="1"] .signal-inline-stack{display:flex!important;align-items:center!important;justify-content:center!important;height:42px!important}
 .match-row[data-b46-market-compact="1"] .signal-inline-stack>.prediction-live{display:none!important}
 .match-row[data-b46-market-compact="1"] .b46-league-market-signal-count{display:inline-flex!important}
}
</style>
<section data-status-section="pinned"><section class="league-block"><div class="match-row" data-match-id="x" style="height:68px"><div class="signal-inline-stack" data-inline-signal-count="2"><div class="prediction-live">signal content</div></div></div></section></section>`);
const result=await page.evaluate(()=>{
 function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const pinned=!!row.closest?.('[data-status-section="pinned"]');if(pinned&&matchMedia('(min-width:761px)').matches&&row.dataset.b46MarketCompact!=='1'){const h=row.getBoundingClientRect().height;if(h)row.style.setProperty('--b46-league-market-row-height',h+'px');row.dataset.b46MarketCompact='1'}const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');if(!Number.isInteger(n)||n<=0){badge?.remove();return;}if(!badge){badge=document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden="true"></i><b></b><span></span>';host.append(badge);}const number=String(n),label=n===1?'Signal':'Signals';badge.children[1].textContent=number;badge.children[2].textContent=label;badge.setAttribute('aria-label',number+' active '+label.toLowerCase())}
 const row=document.querySelector('.match-row');b46PinSignalBadge(row);const badge=row.querySelector('.b46-league-market-signal-count'),host=row.querySelector('.signal-inline-stack');
 return {compact:row.dataset.b46MarketCompact||null,rowHeight:row.style.getPropertyValue('--b46-league-market-row-height'),display:getComputedStyle(badge).display,hostDisplay:getComputedStyle(host).display,predictionDisplay:getComputedStyle(host.querySelector('.prediction-live')).display,text:badge.textContent.trim(),aria:badge.getAttribute('aria-label')};
});
await browser.close();
console.log('ACTIVE_BASE='+active);
console.log('RESULT='+JSON.stringify(result));
assert.equal(result.compact,'1');
assert.equal(result.display,'inline-flex');
assert.equal(result.hostDisplay,'flex');
assert.equal(result.predictionDisplay,'none');
assert.equal(result.text,'2Signals');
assert.equal(result.aria,'2 active signals');
console.log('ROOT_CAUSE_GLOBAL_HIDE_WITHOUT_COMPACT=1');
console.log('PINNED_DESKTOP_COMPACT_REUSE=1');
console.log('FIX_EXTRA_API=0');
console.log('SIGNAL_BADGE_VISIBILITY_TEST_PASS=1');
