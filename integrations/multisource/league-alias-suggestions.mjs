import {nameSimilarity,normalizedName} from './cross-source-fixture-mapper.mjs';
const normalized=x=>typeof x==='string'?x:x?.name??'';
const validTime=x=>typeof x==='string'&&/(Z|[+-]\d{2}:\d{2})$/i.test(x)&&Number.isFinite(Date.parse(x));
/**
 * LEARN MODE: recommend league aliases from repeated independent strong
 * matches, but NEVER auto-approve the alias and NEVER settle a bet.
 * Only exact team identity + verified UTC kickoff + uniquely paired game
 * counts as one instance. External review approves an alias separately.
 */
export function suggestLeagueAliases(canonicals,sourceRows,{
 sourceUtcCertified=false,minDistinctFixtures=2,withinMinutes=10
}={}){
 if(sourceUtcCertified!==true)return {suggestions:[],reason:'SOURCE_UTC_NOT_CERTIFIED',writes:0};
 const pairs=[];
 for(const c of canonicals){
  if(!c.fixtureId||!validTime(c.kickoffUtc))continue;
  for(const p of sourceRows){
   if(!p.sourceFixtureId||!validTime(p.kickoffUtc))continue;
   const gap=Math.abs(Date.parse(c.kickoffUtc)-Date.parse(p.kickoffUtc))/60000;
   if(gap>withinMinutes)continue;
   const home=nameSimilarity(c.home,p.home),away=nameSimilarity(c.away,p.away);
   if(home<.99||away<.99)continue;
   const cl=normalizedName(c.league),pl=normalizedName(p.league);
   if(!cl||!pl||cl===pl)continue;
   pairs.push({c,p,cl,pl,gap});
  }
 }
 const byCanon=new Map(),bySource=new Map();
 for(const v of pairs){
  const ci=String(v.c.fixtureId),pi=String(v.p.sourceFixtureId);
  byCanon.set(ci,(byCanon.get(ci)||0)+1);bySource.set(pi,(bySource.get(pi)||0)+1);
 }
 const strong=pairs.filter(v=>byCanon.get(String(v.c.fixtureId))===1&&
  bySource.get(String(v.p.sourceFixtureId))===1);
 const groups=new Map();
 for(const v of strong){
  const k=v.pl+' -> '+v.cl,g=groups.get(k)||{sourceLeague:normalized(v.p.league),
   canonicalLeague:normalized(v.c.league),fixtureIds:new Set(),sourceIds:new Set(),evidence:[]};
  g.fixtureIds.add(String(v.c.fixtureId));g.sourceIds.add(String(v.p.sourceFixtureId));
  if(g.evidence.length<8)g.evidence.push({fixtureId:String(v.c.fixtureId),
   sourceId:String(v.p.sourceFixtureId),kickoffDeltaMinutes:v.gap});
  groups.set(k,g);
 }
 const suggestions=[...groups.values()].filter(g=>g.fixtureIds.size>=minDistinctFixtures&&
  g.sourceIds.size>=minDistinctFixtures).map(g=>({
   sourceLeague:g.sourceLeague,canonicalLeague:g.canonicalLeague,
   evidence:g.evidence,distinctMatches:g.fixtureIds.size,
   state:'REVIEW_REQUIRED',autoAccepted:false
 })).sort((a,b)=>b.distinctMatches-a.distinctMatches);
 return {suggestions,reviewed:false,writes:0};
}
