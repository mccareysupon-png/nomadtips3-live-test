import {step7} from './step7-seed.mjs';
import {coverage,totals} from './history.mjs';
export function approvedHistoryTransport(env){
 if(!env?.SOURCE_HUB||typeof env.SOURCE_HUB.fetch!=='function'||typeof env.HISTORY_BRIDGE_SECRET!=='string'||env.HISTORY_BRIDGE_SECRET.length<24)return null;
 return async path=>{
  const r=await env.SOURCE_HUB.fetch('https://hub.internal/__private/provider/v1',{method:'POST',headers:{authorization:'Bearer '+env.HISTORY_BRIDGE_SECRET,'content-type':'application/json'},body:JSON.stringify({kind:'history',path})});
  if(!r.ok)return {status:r.status,retryAfter:r.headers.get('retry-after')};
  const j=await r.json();
  if(j?.state==='deferred_budget')return j;
  return j;
 };
}
export function upcomingCoverage(db,fixtures,now){
 const matches=[],teams=new Map(),leagues=new Set();
 for(const f of fixtures){
  const h=Number(f.home?.id),a=Number(f.away?.id),l=Number(f.league?.id),k=Math.floor(Number(f.kickoffAt)/1000);
  if(f.status!=='scheduled'||f.boardState!=='scheduled'||!Number.isSafeInteger(k)||k<=now||![h,a,l].every(x=>Number.isSafeInteger(x)&&x>0)||h===a)continue;
  const hc=coverage(db,h,k,now),ac=coverage(db,a,k,now);
  for(const [id,c] of [[h,hc],[a,ac]])teams.set(id,Math.min(teams.get(id)??10,c.count));
  leagues.add(l);matches.push({fixtureId:String(f.fixtureId),homeTeamId:h,awayTeamId:a,homeMatches:hc.count,awayMatches:ac.count,eligible:hc.complete&&ac.complete});
 }
 return {stored:totals(db),leagueIds:[...leagues],upcoming:matches.length,teams:teams.size,teamsWith10:[...teams.values()].filter(n=>n===10).length,eligible:matches.filter(m=>m.eligible).length,matches};
}
export async function seedFromSnapshot(db,env,snapshot,now){
 if(snapshot?.ok!==true||snapshot.cacheOnly!==true||snapshot.externalRequestsAdded!==0||snapshot.stale!==false||!Number.isFinite(snapshot.ageMs)||snapshot.ageMs>30000||!Array.isArray(snapshot.fixtures))throw Error('INVALID_CACHE');
 const before=upcomingCoverage(db,snapshot.fixtures,now),transport=approvedHistoryTransport(env);
 if(!transport||!before.leagueIds.length)return {state:'BLOCKED_NO_AUTHORIZED_CONNECTION',requests:0,...before};
 const result=await step7(db,{now,leagueIds:before.leagueIds,transport,approved:true});
 return {...result,...upcomingCoverage(db,snapshot.fixtures,now)};
}
