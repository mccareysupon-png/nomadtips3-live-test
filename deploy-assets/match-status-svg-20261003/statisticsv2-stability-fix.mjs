import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {activeVersion,getVersion,api,script,sha,canonical,publicFile,backend} from './production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from './rail.mjs';

const TARGET='statistics-next.js';
const BEFORE="async function load(){try{const [sr,lr]=await Promise.all([fetch(`${STAT_API}?_=${Date.now()}`,{cache:'no-store'}),fetch(`${SIGNAL_API}?_=${Date.now()}`,{cache:'no-store'})]);const sj=await sr.json();if(!sr.ok||sj?.ok!==true)throw new Error('statistics unavailable');renderStats(sj);if(lr.ok){const lj=await lr.json();renderLive(Array.isArray(lj?.signals)?lj.signals:[])}}catch(err){console.warn('Statistics NEXT preview load failed',err);status('warn','Statistics feed unavailable')}}";
const AFTER="async function timedFetch(url,ms=8000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{cache:'no-store',signal:c.signal})}finally{clearTimeout(t)}}\nasync function load(){const stamp=Date.now();try{const sr=await timedFetch(`${STAT_API}?_=${stamp}`);const sj=await sr.json();if(!sr.ok||sj?.ok!==true)throw new Error('statistics unavailable');renderStats(sj)}catch(err){console.warn('Statistics NEXT statistics load failed',err);status('warn','Statistics feed unavailable');return}try{const lr=await timedFetch(`${SIGNAL_API}?_=${stamp}`);if(lr.ok){const lj=await lr.json();renderLive(Array.isArray(lj?.signals)?lj.signals:[])}}catch(err){console.warn('Statistics NEXT signals load failed',err)}}";

const base=await activeVersion();
const ver=await getVersion(base);
const settings=await api(`/scripts/${script}/settings`);
const crons=await schedules();
const back=await backend();
const main=ver.modules.find(m=>m.name===ver.main_module);
assert(main,'MAIN_MISSING');
const source=Buffer.from(main.content_base64,'base64').toString('utf8');
const current=await publicFile('/'+TARGET,'javascript');
const text=current.toString('utf8');
assert.equal(text.split(BEFORE).length-1,1,'EXACT_LOAD_ANCHOR_COUNT_BAD');
const next=text.replace(BEFORE,AFTER);
assert(!next.includes(BEFORE),'OLD_LOAD_REMAINS');
assert(next.includes("async function timedFetch"),'TIMEOUT_HELPER_MISSING');

const staged=await stageCurrentRail(ver,settings,crons,source);
await verifyRailBase(staged);
assert.equal(staged.hashes[TARGET],sha(current),'TARGET_MOVED_BEFORE_PATCH');
writeFileSync(resolve(staged.runtime,'assets',TARGET),next);

const keep={...staged.hashes};delete keep[TARGET];
wrangler(staged,true);
assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_BEFORE_DEPLOY');
wrangler(staged);

let candidate=null;
for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await new Promise(r=>setTimeout(r,1000))}
assert(candidate,'NO_NEW_VERSION');

let ok=false;
for(let i=0;i<30;i++){
  const got=await publicFile('/'+TARGET,'javascript'),t=got.toString('utf8');
  if(t.includes("async function timedFetch")&&!t.includes(BEFORE)){ok=true;break}
  await new Promise(r=>setTimeout(r,1000));
}
assert(ok,'PATCH_NOT_PUBLIC');
for(const [p,h] of Object.entries(keep))assert.equal(sha(await publicFile('/'+p)),h,`UNRELATED_ASSET_CHANGED:${p}`);
assert.equal(canonical(await backend()),canonical(back),'BACKEND_CHANGED');
const [stats,signals]=await Promise.all(['/api/engine/statistics','/api/engine/signals'].map(async p=>JSON.parse(await publicFile(p,'json'))));
assert(stats?.ok===true&&Array.isArray(stats.rows),'STATS_API_UNHEALTHY');
assert(Array.isArray(signals?.signals),'SIGNALS_API_UNHEALTHY');
console.log('BASE='+base);
console.log('FINAL_PRODUCTION='+candidate);
console.log('STATS_ROWS='+stats.rows.length);
console.log('SIGNALS='+signals.signals.length);
console.log('BALL46_STATISTICSV2_STABILITY_FIX_SUCCESS');
