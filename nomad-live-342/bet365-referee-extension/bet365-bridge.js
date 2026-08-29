(()=>{
'use strict';
const RAW_EVENT='nomad:bet365-raw-frame';
const SCHEMA='bet365-referee';
const state={suffix:'_1_3',events:new Map(),byOi:new Map(),objects:new Map(),fingerprints:new Map()};
function toDict(txt){
  const out={};for(const item of String(txt||'').replace(/;$/,'').split(';')){const i=item.indexOf('=');if(i>0)out[item.slice(0,i)]=item.slice(i+1);}return out;
}
function setSuffix(lang){const n=Number(lang);if(Number.isFinite(n))state.suffix=`_${n}_${n===1?3:0}`;}
function eventSport(it){const m=String(it||'').match(new RegExp(`C(\\d+)A${state.suffix.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}$`));return m?m[1]:null;}
function objectKeys(obj){return [obj.IT,obj.ID,obj.MA,obj.OI].filter(Boolean).map(String);}
function indexObject(obj){for(const k of objectKeys(obj))state.objects.set(k,obj);}
function findEvent(fi){if(!fi)return null;return state.byOi.get(String(fi))||state.events.get(String(fi))||null;}
function upsertEvent(d){
  const sport=eventSport(d.IT);if(sport!=='1')return null;
  const key=String(d.IT||d.OI||d.ID||'');if(!key)return null;
  const prev=state.events.get(key)||{};const ev={...prev,...d,_sportId:sport,markets:Array.isArray(prev.markets)?prev.markets:[]};
  state.events.set(key,ev);if(ev.OI)state.byOi.set(String(ev.OI),ev);if(ev.C3)state.byOi.set(String(ev.C3),ev);indexObject(ev);return ev;
}
function addMarket(d,currentEvent){
  const ev=findEvent(d.FI)||currentEvent;if(!ev)return null;
  let m=ev.markets.find(x=>String(x.IT||'')===String(d.IT||'')&&d.IT)||ev.markets.find(x=>String(x.ID||x.MA||'')===String(d.ID||d.MA||'')&&(d.ID||d.MA));
  if(!m){m={odds:[]};ev.markets.push(m);}Object.assign(m,d);if(!Array.isArray(m.odds))m.odds=[];m._event=ev;indexObject(m);ev._currentMarket=m;return m;
}
function addSelection(d,currentEvent){
  const ev=findEvent(d.FI)||currentEvent;if(!ev)return null;
  const m=ev._currentMarket||ev.markets[ev.markets.length-1];if(!m)return null;
  let p=m.odds.find(x=>String(x.IT||'')===String(d.IT||'')&&d.IT)||m.odds.find(x=>String(x.ID||'')===String(d.ID||'')&&d.ID);
  if(!p){p={};m.odds.push(p);}Object.assign(p,d);p._market=m;p._event=ev;indexObject(p);return p;
}
function updateObject(target,d){
  const key=String(target||'').split('/').pop();const obj=state.objects.get(String(target||''))||state.objects.get(key);
  if(obj){Object.assign(obj,d);indexObject(obj);return obj;}
  const ev=state.events.get(String(target||''))||state.events.get(key);if(ev){Object.assign(ev,d);indexObject(ev);return ev;}return null;
}
function removeEvent(target){
  const key=String(target||'').split('/').pop();const ev=state.events.get(String(target||''))||state.events.get(key)||state.objects.get(key);if(!ev||!ev.markets)return;
  for(const [k,v] of state.events)if(v===ev)state.events.delete(k);for(const [k,v] of state.byOi)if(v===ev)state.byOi.delete(k);
}
function initData(txt){
  state.events.clear();state.byOi.clear();state.objects.clear();let current=null;
  for(const item of String(txt||'').split('|').slice(1)){
    if(!item||item.length<2)continue;const type=item.slice(0,2),d=toDict(item.length>3?item.slice(3):'');
    if(type==='EV')current=upsertEvent(d);else if(type==='MA')addMarket(d,current);else if(type==='PA')addSelection(d,current);
  }
}
function updateData(target,txt){
  if(!String(txt||'').includes('|'))return;const cut=String(txt).indexOf('|'),action=String(txt).slice(0,cut),body=String(txt).slice(cut+1);
  if(action==='U'){updateObject(target,toDict(body));return;}
  if(action==='D'){removeEvent(target);return;}
  if(action!=='I'||body.length<2)return;
  const type=body.slice(0,2),d=toDict(body.length>3?body.slice(3):'');
  if(type==='EV')upsertEvent(d);else if(type==='MA')addMarket(d,null);else if(type==='PA')addSelection(d,null);
}
function dataParse(raw){
  if(!raw||!String(raw).startsWith('\x15')&&!String(raw).startsWith('\x14'))return;
  for(const item0 of String(raw).split('|\x08')){
    const item=item0.trim();if(!item)continue;const parts=item.slice(1).split('\x01',2);if(parts.length<2)continue;const key=parts[0],val=parts[1];
    if(item.startsWith('\x14OVInPlay_'))initData(val);else if(item.startsWith('\x15'))updateData(key,val);
  }
}
function norm(v){return String(v||'').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function splitTeams(name){for(const re of [/\s+v\s+/i,/\s+vs\.?\s+/i,/\s+-\s+/]){const p=String(name||'').split(re);if(p.length===2&&p[0].trim()&&p[1].trim())return [p[0].trim(),p[1].trim()];}return ['',''];}
function lineValue(v){
  const s=String(v??'').trim().replaceAll('−','-').replaceAll('＋','+');if(!s)return null;
  if(s.includes('/')){const a=s.split('/').map(Number);return a.length===2&&a.every(Number.isFinite)?(a[0]+a[1])/2:null;}
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function decimalOdds(v){
  const s=String(v??'').trim();if(!s)return null;if(s.includes('/')){const [a,b]=s.split('/').map(Number);return Number.isFinite(a)&&Number.isFinite(b)&&b?1+a/b:null;}const n=Number(s.replace(',','.'));return Number.isFinite(n)&&n>=1?n:null;
}
function active(p){return String(p?.SU??'0')!=='1';}
function marketIsFtAh(m){
  const n=norm(m?.NA||'');if(!n)return false;if(!n.includes('handicap'))return false;if(/first half|1st half|half time|second half|2nd half|corners?|cards?|bookings?|team handicap/.test(n))return false;return true;
}
function selectionMatch(name,team,side){const n=norm(name),t=norm(team);if(!n)return false;if(t&&(n===t||n.includes(t)||t.includes(n)))return true;return side==='home'?/^(home|1)$/.test(n):/^(away|2)$/.test(n);}
function pairMarket(ev,m){
  if(!marketIsFtAh(m))return null;const teams=splitTeams(ev.NA);if(!teams[0]||!teams[1])return null;
  const rows=(m.odds||[]).filter(active).filter(p=>lineValue(p.HA??p.HD)!==null&&decimalOdds(p.OD)!==null);if(rows.length<2)return null;
  let home=rows.find(p=>selectionMatch(p.NA,teams[0],'home')),away=rows.find(p=>selectionMatch(p.NA,teams[1],'away'));
  if(!home||!away){
    const first=rows[0],second=rows[1],l1=lineValue(first.HA??first.HD),l2=lineValue(second.HA??second.HD);
    if(Math.abs(l1+l2)>0.001)return null;home=first;away=second;
  }
  const hl=lineValue(home.HA??home.HD),al=lineValue(away.HA??away.HD);if(hl===null||al===null||Math.abs(hl+al)>0.001)return null;
  const ho=decimalOdds(home.OD),ao=decimalOdds(away.OD);if(ho===null||ao===null)return null;
  return {teams,home,away,hl,al,ho,ao};
}
function minuteOf(ev){const n=Number(ev.TM);return Number.isFinite(n)?n:null;}
function periodOf(ev){if(String(ev.MD)==='0')return '1H';if(String(ev.MD)==='1')return '2H';return String(ev.CP||'');}
function emitPayload(payload){
  const fp=[payload.event_id,payload.market_id,payload.selection_id,payload.home_line,payload.away_line,payload.home_odds_raw,payload.away_odds_raw].join('|');
  const key=`${payload.event_id}|${payload.market_id}|${payload.selection_id}`;if(state.fingerprints.get(key)===fp)return;state.fingerprints.set(key,fp);
  try{chrome.runtime.sendMessage({type:'BET365_REFEREE_UPDATE',payload},()=>void chrome.runtime.lastError);}catch{}
}
function emitCandidates(receivedAt){
  const seen=new Set();for(const ev of state.events.values()){
    if(seen.has(ev))continue;seen.add(ev);if(String(ev._sportId)!=='1')continue;
    for(const m of ev.markets||[]){const pair=pairMarket(ev,m);if(!pair)continue;
      const eventId=String(ev.OI||ev.C3||ev.C2||ev.ID||ev.IT||'');const marketId=String(m.ID||m.MA||m.IT||'');const selectionId=`${pair.home.ID||pair.home.IT||'home'}|${pair.away.ID||pair.away.IT||'away'}`;if(!eventId||!marketId||!selectionId)continue;
      emitPayload({schema:SCHEMA,event_id:eventId,fixture_id:String(ev.OI||''),home:pair.teams[0],away:pair.teams[1],league:String(ev.CT||''),segment:'FT',market_id:marketId,selection_id:selectionId,home_line:String(pair.home.HA??pair.home.HD),away_line:String(pair.away.HA??pair.away.HD),home_odds_raw:String(pair.home.OD),away_odds_raw:String(pair.away.OD),odds_type:'AUTO',score:String(ev.SS||''),period:periodOf(ev),minute:minuteOf(ev),source_timestamp:receivedAt||new Date().toISOString(),received_at_utc:new Date().toISOString(),transport:'WEBSOCKET'});
    }
  }
}
window.addEventListener(RAW_EVENT,event=>{
  let detail=event?.detail;try{if(typeof detail==='string')detail=JSON.parse(detail);}catch{return;}if(!detail||typeof detail.data!=='string')return;
  setSuffix(detail.lang);dataParse(detail.data);emitCandidates(detail.received_at_utc);
});
})();