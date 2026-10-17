/**
 * BALL46 Engine v5 result intake. STAGING ONLY.
 * Native engine still owns betting rules, main live data and pricing.
 */
import { MARKET_RULES, settleMarketSignal } from './market-core.js';
const prefix='ball46:results:v1:';
const fkey=id=>prefix+'fixture:'+encodeURIComponent(String(id));
const ekey=id=>prefix+'evidence:'+encodeURIComponent(String(id));
const wkey=id=>prefix+'winner:'+encodeURIComponent(String(id));
const asName=x=>typeof x==='string'?x:x?.name??'';
const normalize=x=>String(asName(x)).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g,' ').trim().replace(/\s+/g,' ');
const when=x=>typeof x==='string'&&/(Z|[+-]\d{2}:\d{2})$/i.test(x)&&Number.isFinite(Date.parse(x));
const natural=x=>Number.isInteger(x)&&x>=0&&x<=30;
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=reason=>({ok:false,reason,writes:0});
const goalMarket=m=>{
 const def=MARKET_RULES[m];
 return !!def&&def.period==='FT'&&(def.basis===undefined||def.basis==='goals');
};
function fixtureFromBoard(f){
 const id=String(f?.fixtureId??'').trim(),kickoff=f?.kickoffUtc;
 if(!id||!when(kickoff)||!normalize(f.home)||!normalize(f.away)||!normalize(f.league))return null;
 return {fixtureId:id,sourceIds:{'5usd':id},kickoffUtc:new Date(kickoff).toISOString(),
   home:asName(f.home),away:asName(f.away),league:asName(f.league)};
}
/** Called after original native scan; stores identity for PENDING fixtures only. */
export async function capturePendingIdentities(storage){
 const [board,signals]=await Promise.all([storage.get('board'),storage.get('signals')]);
 const wanted=new Set((Array.isArray(signals)?signals:[])
   .filter(s=>s.status==='PENDING').map(s=>String(s.fixtureId)));
 let captured=0,conflicts=0,missing=0;
 for(const raw of Array.isArray(board?.fixtures)?board.fixtures:[]){
  if(!wanted.has(String(raw.fixtureId)))continue;
  const candidate=fixtureFromBoard(raw);
  if(!candidate){missing++;continue;}
  await storage.transaction(async tx=>{
   const old=await tx.get(fkey(candidate.fixtureId));
   if(old){
    if(old.home!==candidate.home||old.away!==candidate.away||old.league!==candidate.league||
      old.kickoffUtc!==candidate.kickoffUtc)conflicts++;
    return;
   }
   await tx.put(fkey(candidate.fixtureId),candidate);
   captured++;
  });
 }
 return {captured,conflicts,missing};
}
/** Dedicated mapping gate. Claim comes from a server-authenticated, licensed adapter. */
export async function bindResultProvider(storage,claim,{certifiedSources={}}={}){
 const source=String(claim?.source??''),sourceId=String(claim?.sourceFixtureId??'');
 const fid=String(claim?.fixtureId??''),cfg=certifiedSources[source];
 if(source==='5usd'||!cfg?.utcCertified||!cfg?.finalScopeCertified||!fid||!sourceId)return fail('PROVIDER_NOT_CERTIFIED');
 if(!when(claim?.kickoffUtc))return fail('SOURCE_TIMEZONE_UNKNOWN');
 return storage.transaction(async tx=>{
  const existing=await tx.get(fkey(fid));
  if(!existing)return fail('CANONICAL_NOT_STORED');
  if(normalize(existing.home)!==normalize(claim.home)||normalize(existing.away)!==normalize(claim.away)||
     normalize(existing.league)!==normalize(claim.league)||
     Math.abs(Date.parse(existing.kickoffUtc)-Date.parse(claim.kickoffUtc))>30*60_000)
     return fail('MATCH_IDENTITY_UNVERIFIED');
  const reverse=prefix+'reverse:'+encodeURIComponent(source)+':'+encodeURIComponent(sourceId);
  const assigned=await tx.get(reverse);
  if(assigned&&assigned!==fid)return fail('PROVIDER_ID_COLLISION');
  if(existing.sourceIds[source]&&existing.sourceIds[source]!==sourceId)return fail('PROVIDER_MAP_IMMUTABLE');
  if(existing.sourceIds[source]===sourceId)return {ok:true,state:'ALREADY_MAPPED',writes:0};
  await tx.put(fkey(fid),{...existing,sourceIds:{...existing.sourceIds,[source]:sourceId}});
  await tx.put(reverse,fid);
  return {ok:true,state:'MAPPED',fixtureId:fid,source,writes:2};
 });
}
/**
 * Atomic source-verification+goal market settlement. One DO transaction
 * commits winning source and PENDING->SETTLED with the ORIGINAL grader.
 * No direct changes to original scanner, locked odds, bets, rules or stats.
 */
