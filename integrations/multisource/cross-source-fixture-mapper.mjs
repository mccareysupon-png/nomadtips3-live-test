/**
 * BALL46 cross-provider fixture identity linker (staging, PURE / read-only).
 * Canonical fixture owner: 5USD. Additional providers: Goaloo, future sources.
 * Never uses corners, odds, bookmaker markets or a final score to determine identity.
 * A match is AUTO_APPROVED only when both teams, league and UTC kickoff agree,
 * and the candidate is mutual-best, one-to-one, sufficiently separated from runner-up.
 */
const LETTER=/[\p{L}\p{N}]/u;
const STOP=new Set(['fc','cf','afc','sc','fk','club','football','soccer']);
const EXPAND={utd:'united',ath:'athletic',dep:'deportivo',st:'saint'};
export function normalizedName(raw){
 const text=String(typeof raw==='string'?raw:raw?.name??'')
  .normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ');
 return text.trim().split(/\s+/).filter(x=>x&&!STOP.has(x))
  .map(x=>EXPAND[x]||x).join(' ');
}
const day=s=>typeof s==='string'&&/(Z|[+-]\d{2}:\d{2})$/i.test(s)&&Number.isFinite(Date.parse(s));
const text=s=>String(s??'').trim();
const lex=(a,b)=>a<b?-1:a>b?1:0;
function edit(a,b){
 const p=Array.from({length:b.length+1},(_,j)=>j),q=[];
 for(let i=1;i<=a.length;i++){
  q[0]=i;
  for(let j=1;j<=b.length;j++)q[j]=Math.min(q[j-1]+1,p[j]+1,p[j-1]+Number(a[i-1]!==b[j-1]));
  for(let j=0;j<=b.length;j++)p[j]=q[j];
 }
 return p[b.length];
}
export function nameSimilarity(left,right){
 const a=normalizedName(left),b=normalizedName(right);
 if(!a||!b)return 0;
 if(a===b)return 1;
 if(a.replace(/\s/g,'')===b.replace(/\s/g,''))return .99;
 const at=new Set(a.split(' ')),bt=new Set(b.split(' '));
 const overlap=[...at].filter(x=>bt.has(x)).length;
 const jaccard=overlap/(at.size+bt.size-overlap);
 const levenshtein=1-edit(a,b)/Math.max(a.length,b.length);
 return Math.max(0,Math.min(1,Math.max(jaccard,levenshtein)));
}
/** Keep youth/reserve/gender tags to prevent wrong team pairings. */
function ageOrGender(raw){
 const v=normalizedName(raw);
 const age=v.match(/\bu\s?(\d{2})\b/);
 const youth=age?.[1]||null;
 const gender=/\b(women|woman|ladies|female|feminine|wfc)\b/.test(v)?'W':null;
 const reserves=/\b(reserves|reserve|ii|b)\b/.test(v)?'R':null;
 return {youth,gender,reserves};
}
function classConflict(a,b){
 const x=ageOrGender(a),y=ageOrGender(b);
 return Boolean(x.youth!==y.youth||x.gender!==y.gender||x.reserves!==y.reserves);
}
const keys=(source,id)=>text(source)+':'+text(id);
const reject=(reason,more={})=>({reason,...more});
const val=x=>typeof x==='string'?x:x?.name??'';
function approvedAlias(value,dict={}){
 const n=normalizedName(value);
 const exact=Object.entries(dict).find(([key])=>normalizedName(key)===n);
 return exact?normalizedName(exact[1]):n;
}
function nameForMatch(providerName,aliases){
 const n=normalizedName(providerName);
 const remap=Object.entries(aliases||{}).find(([key])=>normalizedName(key)===n);
 return remap?remap[1]:providerName;
}
function verifiedLeague(c,p,approvedLeagues){
 if(!normalizedName(c.league)||!normalizedName(p.league))return false;
 return normalizedName(c.league)===approvedAlias(p.league,approvedLeagues);
}
function evaluate(c,p,options){
 if(!day(c.kickoffUtc)||!day(p.kickoffUtc))return reject('TIME_UNVERIFIED');
 if(!text(c.fixtureId)||!text(p.sourceFixtureId))return reject('MATCH_ID_MISSING');
 if(!verifiedLeague(c,p,options.approvedLeagues))return reject('LEAGUE_UNVERIFIED');
 const delta=Math.abs(Date.parse(c.kickoffUtc)-Date.parse(p.kickoffUtc))/60000;
 if(delta>15)return reject('KICKOFF_OUT_OF_WINDOW',{delta});
 if(options.strictCountry&&c.country&&p.country&&normalizedName(c.country)!==normalizedName(p.country))
  return reject('COUNTRY_MISMATCH');
 const home=nameForMatch(p.home,options.approvedTeamAliases),
   away=nameForMatch(p.away,options.approvedTeamAliases);
 if(classConflict(c.home,home)||classConflict(c.away,away))return reject('TEAM_CLASS_MISMATCH');
 const hs=nameSimilarity(c.home,home),as=nameSimilarity(c.away,away);
 if(hs<.88||as<.88)return reject('TEAM_NAMES_UNCERTAIN',{home:hs,away:as});
 const sc=.43*hs+.43*as+.14*(1-Math.min(delta/15,1)*.25);
 if(sc<.92)return reject('SCORE_BELOW_THRESHOLD',{score:sc});
 return {score:sc,home:hs,away:as,delta,reason:null};
}
/**
 * One-to-one batch mapping, no mutation or storage writes. Repeated names and
 * similar timestamps across fixtures are globally checked in both directions.
 * Review list always includes evidence reason, no quiet auto-guessing.
 */
