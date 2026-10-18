/**
 * BALL46 Goaloo result Sidecar — independent Worker, staging-by-default.
 * 5USD continues to own live odds and signal generation.
 * All cross-provider match IDs are captured EARLY, before FT.
 * No Corners required. Settlement delegated to existing Engine bridge only.
 */
import {DurableObject} from 'cloudflare:workers';
import {proposeVerifiedMappings} from '../../../integrations/multisource/cross-source-fixture-mapper.mjs';
// One key per match, to avoid Cloudflare's per-value size limit.
// Never remove unconfirmed PENDING-match mappings during routine polling.
const prefix='ball46:verified-fixture-crosswalk:v3:';
const fixtureKey=id=>prefix+'f:'+encodeURIComponent(String(id));
const sourceKey=(source,id)=>prefix+'r:'+encodeURIComponent(source)+':'+encodeURIComponent(String(id));
const evidenceKey=(source,id)=>prefix+'e:'+encodeURIComponent(source)+':'+encodeURIComponent(String(id));
const metaKey=prefix+'meta';
const isUtc=x=>typeof x==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/i.test(x)&&Number.isFinite(Date.parse(x));
const flag=x=>String(x??'')==='1';
const str=x=>String(typeof x==='string'?x:x?.name??'').trim();
const clone=x=>JSON.parse(JSON.stringify(x));
const initial=()=>({events:[],version:3});
const asInt=x=>/^-?\d+$/.test(String(x))?Number(x):null;
function csv(s){
 const out=[];let current='',quote=null,slash=false;
 for(const char of s){
  if(quote){if(slash){current+=char;slash=false}
   else if(char==='\\')slash=true;
   else if(char===quote)quote=null;
   else current+=char}
  else if(char==="'"||char==='"')quote=char;
  else if(char===','){out.push(current.trim());current=''}
  else current+=char;
 }
 out.push(current.trim());return out;
}
export function parseGoalooFixtures(raw,{certified=false,offsetMinutes=null}={}){
 if(!certified||!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>840)
  return {ok:false,reason:'GOALOO_TIMEZONE_NOT_CERTIFIED',rows:[]};
 if(typeof raw!=='string'||raw.length>4_000_000)return{ok:false,reason:'GOALOO_BAD_SIZE',rows:[]};
 const leagues=new Map(),rows=[];
 for(const x of raw.matchAll(/B\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const arr=csv(x[2]);leagues.set(Number(x[1]),arr[2]||'');
 }
 for(const x of raw.matchAll(/A\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const arr=csv(x[2]);if(arr.length<11)continue;
  const rawTime=String(arr[6]).replace(' ','T');
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(rawTime))continue;
  const timestamp=Date.parse(rawTime+'Z');
  if(!Number.isFinite(timestamp))continue;
  const home=str(arr[4]),away=str(arr[5]),league=leagues.get(asInt(arr[1]))||'';
  const sourceFixtureId=str(arr[0]);
  if(!sourceFixtureId||!home||!away||!league)continue;
  const score={home:asInt(arr[9]),away:asInt(arr[10])};
  const ft=asInt(arr[8])===-1&&[score.home,score.away].every(v=>Number.isInteger(v)&&v>=0&&v<=30);
  rows.push({sourceFixtureId,home,away,league,
   kickoffUtc:new Date(timestamp-offsetMinutes*60_000).toISOString(),
   isFT:ft,score:ft?score:null});
 }
 return{ok:true,rows};
}
function canonical(x){
 const fixtureId=String(x?.fixtureId??'').trim(),home=str(x?.home),away=str(x?.away),
  league=str(x?.league),kickoffUtc=x?.kickoffUtc;
 if(!fixtureId||!home||!away||!league||!isUtc(kickoffUtc))return null;
 return{fixtureId,home,away,league,kickoffUtc:new Date(kickoffUtc).toISOString()};
}
function getAliases(raw){
 if(typeof raw!=='string')throw Error('ALIAS_MANIFEST_REQUIRED');
 const obj=JSON.parse(raw);
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('INVALID_ALIAS_MANIFEST');
 return obj;
}
const reverseId=(source,id)=>source+':'+id;
const log=(s,at,event,details={})=>{s.events.push({at,event,...details});s.events=s.events.slice(-150)};
export async function applySnapshot(storage,{
 hubFixtures=[],goalooText,at,utcCertified=false,ftCertified=false,
 offsetMinutes=null,leagueAliases={},teamAliases={},countryStrict=false
}={}){
 if(!isUtc(at))throw Error('COLLECTOR_CLOCK_UNVERIFIED');
 const parsed=parseGoalooFixtures(goalooText,{certified:utcCertified,offsetMinutes});
 if(!parsed.ok)return{state:parsed.reason,inserted:0,mapped:0,ftReady:0,accepted:0};
 const sourceFixtures=parsed.rows;
 if(typeof storage?.transaction!=='function')throw Error('DURABLE_DO_REQUIRED');
 return storage.transaction(async tx=>{
  const state=(await tx.get(metaKey))||initial();
  const all=await tx.list({prefix:prefix+'f:'});
  const fixtures=new Map([...all.values()].map(f=>[String(f.fixtureId),f]));
  let inserted=0,conflicts=0,matched=0,held=0,ftReady=0,sourceCollision=0;
  for(const raw of hubFixtures){
   const f=canonical(raw);if(!f){held++;continue}
   const existing=fixtures.get(f.fixtureId);
   if(existing){
    if(['home','away','league','kickoffUtc'].some(k=>existing[k]!==f[k]))conflicts++;
    continue;
   }
   const entry={...f,sourceIds:{'5usd':f.fixtureId},firstSeenAt:at};
   fixtures.set(f.fixtureId,entry);
   await tx.put(fixtureKey(f.fixtureId),entry);inserted++;
  }
  // Cross-provider identity must be mutual-best across the FULL source batch.
  const suggested=proposeVerifiedMappings([...fixtures.values()],sourceFixtures,{
   source:'goaloo',sourceUtcCertified:utcCertified,approvedLeagues:leagueAliases,
   approvedTeamAliases:teamAliases,strictCountry:countryStrict});
  for(const m of suggested.approved){
   const f=fixtures.get(m.fixtureId);if(!f)continue;
   const rkey=sourceKey(m.source,m.sourceFixtureId);
   const existingOwner=await tx.get(rkey);
   if((existingOwner&&existingOwner!==m.fixtureId)||
      (f.sourceIds.goaloo&&f.sourceIds.goaloo!==m.sourceFixtureId)){
    sourceCollision++;continue;
   }
   if(!f.sourceIds.goaloo){
    const updated={...f,sourceIds:{...f.sourceIds,goaloo:m.sourceFixtureId},
     sourceMapping:{policy:'fixture-match-v3',score:m.score,
      certifiedAt:at,sourceKickoffUtc:m.sourceKickoffUtc}};
    await tx.put(fixtureKey(m.fixtureId),updated);
    await tx.put(rkey,m.fixtureId);
    fixtures.set(m.fixtureId,updated);matched++;
   }
  }
  const finished=[];
  for(const p of sourceFixtures){
   if(!p.isFT||!ftCertified)continue;
   const fid=await tx.get(sourceKey('goaloo',p.sourceFixtureId));
   const f=fixtures.get(fid);
   if(!f||f.sourceIds.goaloo!==p.sourceFixtureId)continue;
   if(Date.parse(at)<Date.parse(f.kickoffUtc)+90*60_000)continue;
   const ekey=evidenceKey('goaloo',fid),prior=await tx.get(ekey)||[];
   const last=prior.at(-1),same=last?.home===p.score.home&&last?.away===p.score.away;
   const next=!same?[{at,home:p.score.home,away:p.score.away}]:
     last.at===at?prior:[...prior,{at,home:p.score.home,away:p.score.away}].slice(-24);
   if(JSON.stringify(prior)!==JSON.stringify(next))await tx.put(ekey,next);
   if(next.length<2||Date.parse(next.at(-1).at)-Date.parse(next[0].at)<60_000)continue;
   ftReady++;finished.push({fixtureId:fid,source:'goaloo',
    sourceFixtureId:p.sourceFixtureId,score:clone(p.score),fixture:clone(f)});
  }
  if(conflicts||sourceCollision){
   log(state,at,'IDENTITY_CONFLICT',{conflicts,sourceCollision});
   await tx.put(metaKey,state);
  }
  return{state:'CAPTURED_AND_EVALUATED',inserted,matched,held,conflicts,
   sourceCollision,ftReady,verifiedResults:finished,
   proposed:suggested.coverage.approved,reviewCount:suggested.review.length,
   fixtureCount:fixtures.size,sourceCount:sourceFixtures.length,releasedToEngine:false};
 });
}
export async function inspectSidecar(storage){
 const [fixtures,reverse,evidence,meta]=await Promise.all([
  storage.list({prefix:prefix+'f:'}),storage.list({prefix:prefix+'r:'}),
  storage.list({prefix:prefix+'e:'}),storage.get(metaKey)]);
 return {fixtureCount:fixtures.size,sourceMappings:reverse.size,
  ftEvidenceKeys:evidence.size,forwardRequests:0,
  recentEvents:(meta?.events||[]).slice(-10),version:3};
}
async function fetchGoaloo(fetcher){
 for(const url of ['https://live10.goaloo28.com/gf/data/bf_us.js',
                   'https://live10.goaloo28.com/gf/data/bf_us1.js']){
  try{const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!r.ok)continue;
   const length=Number(r.headers.get('content-length')||0);if(length>4_000_000)continue;
   const raw=await r.text();if(raw.length<=4_000_000&&raw.includes('A['))return raw;
  }catch{}
 }
 throw Error('GOALOO_FEED_UNAVAILABLE');
}
async function poll(storage,env,fetcher=fetch){
 if(!flag(env?.GOALOO_POLL_ENABLED))return{state:'DISABLED',nativeWrites:0};
 if(!flag(env?.GOALOO_UTC_CERTIFIED)||!flag(env?.GOALOO_FT_CERTIFIED))
  return{state:'SOURCE_CERTIFICATION_REQUIRED',nativeWrites:0};
 if(!/^-?\d+$/.test(String(env?.GOALOO_OFFSET_MINUTES??'')))
  return{state:'OFFSET_NOT_CERTIFIED',nativeWrites:0};
 if(!env?.HUB?.fetch)return{state:'HUB_BINDING_MISSING',nativeWrites:0};
 const hub=await env.HUB.fetch('https://hub.internal/snapshot');
 if(!hub.ok)return{state:'HUB_UNAVAILABLE',http:hub.status,nativeWrites:0};
 const data=await hub.json();
 if(!data?.ok||!Array.isArray(data.fixtures))return{state:'HUB_CONTRACT_INVALID',nativeWrites:0};
 const result=await applySnapshot(storage,{hubFixtures:data.fixtures,goalooText:await fetchGoaloo(fetcher),
  at:new Date().toISOString(),utcCertified:true,ftCertified:true,
  offsetMinutes:Number(env.GOALOO_OFFSET_MINUTES),
  leagueAliases:getAliases(String(env.GOALOO_APPROVED_LEAGUES||'{}')),
  teamAliases:getAliases(String(env.GOALOO_APPROVED_TEAMS||'{}'))});
 // Intentionally shadow-only until current Engine Ledger V2 and dedicated
 // authenticated result bridge are separately certified on actual active code.
 return{...result,verifiedResultsCount:result.verifiedResults?.length??0,
  verifiedResults:undefined,nativeWrites:0,forwardingEnabled:false};
}
export class Ball46FixtureResultRegistry extends DurableObject{
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/health')
   return Response.json({ok:true,mode:'SIDECAR_SHADOW_NO_ENGINE_BINDING',...await inspectSidecar(this.ctx.storage)});
  if(request.method==='POST'&&path==='/poll'){
   const secret=String(this.env.SIDECAR_ADMIN_TOKEN??''),
     supplied=String(request.headers.get('x-sidecar-token')??'');
   if(secret.length<32||secret!==supplied)return Response.json({ok:false,error:'UNAUTHORIZED'},{status:401});
   try{return Response.json(await poll(this.ctx.storage,this.env))}
   catch(e){return Response.json({ok:false,error:String(e?.message||e).slice(0,90)},{status:503})}
  }
  return new Response('NOT_FOUND',{status:404});
 }
}
export default {
 fetch(request,env){
  const id=env.RESULT_REGISTRY.idFromName('ball46-fixtures-shadow');
  return env.RESULT_REGISTRY.get(id).fetch(request);
 }
};
