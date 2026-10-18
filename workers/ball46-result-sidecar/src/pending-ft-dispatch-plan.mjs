import {pendingMarketEligible} from './pending-ledger-reader.mjs';
import {prepareOriginalEngineFinal} from './native-ledger-handoff.mjs';
const str=x=>String(x??'').trim();
const validScore=x=>Number.isInteger(x?.home)&&Number.isInteger(x?.away);
const finished=x=>x?.boardState==='finished'||/finished|full[_ ]?time|\bft\b|ended/i.test(String(x?.status??''));
export function planVerifiedPendingFt({pendingRows=[],verifiedResults=[],hubFixtures=[],maxFixtures=3}={}){
 if(!Array.isArray(pendingRows)||!Array.isArray(verifiedResults)||!Array.isArray(hubFixtures)||
   !Number.isInteger(maxFixtures)||maxFixtures<1||maxFixtures>3)
  return{ok:false,reason:'BAD_INPUT',ready:[],hold:[]};
 const goals=new Map(),hold=[],verified=new Map(),liveById=new Map();
 for(const x of hubFixtures)if(x?.fixtureId)liveById.set(str(x.fixtureId),x);
 for(const row of pendingRows){
  if(!pendingMarketEligible(row))continue;
  const id=str(row.fixtureId);
  const group=goals.get(id)||[];group.push(str(row.id));goals.set(id,group);
 }
 for(const row of verifiedResults){
  const id=str(row?.fixtureId);
  if(!goals.has(id))continue;
  const p=prepareOriginalEngineFinal(row);
  if(!p.ok||!row.firstFtSeenAt||!row.verifiedAt){
   hold.push({fixtureId:id,reason:'INCOMPLETE_DUAL_FT_PROOF'});continue;
  }
  const group=verified.get(id)||[];group.push({candidate:row,prepared:p});verified.set(id,group);
 }
 const ready=[];
 for(const [fid,ids] of goals){
  const result=verified.get(fid)||[];
  if(result.length!==1){hold.push({fixtureId:fid,reason:result.length?'COMPETING_FT_EVIDENCE':'NO_VERIFIED_FT'});continue;}
  const {candidate,prepared}=result[0];
  const hub=liveById.get(fid);
  if(hub&&finished(hub)&&validScore(hub.goals)&&
    (Number(hub.goals.home)!==candidate.score.home||Number(hub.goals.away)!==candidate.score.away)){
   hold.push({fixtureId:fid,reason:'5USD_GOALOO_FT_CONFLICT'});continue;
  }
  ready.push({fixtureId:fid,signalIds:[...new Set(ids)],prepared});
 }
 ready.sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId));
 return{ok:true,ready:ready.slice(0,maxFixtures),
  deferred:Math.max(0,ready.length-maxFixtures),hold,matched:ready.length,
  pendingFixtureCount:goals.size,readOnly:true};
}
