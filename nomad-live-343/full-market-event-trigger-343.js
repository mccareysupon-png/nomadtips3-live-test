(()=>{
'use strict';
const VERSION='343-full-market-event-trigger-v2';
const SETTINGS_API='/api/full-market/settings';
const BOARD_API='/api/engine/board';
const EVENT_API='/api/full-market/event-refresh';
const POLL_MS=15_000;
const TRIGGER_DEBOUNCE_MS=5_000;
const settings={eventTrigger:true};
const seenScores=new Map();
const seenEvents=new Map();
const lastTriggered=new Map();
let busy=false,lastSettingsAt=0;
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const text=v=>String(v??'').toLowerCase();
function fixtureId(f){return String(f?.fixtureId??'').trim()}
function isLive(f){const s=text(f?.boardState??f?.status??f?.statusCode);return f?.boardState==='live'||/live|in_play|in play|playing|first|second|\b1h\b|\b2h\b/.test(s)}
function scoreKey(f){const h=num(f?.goals?.home),a=num(f?.goals?.away);return h===null||a===null?null:`${h}-${a}`}
function eventKey(e){return [e?.id,e?.eventId,e?.minute,e?.time?.elapsed,e?.type,e?.detail,e?.team?.id,e?.team?.name,e?.player?.id,e?.player?.name].map(v=>String(v??'')).join('|')}
function criticalEvent(e){const raw=text([e?.type,e?.detail,e?.name,e?.event,e?.description].filter(Boolean).join(' '));return /goal|penalty|red card|sending off|ใบแดง|จุดโทษ|ประตู/.test(raw)}
async function refreshSettings(force=false){if(!force&&Date.now()-lastSettingsAt<60_000)return;lastSettingsAt=Date.now();try{const r=await fetch(`${SETTINGS_API}?_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);if(r.ok&&j?.ok===true)settings.eventTrigger=Boolean(j?.control?.eventTrigger)}catch{}}
async function trigger(id,reason){const at=Date.now(),last=Number(lastTriggered.get(id)||0);if(at-last<TRIGGER_DEBOUNCE_MS)return;lastTriggered.set(id,at);try{const r=await fetch(`${EVENT_API}?fixtureId=${encodeURIComponent(id)}&reason=${encodeURIComponent(reason)}&_=${at}`,{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)return;window.NOMAD343_FULL_ODDS_MAIN?.reload?.(id)}catch{}}
function inspectFixture(f){const id=fixtureId(f);if(!id||!isLive(f))return;const score=scoreKey(f),prevScore=seenScores.get(id);if(score!==null){if(prevScore!==undefined&&prevScore!==score)trigger(id,'GOAL_OR_SCORE_CHANGE');seenScores.set(id,score)}const events=Array.isArray(f?.events)?f.events:[];let known=seenEvents.get(id);if(!known){known=new Set(events.map(eventKey));seenEvents.set(id,known);return}for(const e of events){const key=eventKey(e);if(!key||known.has(key))continue;known.add(key);if(criticalEvent(e))trigger(id,'CRITICAL_EVENT')}if(known.size>80){const tail=events.slice(-50).map(eventKey);seenEvents.set(id,new Set(tail))}}
async function scan(){if(busy||document.visibilityState!=='visible')return;busy=true;try{await refreshSettings();if(!settings.eventTrigger)return;const r=await fetch(`${BOARD_API}?_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)return;(Array.isArray(j.fixtures)?j.fixtures:[]).forEach(inspectFixture)}finally{busy=false}}
function start(){refreshSettings(true).finally(()=>scan());setInterval(scan,POLL_MS);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.NOMAD343_FULL_MARKET_EVENT_TRIGGER={version:VERSION,scan};
})();