export async function acceptFinalScore(storage,obs,{certifiedSources={},clock=Date.now}={}){
 const source=String(obs?.source??''),fid=String(obs?.fixtureId??''),providerId=String(obs?.sourceFixtureId??'');
 const policy=source==='5usd'?{samples:1,minGapMs:0}:certifiedSources[source];
 if(!fid||!providerId||!policy)return fail('SOURCE_UNREGISTERED');
 if(!natural(obs.score?.home)||!natural(obs.score?.away))return fail('SCORE_INVALID');
 if(obs.scoreScope!=='REGULATION_90')return fail('SCORE_SCOPE_NOT_VERIFIED');
 if(source==='5usd'&&!(obs.status==='finished'&&obs.statusCode==='full'))return fail('PRIMARY_NOT_FULL_TIME');
 if(source!=='5usd'&&!(policy.utcCertified&&policy.finalScopeCertified&&obs.status===-1))
   return fail('SECONDARY_NOT_VERIFIED_FT');
 if(!when(obs.kickoffUtc))return fail('KICKOFF_TIMEZONE_UNKNOWN');
 const collectorMs=Number(clock());
 if(!Number.isFinite(collectorMs))return fail('COLLECTOR_CLOCK_INVALID');
 return storage.transaction(async tx=>{
  const identity=await tx.get(fkey(fid));
  if(!identity)return fail('CANONICAL_NOT_STORED');
  if(identity.sourceIds?.[source]!==providerId)return fail('PROVIDER_ID_NOT_MAPPED');
  if(normalize(identity.home)!==normalize(obs.home)||normalize(identity.away)!==normalize(obs.away)||
     normalize(identity.league)!==normalize(obs.league)||
     Math.abs(Date.parse(identity.kickoffUtc)-Date.parse(obs.kickoffUtc))>30*60_000)
    return fail('CROSS_PROVIDER_IDENTITY_MISMATCH');
  if(collectorMs<Date.parse(identity.kickoffUtc)+90*60_000)return fail('TOO_EARLY');
  const existingWinner=await tx.get(wkey(fid));
  if(existingWinner)return {ok:true,state:'ALREADY_SETTLED',winner:existingWinner.source,
     conflict:existingWinner.score.home!==obs.score.home||existingWinner.score.away!==obs.score.away,writes:0};
  const all=await tx.get(ek(fid))||{},history=Array.isArray(all[source])?all[source]:[];
  const point={at:collectorMs,home:obs.score.home,away:obs.score.away};
  const previous=history.length?history[history.length-1]:null;
  const updated=previous&&(previous.home!==point.home||previous.away!==point.away)?[point]:
    previous?.at===point.at?history:[...history,point].slice(-24);
  const next={...all,[source]:updated};
  await tx.put(ek(fid),next);
  const required=Number(policy.samples)||1,minGapMs=Number(policy.minGapMs)||0;
  if(updated.length<required||updated[updated.length-1].at-updated[0].at<minGapMs)
    return {ok:true,state:'AWAITING_CONFIRMATION',samples:updated.length,writes:1};
  const records=await tx.get('signals');
  if(!Array.isArray(records))return fail('NO_NATIVE_SIGNAL_LEDGER');
  const changed=clone(records),updates=[];
  for(const s of changed){
   if(s.status!=='PENDING'||String(s.fixtureId)!==fid||!goalMarket(s.market))continue;
   const verdict=settleMarketSignal(s,{goals:{home:obs.score.home,away:obs.score.away}});
   if(!verdict)continue;
   s.status='SETTLED';s.result=verdict;s.finalScore=clone(obs.score);
   s.settledAt=collectorMs;s.settlementError=null;s.settlementSource=source;
   updates.push({signalId:s.id,market:s.market,result:verdict});
  }
  if(!updates.length)return {ok:true,state:'NO_PENDING_GOAL_MARKETS',writes:1};
  const winner={source,sourceFixtureId:providerId,score:clone(obs.score),at:collectorMs};
  await tx.put('signals',changed);
  await tx.put(wkey(fid),winner);
  return {ok:true,state:'SETTLED',fixtureId:fid,source,settled:updates.length,updates,writes:3};
 });
}
