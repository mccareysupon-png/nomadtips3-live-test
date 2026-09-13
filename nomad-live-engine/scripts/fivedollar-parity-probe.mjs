import {fetchLiveFixtures} from '../src/fivedollar.js';
import {buildFixtureIdentityBridge} from '../src/fivedollar-identity.js';

const legacyUrl=process.env.LEGACY_FEED_URL||'https://nomadtips3-live-engine.mccarey-supon.workers.dev/feed';
const apiKey=process.env.FIVEDOLLAR_API_KEY;
if(!apiKey) throw new Error('FIVEDOLLAR_API_KEY_MISSING');

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>finite(v)?Number(v):null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pair=v=>({home:num(v?.home),away:num(v?.away)});
const pairDelta=(a,b)=>({home:finite(a?.home)&&finite(b?.home)?Number(b.home)-Number(a.home):null,away:finite(a?.away)&&finite(b?.away)?Number(b.away)-Number(a.away):null});

async function getLegacy(){
  const r=await fetch(legacyUrl,{headers:{accept:'application/json','cache-control':'no-cache'}});
  if(!r.ok) throw new Error(`LEGACY_FEED_HTTP_${r.status}`);
  return r.json();
}

// /feed wakes a stale legacy cycle asynchronously. Read twice so parity does not compare
// 5USD against an unnecessarily old 3.41 snapshot.
const first=await getLegacy();
await sleep(4000);
const second=await getLegacy();
const firstAt=Date.parse(first?.updatedAt||'')||0;
const secondAt=Date.parse(second?.updatedAt||'')||0;
const feed=secondAt>=firstAt?second:first;
const legacy=Array.isArray(feed?.matches)?feed.matches:[];

const five=await fetchLiveFixtures({apiKey,maxPages:1});
if(five.truncated) throw new Error('MATERIAL: 5USD live page truncated during parity gate');
const bridge=buildFixtureIdentityBridge(legacy,five.fixtures);
const byFiveId=new Map(five.fixtures.map(f=>[String(f.fixtureId),f]));

const rows=[];
let hardRed=0,yellow=0,green=0;
for(const map of bridge.rows){
  const old=legacy.find(m=>String(m.id)===String(map.legacyMatchId));
  if(map.status!=='MATCHED'||!old){
    rows.push({legacyMatchId:map.legacyMatchId,status:'RED',reason:map.status});hardRed++;continue;
  }
  const fresh=byFiveId.get(String(map.fiveUsdFixtureId));
  if(!fresh){rows.push({legacyMatchId:map.legacyMatchId,status:'RED',reason:'FIVEUSD_FIXTURE_MISSING'});hardRed++;continue;}

  const scoreOld=pair(old.score),scoreNew=pair(fresh.score);
  const scoreRegressed=(finite(scoreOld.home)&&finite(scoreNew.home)&&scoreNew.home<scoreOld.home)||(finite(scoreOld.away)&&finite(scoreNew.away)&&scoreNew.away<scoreOld.away);
  const scoreDifferent=finite(scoreOld.home)&&finite(scoreOld.away)&&finite(scoreNew.home)&&finite(scoreNew.away)&&(scoreOld.home!==scoreNew.home||scoreOld.away!==scoreNew.away);
  const minuteOld=num(old.minute),minuteNew=num(fresh.minute),minuteDrift=minuteOld!==null&&minuteNew!==null?minuteNew-minuteOld:null;
  const minuteRegressed=minuteDrift!==null&&minuteDrift<-2;

  const metricRules={
    attacks:12,
    dangerousAttack:12,
    shotsOn:1,
    shotsOff:1,
    corners:1,
    possession:8,
  };
  const metrics={};
  let missingRequired=false,materialRegression=false,softDrift=false;
  for(const [key,limit] of Object.entries(metricRules)){
    const a=pair(old?.stats?.[key]);
    const b=pair(fresh?.stats?.[key]);
    const d=pairDelta(a,b);
    if((finite(a.home)&&!finite(b.home))||(finite(a.away)&&!finite(b.away))) missingRequired=true;
    if(key!=='possession'){
      if(d.home!==null&&d.home<-limit) materialRegression=true;
      if(d.away!==null&&d.away<-limit) materialRegression=true;
    }else{
      if(d.home!==null&&Math.abs(d.home)>limit) softDrift=true;
      if(d.away!==null&&Math.abs(d.away)>limit) softDrift=true;
    }
    if(key==='shotsOn'||key==='shotsOff'||key==='corners'){
      if(d.home!==null&&Math.abs(d.home)>1) softDrift=true;
      if(d.away!==null&&Math.abs(d.away)>1) softDrift=true;
    }
    metrics[key]={legacy:a,fiveUsd:b,delta:d};
  }

  let status='GREEN',reason='PARITY_OK';
  if(scoreRegressed||minuteRegressed||missingRequired||materialRegression){status='RED';reason='MATERIAL_REGRESSION';hardRed++;}
  else if(scoreDifferent||(minuteDrift!==null&&Math.abs(minuteDrift)>2)||softDrift){status='YELLOW';reason='FRESHNESS_OR_PROVIDER_DRIFT';yellow++;}
  else green++;

  rows.push({legacyMatchId:String(old.id),fiveUsdFixtureId:String(fresh.fixtureId),home:old.home,away:old.away,status,reason,legacyMinute:minuteOld,fiveUsdMinute:minuteNew,minuteDrift,legacyScore:scoreOld,fiveUsdScore:scoreNew,metrics});
}

const out={
  legacyUpdatedAt:feed?.updatedAt??null,
  legacyCount:legacy.length,
  fiveUsdCount:five.fixtures.length,
  bridge:bridge.summary,
  providerRate:five.rate,
  parity:{green,yellow,red:hardRed},
  rows,
};
console.log('PARITY_GATE',JSON.stringify(out,null,2));
if(bridge.summary.ambiguous>0||bridge.summary.unmatched>0) throw new Error('MATERIAL: identity bridge not clean');
if(hardRed>0) throw new Error(`MATERIAL: parity has ${hardRed} RED row(s)`);
