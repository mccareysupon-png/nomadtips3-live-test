import assert from 'node:assert/strict';
import test from 'node:test';
import {FIVEUSD_REFEREES} from '../src/fivedollar.js';
import {appendFiveUsdRefereeFlow,summarizeFiveUsdRefereeFlow} from '../src/fivedollar-referee-flow.js';

function snapshot({line=0.25,home=1.91,away=1.97,observedAt=1000,status='AH READY'}={}){
  return {
    fixtureId:'fixture-1',
    observedAt,
    referees:FIVEUSD_REFEREES.map((definition,index)=>({
      sourceId:definition.sourceId,
      position:definition.position,
      bookmaker:definition.bookmaker,
      status:index===9?'AH UNAVAILABLE':status,
      line:index===9?null:line,
      awayLine:index===9?null:-line,
      homeOdds:index===9?null:home,
      awayOdds:index===9?null:away,
      observedAt,
      lastSeenAt:observedAt,
      lastChangedAt:index===9?null:observedAt,
      priceFingerprint:index===9?null:`${line}|${home}|${away}`,
      sourceUpdatedAt:null,
    })),
  };
}

test('10-book AH flow keeps every configured referee in fixed socket order',()=>{
  const flow=appendFiveUsdRefereeFlow(null,snapshot(),1000);
  assert.equal(flow.rows.length,10);
  assert.deepEqual(flow.rows.map(row=>row.sourceId),FIVEUSD_REFEREES.map(row=>row.sourceId));
  assert.equal(flow.rows[0].history.length,1);
  assert.equal(flow.rows[9].history.length,0);
  assert.equal(flow.rows[9].current.ready,false);
});

test('unchanged bookmaker quote never bloats price-flow history',()=>{
  const first=appendFiveUsdRefereeFlow(null,snapshot(),1000);
  const second=appendFiveUsdRefereeFlow(first,snapshot({observedAt:4000}),4000);
  assert.equal(second.rows[0].history.length,1);
  assert.equal(second.rows[0].changes,0);
  assert.equal(second.rows[0].current.observedAt,4000);
});

test('line or price change appends exactly one real flow event',()=>{
  const first=appendFiveUsdRefereeFlow(null,snapshot(),1000);
  const second=appendFiveUsdRefereeFlow(first,snapshot({line:0.5,home:1.86,away:2.02,observedAt:7000}),7000);
  assert.equal(second.rows[0].history.length,2);
  assert.equal(second.rows[0].changes,1);
  assert.equal(second.rows[0].history.at(-1).homeAhLine,0.5);
  assert.equal(second.rows[0].history.at(-1).homeOdds,1.86);
});

test('unavailable quote updates current status but never invents a price event',()=>{
  const first=appendFiveUsdRefereeFlow(null,snapshot(),1000);
  const unavailable={...snapshot({observedAt:9000}),referees:snapshot({observedAt:9000}).referees.map((row,index)=>index===0?{...row,status:'AH UNAVAILABLE',line:null,awayLine:null,homeOdds:null,awayOdds:null,priceFingerprint:null,lastChangedAt:null}:row)};
  const second=appendFiveUsdRefereeFlow(first,unavailable,9000);
  assert.equal(second.rows[0].current.ready,false);
  assert.equal(second.rows[0].history.length,1);
});

test('price-flow summary exposes panel/ready/history/change counts without signal authority',()=>{
  const first=appendFiveUsdRefereeFlow(null,snapshot(),1000);
  const second=appendFiveUsdRefereeFlow(first,snapshot({home:1.88,away:2.01,observedAt:5000}),5000);
  const summary=summarizeFiveUsdRefereeFlow(second);
  assert.equal(summary.bookmakerPanel,10);
  assert.equal(summary.ready,9);
  assert.equal(summary.withHistory,9);
  assert.equal(summary.changes,9);
  assert.equal(second.presentationOnly,true);
  assert.equal('signalAuthority' in second,false);
});
