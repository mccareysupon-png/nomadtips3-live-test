import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import fs from 'node:fs';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'MISSING_CLOUDFLARE_API_TOKEN');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
async function cf(path,method='GET',body){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const j=await r.json();if(!r.ok||!j.success)throw new Error('CLOUDFLARE_API '+method+' '+path+' HTTP '+r.status+' '+JSON.stringify(j.errors||[]));
 return j.result;
}
const zones=await cf('/zones?name=ball46.com&per_page=5');
assert(Array.isArray(zones)&&zones.length===1&&zones[0].name==='ball46.com','ZONE_NOT_UNAMBIGUOUS');
const zoneId=zones[0].id,settingPath='/zones/'+zoneId+'/settings/bot_fight_mode';
const setting=await cf(settingPath);
const before=setting.value;
assert(['on','off'].includes(before),'UNEXPECTED_BOT_FIGHT_MODE_VALUE');
console.log('B46_BOT_FIGHT_MODE_BEFORE '+JSON.stringify({value:before,zone:zones[0].name}));
const stateFile='/tmp/b46-bot-fight-restore-state.json';
fs.writeFileSync(stateFile,JSON.stringify({zoneId,before,changed:false}));
let browser;
try{
 if(before==='on'){
  const applied=await cf(settingPath,'PATCH',{value:'off'});
  assert(applied.value==='off','BOT_MODE_TOGGLE_NOT_CONFIRMED');
  fs.writeFileSync(stateFile,JSON.stringify({zoneId,before,changed:true}));
  console.log('B46_TEMP_BOT_FIGHT_MODE_OFF');
 }else console.log('B46_BOT_FIGHT_MODE_ALREADY_OFF_NO_MUTATION');
 browser=await chromium.launch({headless:true});
 for(const mode of ['desktop-dark','desktop-light']){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage(),errs=[];
  page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),mode.endsWith('dark')?'dark':'light');
  const r=await page.goto('https://ball46.com/?view=live&b46TemporaryBotAudit='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelectorAll('.match-row[data-match-id] .market-cell strong[data-nomad-odds-raw]').length>0,null,{timeout:12000}).catch(()=>{});
  const snapshot=()=>page.evaluate(()=>({count:document.querySelectorAll('.match-row[data-match-id] .market-cell strong[data-nomad-odds-raw]').length,visible:[...document.querySelectorAll('.match-row[data-match-id] .market-cell strong[data-nomad-odds-raw]')].filter(e=>e.getBoundingClientRect().width>0).length,theme:document.documentElement.dataset.theme,gate:matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)').matches,stats:{...window.__b46OddsMovementStats}}));
  const first=await snapshot();await page.waitForTimeout(12000);const second=await snapshot();
  console.log('B46_BOT_OFF_REAL_BROWSER_AUDIT '+JSON.stringify({mode,http:r?.status()||null,initial:first,after:second,errors:errs.slice(0,5)}));
  await ctx.close();
 }
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(before==='on'){
  const restored=await cf(settingPath,'PATCH',{value:'on'});
  assert(restored.value==='on','CRITICAL_RESTORE_FAILED');
  fs.writeFileSync(stateFile,JSON.stringify({zoneId,before,changed:false}));
  console.log('B46_BOT_FIGHT_MODE_RESTORED_ON');
 }else console.log('B46_BOT_FIGHT_MODE_ORIGINALLY_OFF_UNCHANGED');
}
