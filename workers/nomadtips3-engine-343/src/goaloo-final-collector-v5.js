/**
 * STAGING-only Goaloo feed parser/collector. Source controls enabled via
 * explicit Worker flags; nothing auto-runs in production.
 */
import {bindResultProvider,acceptFinalScore} from './multisource-result-v5.js';
const normalize=x=>String(typeof x==='string'?x:x?.name??'').normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g,' ').trim().replace(/\s+/g,' ');
function cells(s){
 const out=[];let part='',quote=null,escape=false;
 for(const c of s){
  if(quote){
   if(escape){part+=c;escape=false}
   else if(c==='\\')escape=true;
   else if(c===quote)quote=null;
   else part+=c;
  }else if(c==="'"||c==='"')quote=c;
  else if(c===','){out.push(part.trim());part='';}
  else part+=c;
 }
 out.push(part.trim());return out;
}
const num=v=>/^-?\d+$/.test(String(v))?Number(v):null;
const utc=(raw,offsetMinutes)=>{
 const x=String(raw??'').replace(' ','T');
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(x))return null;
 const n=Date.parse(x+'Z');
 return Number.isFinite(n)?new Date(n-offsetMinutes*60_000).toISOString():null;
};
/** No remote JS execution. A[] and B[] are explicitly parsed as data only. */
export function parseGoalooFTIndex(script,{offsetMinutes=null}={}){
 if(!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>840)
  return {ok:false,reason:'OFFSET_UNVERIFIED',rows:[]};
 if(typeof script!=='string'||script.length>4_000_000)
  return {ok:false,reason:'DATA_TOO_LARGE_OR_MISSING',rows:[]};
 const leagueIndex=new Map(),out=[];
 for(const m of script.matchAll(/B\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const row=cells(m[2]);leagueIndex.set(Number(m[1]),row[2]||'');
 }
 for(const m of script.matchAll(/A\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g)){
  const row=cells(m[2]);
  if(row.length<11||num(row[8])!==-1||num(row[9])===null||num(row[10])===null)continue;
  const kickoffUtc=utc(row[6],offsetMinutes);
  if(!kickoffUtc||!row[0]||!row[4]||!row[5])continue;
  const score={home:num(row[9]),away:num(row[10])};
  if(!Number.isInteger(score.home)||!Number.isInteger(score.away)||score.home<0||
     score.away<0||score.home>30||score.away>30)continue;
  out.push({sourceFixtureId:String(row[0]),home:row[4],away:row[5],
    league:leagueIndex.get(Number(row[1]))||'',kickoffUtc,score,status:-1});
 }
 return {ok:true,rows:out};
}
function normalizeAliases(aliases){
 return Object.fromEntries(Object.entries(aliases||{}).map(([k,v])=>[normalize(k),normalize(v)]));
}
/** Pre-validated canonical records only; ambiguity, source alias and collision HOLD. */
export function matchGoalooFT(canonicals,goalooRows,{approvedLeagueAliases={}}={}){
 const aliases=normalizeAliases(approvedLeagueAliases),accepted=[],rejected=[];
 for(const g of goalooRows){
  const league=aliases[normalize(g.league)]||normalize(g.league);
  const matches=canonicals.filter(f=>normalize(f.home)===normalize(g.home)&&
    normalize(f.away)===normalize(g.away)&&normalize(f.league)===league&&
    Math.abs(Date.parse(f.kickoffUtc)-Date.parse(g.kickoffUtc))<=30*60_000);
  if(matches.length!==1){rejected.push({id:g.sourceFixtureId,reason:matches.length?'AMBIGUOUS_IDENTITY':'NO_VERIFIED_IDENTITY'});continue}
  const f=matches[0];
  accepted.push({canonical:f,goaloo:g,canonicalLeague:f.league});
 }
 return {accepted,rejected};
}
/** Runs independently of the native 5USD pricing/selection engine. */
export async function pollMappedGoaloo({
 storage,sourceText,fixtureIds,utcCertified=false,offsetMinutes=null,
 finalScopeCertified=false,approvedLeagueAliases={},clock=Date.now
}={}){
 if(!utcCertified||!finalScopeCertified)return {ok:false,reason:'SOURCE_CERTIFICATION_REQUIRED'};
 const parsed=parseGoalooFTIndex(sourceText,{offsetMinutes});
 if(!parsed.ok)return parsed;
 const canonicals=[];
 for(const id of fixtureIds){
  const r=await storage.get('ball46:results:v1:fixture:'+encodeURIComponent(String(id)));
  if(r)canonicals.push(r);
 }
 const matched=matchGoalooFT(canonicals,parsed.rows,{approvedLeagueAliases});
 const results=[];
 for(const item of matched.accepted){
  const {canonical:f,goaloo:g}=item;
  const policy={goaloo:{utcCertified:true,finalScopeCertified:true,samples:2,minGapMs:60_000}};
  const bound=await bindResultProvider(storage,{
   source:'goaloo',sourceFixtureId:g.sourceFixtureId,fixtureId:f.fixtureId,
   home:f.home,away:f.away,league:f.league,kickoffUtc:g.kickoffUtc
  },{certifiedSources:policy});
  if(!bound.ok){results.push({fixtureId:f.fixtureId,result:bound.reason});continue}
  const r=await acceptFinalScore(storage,{
   source:'goaloo',sourceFixtureId:g.sourceFixtureId,fixtureId:f.fixtureId,
   home:f.home,away:f.away,league:f.league,kickoffUtc:g.kickoffUtc,
   score:g.score,status:-1,scoreScope:'REGULATION_90'
  },{certifiedSources:policy,clock});
  results.push({fixtureId:f.fixtureId,result:r.state||r.reason,settled:r.settled||0});
 }
 return {ok:true,parsedFT:parsed.rows.length,matched:matched.accepted.length,
  skipped:matched.rejected.length,results};
}
