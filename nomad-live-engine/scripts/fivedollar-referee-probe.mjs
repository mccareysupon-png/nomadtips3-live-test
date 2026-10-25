import {FIVEUSD_REFEREES,fetchLiveFixtures,fetchRefereeSnapshot} from '../src/fivedollar.js';

const apiKey=process.env.FIVEDOLLAR_API_KEY;
if(!apiKey) throw new Error('FIVEDOLLAR_API_KEY_MISSING');

const quarter=v=>Number.isFinite(Number(v))&&Math.abs(Number(v)*4-Math.round(Number(v)*4))<1e-9;
const live=await fetchLiveFixtures({apiKey,maxPages:1});
if(live.truncated) throw new Error('MATERIAL: live fixture page truncated');
if(!live.fixtures.length) {
  console.log('FIVEDOLLAR_REFEREE_GATE',JSON.stringify({status:'NO_LIVE_FIXTURES',liveRequests:live.requests,rate:live.rate},null,2));
  process.exit(0);
}

let selected=null;
const attempts=[];
for(const fixture of live.fixtures.slice(0,3)){
  const snap=await fetchRefereeSnapshot({fixtureId:fixture.fixtureId,apiKey});
  attempts.push({fixtureId:fixture.fixtureId,readyCount:snap.readyCount,rate:snap.rate});
  selected={fixture,snap};
  if(snap.readyCount>0) break;
}

const {fixture,snap}=selected;
const expected=FIVEUSD_REFEREES.map(x=>x.sourceId);
const actual=snap.referees.map(x=>x.sourceId);
const red=[];
if(actual.length!==10) red.push(`REFEREE_COUNT_${actual.length}`);
if(new Set(actual).size!==actual.length) red.push('DUPLICATE_SOURCE_ID');
for(const id of expected) if(!actual.includes(id)) red.push(`MISSING_${id}`);

for(const r of snap.referees){
  if(r.source!=='5DollarFootballAPI') red.push(`${r.sourceId}:BAD_SOURCE`);
  if(r.sourceUpdatedAt!==null) red.push(`${r.sourceId}:FABRICATED_SOURCE_TIMESTAMP`);
  if(r.shadowOnly!==true) red.push(`${r.sourceId}:NOT_SHADOW_ONLY`);
  if(r.voteEligible!==false) red.push(`${r.sourceId}:VOTE_ENABLED`);
  if(r.status==='AH READY'){
    if(!quarter(r.line)) red.push(`${r.sourceId}:BAD_LINE`);
    if(!(Number(r.homeOdds)>1)) red.push(`${r.sourceId}:BAD_HOME_ODDS`);
    if(!(Number(r.awayOdds)>1)) red.push(`${r.sourceId}:BAD_AWAY_ODDS`);
  }else{
    if(r.line!==null||r.homeOdds!==null||r.awayOdds!==null) red.push(`${r.sourceId}:FAIL_OPEN_NONREADY`);
  }
}

if(snap.readyCount===0) red.push('NO_AH_READY_AFTER_UP_TO_3_FIXTURES');

const out={
  fixtureId:fixture.fixtureId,
  home:fixture.home?.name,
  away:fixture.away?.name,
  readyCount:snap.readyCount,
  refereeCount:snap.referees.length,
  attempts,
  red,
  referees:snap.referees.map(r=>({sourceId:r.sourceId,position:r.position,bookmaker:r.bookmaker,status:r.status,line:r.line,homeOdds:r.homeOdds,awayOdds:r.awayOdds,bookmakerVerified:r.bookmakerVerified,shadowOnly:r.shadowOnly,voteEligible:r.voteEligible,sourceUpdatedAt:r.sourceUpdatedAt})),
};
console.log('FIVEDOLLAR_REFEREE_GATE',JSON.stringify(out,null,2));
if(red.length) throw new Error(`MATERIAL: referee gate ${red.join(',')}`);
