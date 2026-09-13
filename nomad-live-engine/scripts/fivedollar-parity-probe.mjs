import {fetchLiveFixtures} from '../src/fivedollar.js';

const apiKey=process.env.FIVEDOLLAR_API_KEY;
if(!apiKey) throw new Error('FIVEDOLLAR_API_KEY_MISSING');

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const nonNegative=v=>!finite(v)||Number(v)>=0;

const live=await fetchLiveFixtures({apiKey,maxPages:10});
if(live.truncated) throw new Error('MATERIAL: 5USD live pagination truncated');

const ids=new Set();
const rows=[];
let red=0;
for(const f of live.fixtures){
  const reasons=[];
  if(!f.fixtureId) reasons.push('MISSING_FIXTURE_ID');
  if(f.fixtureId&&ids.has(String(f.fixtureId))) reasons.push('DUPLICATE_FIXTURE_ID');
  if(f.fixtureId) ids.add(String(f.fixtureId));
  if(f.boardState!=='live') reasons.push(`NON_LIVE_BOARD_STATE:${f.boardState}`);
  if(f.minute!==null&&(!finite(f.minute)||Number(f.minute)<0)) reasons.push('INVALID_MINUTE');
  for(const side of ['home','away']){
    if(!nonNegative(f?.score?.[side])) reasons.push(`INVALID_SCORE_${side.toUpperCase()}`);
  }
  for(const [name,pair] of Object.entries(f.stats||{})){
    if(pair&&typeof pair==='object'&&('home' in pair||'away' in pair)){
      for(const side of ['home','away']){
        if(!nonNegative(pair?.[side])) reasons.push(`INVALID_${name.toUpperCase()}_${side.toUpperCase()}`);
      }
    }
  }
  if(!Array.isArray(f.events)) reasons.push('EVENTS_NOT_ARRAY');
  if(f?.provenance?.provider!=='5DollarFootballAPI') reasons.push('BAD_PROVENANCE');
  if(f?.provenance?.sourceUpdatedAt!==null) reasons.push('FABRICATED_SOURCE_TIMESTAMP');

  const status=reasons.length?'RED':'GREEN';
  if(reasons.length) red++;
  rows.push({fixtureId:f.fixtureId,home:f.home?.name,away:f.away?.name,minute:f.minute,score:f.score,status,reasons});
}

const out={
  sourceOfTruth:'5DollarFootballAPI',
  legacyComparison:false,
  fixtureCount:live.fixtures.length,
  uniqueFixtureCount:ids.size,
  requests:live.requests,
  providerRate:live.rate,
  red,
  rows,
};

console.log('FIVEDOLLAR_SOURCE_OF_TRUTH_GATE',JSON.stringify(out,null,2));
if(red>0) throw new Error(`MATERIAL: 5USD integrity gate has ${red} RED row(s)`);
