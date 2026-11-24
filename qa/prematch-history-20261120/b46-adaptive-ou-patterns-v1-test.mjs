// BALL46 ADAPTIVE O/U RESEARCH V1 — exactly 42 fixed 2.5 historical formulas.
// No bookmaker price considered here: this produces hypothesis observations only.
// ALL teams are examined independently, with real chronological FT and fixture dedup.
import {ouTargetLastMatches} from './ou-target-history-ft-v1-test.mjs';
export const ADAPTIVE_OU_ID='B46_ADAPTIVE_OU_RESEARCH_V1';
export const FORMULAS=Object.freeze([
 ...Array.from({length:9},(_,i)=>'A'+String(i+2).padStart(2,'0')),
 ...Array.from({length:9},(_,i)=>'B'+String(i+2).padStart(2,'0')),
 ...Array.from({length:8},(_,i)=>'C'+String(i+3).padStart(2,'0')),
 ...Array.from({length:8},(_,i)=>'D'+String(i+3).padStart(2,'0')),
 ...Array.from({length:8},(_,i)=>'E'+String(i+3).padStart(2,'0'))
]);
if(FORMULAS.length!==42||new Set(FORMULAS).size!==42)throw Error('ADAPTIVE_FORMULA_REGISTRY_NOT_42');
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const rev=x=>x==='OVER'?'UNDER':'OVER';
export function normalizedHistory(history,kickoff,now){
 if(!Array.isArray(history))return [];
 const rows=history.filter(r=>id(r.fixtureId)&&Number.isSafeInteger(r.kickoff)&&
  r.kickoff<kickoff&&r.kickoff<now&&Number.isSafeInteger(r.gf)&&r.gf>=0&&
  Number.isSafeInteger(r.ga)&&r.ga>=0).sort((a,b)=>b.kickoff-a.kickoff||Number(b.fixtureId)-Number(a.fixtureId));
 const seen=new Set();
 return rows.filter(r=>{
  const k=String(r.fixtureId);if(seen.has(k))return false;seen.add(k);return true
 }).slice(0,10).map(r=>({fixtureId:Number(r.fixtureId),kickoff:r.kickoff,
  gf:r.gf,ga:r.ga,total:r.gf+r.ga,form:r.gf+r.ga>=3?'OVER':'UNDER'}));
}
export function evaluateAdaptiveFormulas(history){
 const out=[],matches=Array.isArray(history)?history:[];
 for(const formula of FORMULAS){
  const n=Number(formula.slice(1)),family=formula[0];
  if(matches.length<n)continue;
  const seq=matches.slice(0,n).map(r=>r.form);
  if(seq.some(x=>x!=='OVER'&&x!=='UNDER'))continue;
  let pick=null;
  if(family==='A'||family==='B'){
   if(seq.every(x=>x===seq[0]))pick=family==='A'?rev(seq[0]):seq[0];
  }else if(family==='C'||family==='D'){
   const over=seq.filter(x=>x==='OVER').length,under=n-over;
   if(over!==under){
    const majority=over>under?'OVER':'UNDER';
    pick=family==='C'?rev(majority):majority;
   }
  }else if(family==='E'){
   if(seq.every((x,i)=>i===0||x!==seq[i-1]))pick=rev(seq[0]);
  }
  if(pick)out.push({formula,market:'O/U 2.5',selection:pick,historyUsed:n,
   observed:matches.slice(0,n).map(r=>({
    fixtureId:r.fixtureId,at:r.kickoff,ft:r.gf+'-'+r.ga,goals:r.total,form:r.form
   }))});
 }
 return out;
}
export function screenAdaptiveResearch(db,fixtures,now){
 if(!db||!Array.isArray(fixtures)||!Number.isSafeInteger(now))throw Error('ADAPTIVE_INVALID_INPUT');
 const seen=new Set(),items=new Map();
 const formulaCounts=Object.fromEntries(FORMULAS.map(f=>[f,{fixtureCount:0,
  rawMatches:0,homeTriggers:0,awayTriggers:0,overFixtures:0,underFixtures:0,
  pricedFixtures:0,issued:0}]));
 const counts={rawRows:fixtures.length,validUpcoming:0,
  historyEligibleFixtures:0,formulasTriggered:0,uniqueFixturesWithPatterns:0,
  overPatternFixtures:0,underPatternFixtures:0,conflictingDirectionFixtures:0,
  priceRequests:0,providerCalls:0};
 for(const f of fixtures){
  const fid=Number(f?.id),hid=Number(f?.teams?.home?.id),aid=Number(f?.teams?.away?.id),ko=f?.kickoff_ts;
  if(!id(fid)||!id(hid)||!id(aid)||hid===aid||seen.has(fid)||
   f?.status!=='scheduled'||!Number.isSafeInteger(ko)||ko<=now+300||ko>now+14*86400)continue;
  seen.add(fid);counts.validUpcoming++;
  const home=normalizedHistory(ouTargetLastMatches(db,hid,ko,now,10),ko,now);
  const away=normalizedHistory(ouTargetLastMatches(db,aid,ko,now,10),ko,now);
  if(home.length>=2||away.length>=2)counts.historyEligibleFixtures++;
  for(const [team,history] of [['HOME',home],['AWAY',away]]){
   for(const m of evaluateAdaptiveFormulas(history)){
    const key=[fid,m.formula,m.market,m.selection].join('/');
    let entry=items.get(key);
    if(!entry){entry={fixtureId:fid,homeId:hid,awayId:aid,
     home:String(f.teams.home.name??hid).slice(0,160),
     away:String(f.teams.away.name??aid).slice(0,160),
     kickoff:ko,formula:m.formula,market:m.market,selection:m.selection,
     historyUsed:m.historyUsed,availableHistory:{home:home.length,away:away.length},
     supportingTeams:[],historyEvidence:[]};items.set(key,entry)}
    entry.supportingTeams.push(team);
    entry.historyEvidence.push({team,historyUsed:m.historyUsed,rows:m.observed});
   }
  }
 }
 const candidates=[...items.values()].sort((a,b)=>a.kickoff-b.kickoff||
  a.fixtureId-b.fixtureId||a.formula.localeCompare(b.formula)||a.selection.localeCompare(b.selection));
 const fixtureFormula=new Map(),directions=new Map();
 for(const c of candidates){
  const fc=formulaCounts[c.formula],fk=c.formula+'/'+c.fixtureId;
  fc.rawMatches++;fc.homeTriggers+=Number(c.supportingTeams.includes('HOME'));
  fc.awayTriggers+=Number(c.supportingTeams.includes('AWAY'));
  if(!fixtureFormula.has(fk)){
   fixtureFormula.set(fk,true);fc.fixtureCount++;
  }
  if(c.selection==='OVER')fc.overFixtures++;else fc.underFixtures++;
  if(!directions.has(c.fixtureId))directions.set(c.fixtureId,new Set());
  directions.get(c.fixtureId).add(c.selection);
 }
 for(const directionsAt of directions.values()){
  counts.uniqueFixturesWithPatterns++;
  counts.overPatternFixtures+=Number(directionsAt.has('OVER'));
  counts.underPatternFixtures+=Number(directionsAt.has('UNDER'));
  counts.conflictingDirectionFixtures+=Number(directionsAt.size===2);
 }
 counts.formulasTriggered=candidates.length;
 for(const c of candidates){
  c.supportCount=candidates.filter(x=>x.fixtureId===c.fixtureId&&x.selection===c.selection).length;
  c.hasContradictoryResearch=candidates.some(x=>x.fixtureId===c.fixtureId&&x.selection!==c.selection);
 }
 return {id:ADAPTIVE_OU_ID,when:new Date(now*1000).toISOString(),counts,formulaCounts,candidates};
}
