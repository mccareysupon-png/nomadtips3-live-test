/**
 * BALL46 Engine 3.43 v5 — full-time goal result handoff.
 * Calls the original settleMarketSignal; no new betting rules.
 * Staging branch only. Caller must verify provider ID and FT evidence.
 */
import { MARKET_RULES, settleMarketSignal } from './market-core.js';
const natural=n=>Number.isInteger(n)&&n>=0&&n<=30;
const eligible=market=>{const d=MARKET_RULES[market];return !!d&&d.period==='FT'&&(d.basis===undefined||d.basis==='goals')};
const clone=v=>JSON.parse(JSON.stringify(v));
const st=v=>String(v??'').trim();
export function nativeGoalMarkets(){return Object.keys(MARKET_RULES).filter(eligible)}
export async function settleVerifiedGoalEvidence(storage,candidate,{now=Date.now}={}){
 if(typeof storage?.transaction!=='function')throw Error('ATOMIC_DURABLE_STORAGE_REQUIRED');
 if(candidate?.verified!==true||candidate.scope!=='REGULATION_90'||!st(candidate.fixtureId)||!st(candidate.source)||
    !natural(candidate.score?.home)||!natural(candidate.score?.away))
   return {state:'HOLD',reason:'UNVERIFIED_FT_EVIDENCE'};
 return storage.transaction(async tx=>{
   const original=await tx.get('signals');
   if(!Array.isArray(original))return {state:'NO_ACTION',reason:'NO_NATIVE_LEDGER'};
   const rows=clone(original),updates=[];
   for(const s of rows){
     if(st(s.fixtureId)!==st(candidate.fixtureId)||s.status!=='PENDING'||!eligible(s.market))continue;
     const actual={goals:{home:candidate.score.home,away:candidate.score.away}};
     const outcome=settleMarketSignal(s,actual);
     if(!outcome)continue;
     s.status='SETTLED';s.result=outcome;s.finalScore=clone(actual.goals);
     s.settledAt=now();s.settlementError=null;s.settlementSource=st(candidate.source);
     s.settlementVerifiedAt=candidate.verifiedAt??null;
     // Deliberately leave finalCorners, finalCards and HT result unchanged.
     updates.push({id:s.id,market:s.market,result:outcome});
   }
   if(!updates.length)return {state:'NO_ACTION',reason:'NO_ELIGIBLE_PENDING_GOALS'};
   await tx.put('signals',rows);
   return {state:'SETTLED_BY_NATIVE_V5',reason:'FIRST_VERIFIED_RESULT',
     fixtureId:st(candidate.fixtureId),source:st(candidate.source),count:updates.length,updates};
 });
}
