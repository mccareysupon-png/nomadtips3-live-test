import test from 'node:test';
import assert from 'node:assert/strict';
import {PredictionLedger,gradeTotals,settleRecord,summarize} from '../src/index.js';

const payload=(extra={})=>({matchId:'flow-test',home:'Home',away:'Away',minute:35,entryScore:[0,1],eventPass:false,
  capturedAt:Date.now()-1000,
  pickGate:{pass:true,global:{pass:true},oneXtwo:{pass:true},totals:{pass:true},football:{from:30,to:35}},
  prediction:{oneXtwo:{pick:'AWAY'},totals:{pick:'UNDER',line:2.75}},
  market:{oneXtwo:{home:3,draw:3,away:2},totals:{line:2.75,over:2,under:1.8}},...extra});
function setup(){
  const map=new Map();let alarm=null;
  const storage={async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},async list(){return new Map([...map].filter(([k])=>k.startsWith('record:')));},async getAlarm(){return alarm;},async setAlarm(v){alarm=v;},async deleteAlarm(){alarm=null;}};
  return {ledger:new PredictionLedger({storage},{}),storage};
}
const req=p=>new Request('https://test/lock',{method:'POST',headers:{origin:'https://www.nomadtips3.com','content-type':'application/json'},body:JSON.stringify(p)});

test('passing Pick Gate locks without an unrelated event gate or provider fixture ID; retry is immutable',async()=>{
  const {ledger}=setup(),p=payload();
  const first=await (await ledger.lock(req(p))).json();assert.equal(first.locked,true);assert.equal(first.record.lockedAt,p.capturedAt);
  const again=await (await ledger.lock(req({...p,minute:80,entryScore:[4,2]}))).json();
  assert.equal(again.duplicate,true);assert.equal(again.record.minute,35);assert.deepEqual(again.record.entryScore,{home:0,away:1});
  const signals=await (await ledger.signal(new Request('https://test/signal'),new URL('https://test/signal'))).json();
  const stats=await (await ledger.statistics(new Request('https://test/statistics'),new URL('https://test/statistics'))).json();
  assert.equal(signals.records.length,1);assert.equal(stats.rows.length,2);assert.equal(stats.summary.pendingPredictions,2);assert.deepEqual(stats.summary,signals.summary);
});
test('failed gate and missing rolling evidence remain rejected',async()=>{
  const {ledger}=setup();
  for(const pickGate of [null,{pass:true},{...payload().pickGate,football:{from:35,to:35}}])assert.equal((await ledger.lock(req(payload({pickGate})))).status,400);
});
test('quarter line settlement covers both directions and full, half, push boundaries',()=>{
  for(const [line,total,over,under] of [[1.25,1,'HALF_LOSS','HALF_WIN'],[2.75,3,'HALF_WIN','HALF_LOSS'],[4.25,4,'HALF_LOSS','HALF_WIN'],[3,3,'PUSH','PUSH'],[2.75,4,'WIN','LOSS'],[1.25,0,'LOSS','WIN']]){
    assert.equal(gradeTotals('OVER',line,total,0),over);assert.equal(gradeTotals('UNDER',line,total,0),under);
  }
});
test('read projection repairs historical grading, preserves stored evidence, and returns daily ROI',async()=>{
  const {ledger,storage}=setup();const record=(await (await ledger.lock(req(payload()))).json()).record;
  const final=settleRecord(record,{home:1,away:2},'FT',Date.now(),{source:'totalcorner-live-score-v3',sourceMatchId:record.matchId,matchMode:'MATCH_ID'});
  assert.equal(final.settlement.totals.result,'HALF_LOSS');assert.equal(final.settlement.totals.profit,-.5);
  const old=structuredClone(final);delete old.settlement.gradingRevision;old.settlement.totals={result:'LOSS',profit:-1};
  await storage.put('record:'+record.matchId,old);
  const stats=await (await ledger.statistics(new Request('https://test/statistics'),new URL('https://test/statistics'))).json();
  assert.equal(stats.summary.profit,.5);assert.equal(stats.summary.roi,25);assert.equal(stats.summary.winRate,50);assert.equal(stats.daily[0].roi,25);
  assert.equal((await storage.get('record:'+record.matchId)).settlement.totals.profit,-1);
  assert.equal((await ledger.records())[0].settlement.previousGrading.totals.profit,-1);
});
test('half win profit uses half of net decimal odds, pending never dilutes ROI',()=>{
  const record={id:'x',lockedAt:1,prediction:{oneXtwo:{pick:'HOME',odds:2},totals:{pick:'UNDER',line:1.25,odds:1.8}}};
  const settled=settleRecord(record,{home:1,away:0},'FT');assert.equal(settled.settlement.totals.profit,.4);
  const s=summarize([settled,{...record,id:'pending'}]);assert.equal(s.profit,1.4);assert.equal(s.roi,70);assert.equal(s.pendingPredictions,2);
});
test('daily groups follow Bangkok midnight rather than UTC midnight',async()=>{
  const {ledger,storage}=setup();const base=(await (await ledger.lock(req(payload()))).json()).record;
  await storage.put('record:a',{...base,matchId:'a',lockedAt:Date.parse('2026-09-05T16:59:00Z')});
  await storage.put('record:b',{...base,matchId:'b',lockedAt:Date.parse('2026-09-05T17:01:00Z')});
  const data=await (await ledger.statistics(new Request('https://test/statistics'),new URL('https://test/statistics'))).json();
  assert.equal(data.timezone,'Asia/Bangkok');assert.ok(data.daily.some(d=>d.day==='2026-09-05'));assert.ok(data.daily.some(d=>d.day==='2026-09-06'));
});