export function proposeVerifiedMappings(canonicals,providerFixtures,{
 source='goaloo',approvedLeagues={},approvedTeamAliases={},strictCountry=true,
 sourceUtcCertified=false,minLead=.06
}={}){
 const config={approvedLeagues,approvedTeamAliases,strictCountry};
 const review=[],edges=[];
 if(sourceUtcCertified!==true)return {approved:[],review:[reject('SOURCE_UTC_NOT_CERTIFIED')],
   coverage:{canonicals:canonicals.length,providers:providerFixtures.length,
    approved:0,unmapped:canonicals.length},hasProductionWrites:false};
 const countIds=(rows,k)=>{
  const counts=new Map();
  for(const r of rows){const key=text(r?.[k]);if(key)counts.set(key,(counts.get(key)||0)+1)}
  return counts;
 };
 const countedCanonical=countIds(canonicals,'fixtureId'),
  countedProvider=countIds(providerFixtures,'sourceFixtureId');
 const eligibleCanonicals=[],eligibleProviders=[];
 for(const c of canonicals){
  const id=text(c?.fixtureId);
  if(!id||countedCanonical.get(id)!==1){
   review.push(reject('CANONICAL_ID_DUPLICATE_OR_MISSING',{fixtureId:id||null}));continue}
  eligibleCanonicals.push(c);
 }
 for(const p of providerFixtures){
  const id=text(p?.sourceFixtureId);
  if(!id||countedProvider.get(id)!==1){
   review.push(reject('SOURCE_ID_DUPLICATE_OR_MISSING',{sourceId:id||null}));continue}
  eligibleProviders.push(p);
 }
 const byCanonical=new Map(),byProvider=new Map();
 for(const c of eligibleCanonicals)for(const p of eligibleProviders){
  const result=evaluate(c,p,config);
  if(result.reason)continue;
  const e={c,p,...result};
  edges.push(e);
  if(!byCanonical.has(c.fixtureId))byCanonical.set(c.fixtureId,[]);
  if(!byProvider.has(p.sourceFixtureId))byProvider.set(p.sourceFixtureId,[]);
  byCanonical.get(c.fixtureId).push(e);
  byProvider.get(p.sourceFixtureId).push(e);
 }
 const ordered=list=>[...list].sort((a,b)=>b.score-a.score||lex(a.c.fixtureId,b.c.fixtureId)||lex(a.p.sourceFixtureId,b.p.sourceFixtureId));
 const approved=[];
 for(const c of eligibleCanonicals){
  const rows=ordered(byCanonical.get(c.fixtureId)||[]);
  if(!rows.length){review.push(reject('NO_VERIFIED_CANDIDATE',{fixtureId:c.fixtureId}));continue}
  const best=rows[0],runner=rows[1];
  const competing=ordered(byProvider.get(best.p.sourceFixtureId)||[]);
  const runnerReverse=competing[1];
  const unique=competing[0]===best;
  if(!unique||(runner&&best.score-runner.score<minLead)||
     (runnerReverse&&best.score-runnerReverse.score<minLead)){
    review.push(reject('AMBIGUOUS_OR_NONMUTUAL',{fixtureId:c.fixtureId,goalooId:best.p.sourceFixtureId,
     topScore:best.score,secondScore:Math.max(runner?.score||0,runnerReverse?.score||0)}));
    continue;
  }
  approved.push({
   fixtureId:String(c.fixtureId),source,sourceFixtureId:String(best.p.sourceFixtureId),
   home:val(c.home),away:val(c.away),league:val(c.league),
   kickoffUtc:new Date(c.kickoffUtc).toISOString(),sourceKickoffUtc:new Date(best.p.kickoffUtc).toISOString(),
   score:Number(best.score.toFixed(4)),homeScore:Number(best.home.toFixed(4)),
   awayScore:Number(best.away.toFixed(4)),kickoffDeltaMinutes:best.delta,
   evidence:'NAMES_LEAGUE_UTC_MUTUAL_UNIQUE'
  });
 }
 return {approved,review,
  coverage:{canonicals:eligibleCanonicals.length,providers:eligibleProviders.length,
    approved:approved.length,unmapped:eligibleCanonicals.length-approved.length},
  hasProductionWrites:false};
}
