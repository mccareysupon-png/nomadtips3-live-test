// Pure, provider-independent snapshot builder. Only authoritative finished-match records.
const id=x=>/^\d{1,18}$/.test(String(x??''));
const stamp=x=>typeof x==='number'?(x<1e11?x*1000:x):Date.parse(x||'');
const score=x=>Number.isInteger(x)&&x>=0&&x<=99;
export function verifiedFt(raw) {
 const home=raw?.home??raw?.teams?.home,away=raw?.away??raw?.teams?.away;
 const fixtureId=String(raw?.fixtureId??raw?.id??'');
 const kickoffUtc=raw?.kickoffUtc??raw?.kickoff_utc;
 const goals=raw?.goals??{};
 const status=String(raw?.status??raw?.boardState??'').toLowerCase();
 const code=String(raw?.status_code??'').toLowerCase();
 const t=stamp(kickoffUtc);
 if(!id(fixtureId)||!id(home?.id)||!id(away?.id)||String(home.id)===String(away.id))return null;
 if(!['finished','ft'].includes(status)||(code&&!['full','ft'].includes(code)))return null;
 if(raw?.verified===false||raw?.stale===true)return null;
 if(!score(goals.home)||!score(goals.away)||!Number.isFinite(t)||t<=0||t>Date.now())return null;
 if(!String(home.name||'').trim()||!String(away.name||'').trim())return null;
 return {fixtureId,kickoffUtc:new Date(t).toISOString(),home:{id:String(home.id),name:String(home.name).slice(0,160)},away:{id:String(away.id),name:String(away.name).slice(0,160)},goals:{home:goals.home,away:goals.away},status:'FT'};
}
export function buildLast5Snapshot(selected,storedFt,generatedAt=new Date().toISOString()) {
 if(!Array.isArray(selected)||!Array.isArray(storedFt))throw Error('INVALID_SNAPSHOT_INPUT');
 const seen=new Map();for(const item of storedFt){const x=verifiedFt(item);if(!x)continue;const old=seen.get(x.fixtureId);if(old&&(JSON.stringify(old)!==JSON.stringify(x)))throw Error('CONFLICTING_FINAL_RESULT');seen.set(x.fixtureId,x);}
 const results=Object.create(null);
 for(const fixture of selected){
  const fixtureId=String(fixture?.fixtureId??''),home=String(fixture?.home?.id??''),away=String(fixture?.away?.id??''),cutoff=stamp(fixture?.kickoffUtc);
  if(!id(fixtureId)||!id(home)||!id(away)||home===away||!Number.isFinite(cutoff))continue;
  const side=(teamId)=>[...seen.values()].filter(x=>x.fixtureId!==fixtureId&&Date.parse(x.kickoffUtc)<cutoff&&(x.home.id===teamId||x.away.id===teamId))
   .sort((a,b)=>Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc)).slice(0,5).map(x=>{
    const atHome=x.home.id===teamId,gf=atHome?x.goals.home:x.goals.away,ga=atHome?x.goals.away:x.goals.home;
    return {fixtureId:x.fixtureId,kickoffUtc:x.kickoffUtc,opponent:atHome?x.away:x.home,venue:atHome?'H':'A',gf,ga,result:gf>ga?'W':gf<ga?'L':'D',status:'FT'};
   });
  const h=side(home),a=side(away);
  results[fixtureId]={fixtureId,home:{teamId:home,count:h.length,verified:true,rows:h},away:{teamId:away,count:a.length,verified:true,rows:a}};
 }
 return {schema:'ball46.last5.snapshot.v1',source:'verified-stored-FT',generatedAt,fixtures:results};
}
export function validateSnapshot(s) {
 return s?.schema==='ball46.last5.snapshot.v1'&&s?.source==='verified-stored-FT'&&Number.isFinite(Date.parse(s.generatedAt))&&s.fixtures&&typeof s.fixtures==='object'&&!Array.isArray(s.fixtures);
}
