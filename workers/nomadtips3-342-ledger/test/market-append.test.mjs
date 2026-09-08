import test from 'node:test';
import assert from 'node:assert/strict';
import {PredictionLedger} from '../src/index.js';

function setup(){
  const map=new Map();let alarm=null;
  const storage={async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},async list(){return new Map([...map].filter(([k])=>k.startsWith('record:')));},async getAlarm(){return alarm;},async setAlarm(v){alarm=v;},async deleteAlarm(){alarm=null;}};
  return {ledger:new PredictionLedger({storage},{}),storage};
}
const req=p=>new Request('https://test/lock',{method:'POST',headers:{origin:'https://www.nomadtips3.com','content-type':'application/json'},body:JSON.stringify(p)});
const ev={shotOnTarget:2,shotOff:2,corner:2,dangerousAttackPct:60,attackPct:60,possessionPct:60};
const baseCfg={oddsMin:1.01,minuteFrom:1,minuteTo:120,rollingWindowMinutes:5,evidenceRequired:1,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50};
const oneSignal=()=>({market:'1X2',pick:'HOME',odds:1.8,probability:60,home:60,away:30,settings:{...baseCfg,sideMode:'BOTH',scoreTrailingMax:2},gate:{pass:true,evidence:{values:ev}}});
const ahSignal=()=>({market:'AH',pick:'AWAY',line:1.5,rawLine:1.5,odds:2.4,homeOdds:1.5,awayOdds:2.4,rawHomeHk:0.5,rawAwayHk:1.4,bookmaker:'Bet365',provider:'Nowgoal',settings:{...baseCfg,sideMode:'BOTH',lineMin:-10},gate:{pass:true,evidence:{sides:{AWAY:{values:ev}}}}});
const payload=({capturedAt,minute,entryScore,signals})=>({schemaVersion:3,capturedAt,matchId:'append-342',fixtureId:'123',league:'Test',home:'Home',away:'Away',minute,entryScore,settingsVersion:'market-settings-v3',signals,market:{provider:'Nowgoal',observedAt:capturedAt,fixture:{id:'123'},oneXtwo:{home:1.8,draw:3.2,away:4.1},asianHandicap:{line:1.5,selectedLine:1.5,homeOdds:1.5,awayOdds:2.4,rawHomeHk:0.5,rawAwayHk:1.4,bookmaker:'Bet365',linePerspective:'HOME'},statistics:{}}});

test('same match appends a new market and preserves per-market lock minute/score',async()=>{
  const {ledger}=setup(),t1=Date.now()-120000,t2=t1+60000;
  const first=await (await ledger.lock(req(payload({capturedAt:t1,minute:60,entryScore:[1,0],signals:[oneSignal()]})))).json();
  assert.equal(first.appended,false);assert.equal(first.record.signals.length,1);assert.equal(first.record.signals[0].lockMinute,60);
  const second=await (await ledger.lock(req(payload({capturedAt:t2,minute:70,entryScore:[1,1],signals:[ahSignal()]})))).json();
  assert.equal(second.appended,true);assert.deepEqual(second.newMarkets,['AH']);assert.equal(second.record.signals.length,2);
  const ah=second.record.signals.find(s=>s.market==='AH');assert.equal(ah.lockMinute,70);assert.deepEqual(ah.entryScore,{home:1,away:1});assert.equal(ah.odds,2.4);assert.equal(ah.line,1.5);
  const stats=await (await ledger.statistics(new Request('https://test/statistics'),new URL('https://test/statistics'))).json();
  assert.equal(stats.summary.totalPredictions,2);
  const oneRow=stats.rows.find(r=>r.market==='1X2'),ahRow=stats.rows.find(r=>r.market.startsWith('Asian Handicap'));
  assert.equal(oneRow.minute,60);assert.deepEqual(oneRow.entryScore,{home:1,away:0});
  assert.equal(ahRow.minute,70);assert.deepEqual(ahRow.entryScore,{home:1,away:1});
  const third=await (await ledger.lock(req(payload({capturedAt:t2+1000,minute:71,entryScore:[1,1],signals:[ahSignal()]})))).json();
  assert.equal(third.duplicate,true);assert.equal(third.record.signals.length,2);
});

test('AH lock rejects swapped price ownership or wrong selected-side line perspective',async()=>{
  const {ledger}=setup(),base=payload({capturedAt:Date.now()-1000,minute:70,entryScore:[1,1],signals:[ahSignal()]});
  const badOdds=structuredClone(base);badOdds.signals[0].odds=1.5;assert.equal((await ledger.lock(req(badOdds))).status,400);
  const badLine=structuredClone(base);badLine.signals[0].line=-1.5;assert.equal((await ledger.lock(req(badLine))).status,400);
});
