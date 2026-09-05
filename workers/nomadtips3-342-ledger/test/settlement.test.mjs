import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{gradeOneXtwo,gradeTotals,settleRecord,summarize,parseGoalooIndex,matchGoalooRecord} from '../src/index.js';

test('1X2 settlement follows full-time result',()=>{
  assert.equal(gradeOneXtwo('HOME',2,1),'WIN');
  assert.equal(gradeOneXtwo('DRAW',1,1),'WIN');
  assert.equal(gradeOneXtwo('AWAY',2,1),'LOSS');
});

test('O/U integer line can PUSH',()=>{
  assert.equal(gradeTotals('OVER',3,2,1),'PUSH');
  assert.equal(gradeTotals('UNDER',3,2,1),'PUSH');
  assert.equal(gradeTotals('OVER',2.5,2,1),'WIN');
  assert.equal(gradeTotals('UNDER',2.5,2,1),'LOSS');
});

test('summary excludes PUSH from win-rate denominator',()=>{
  const base={
    id:'342:1',matchId:'1',fixtureId:'legacy-market-id',lockedAt:1,league:'L',home:'A',away:'B',minute:60,entryScore:{home:0,away:0},
    prediction:{oneXtwo:{pick:'HOME',odds:2},totals:{pick:'OVER',line:3,odds:2}},
  };
  const winPush=settleRecord(base,{home:2,away:1},'FT',2,{source:'goaloo-bf_us-direct-index',sourceMatchId:'9001',matchMode:'EXACT_TEAMS'});
  const summary=summarize([winPush]);
  assert.equal(summary.wins,1);
  assert.equal(summary.pushes,1);
  assert.equal(summary.losses,0);
  assert.equal(summary.winRate,100);
  assert.equal(winPush.settlement.source,'goaloo-bf_us-direct-index');
  assert.equal(winPush.settlement.sourceMatchId,'9001');
});

test('Goaloo direct index parser reads terminal score and match id',()=>{
  const src="A[0]=[9001,7,'x','x','Alpha FC','Beta United','2026-09-05 03:00','',-1,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.5];";
  const rows=parseGoalooIndex(src);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0],{id:'9001',home:'Alpha FC',away:'Beta United',state:-1,score:{home:2,away:1}});
});

test('Goaloo settlement matching ignores legacy market fixtureId and uses teams',()=>{
  const rows=[{id:'9001',home:'Alpha FC',away:'Beta United',state:-1,score:{home:2,away:1}}];
  const matched=matchGoalooRecord({fixtureId:'123456',home:'Alpha FC',away:'Beta United'},rows);
  assert.equal(matched.row.id,'9001');
  assert.equal(matched.mode,'EXACT_TEAMS');
});

test('Goaloo normalized team matching is conservative and unique',()=>{
  const rows=[{id:'9001',home:'Alpha FC',away:'Beta SC',state:-1,score:{home:1,away:0}}];
  const matched=matchGoalooRecord({home:'Alpha',away:'Beta'},rows);
  assert.equal(matched.row.id,'9001');
  assert.equal(matched.mode,'NORMALIZED_TEAMS');
});

test('scheduled fallback wakes primary ledger settlement',async()=>{
  let requestedName=null,requestedId=null,requestedRequest=null,waited=null;
  const env={LEDGER:{
    idFromName(name){requestedName=name;return 'primary-id';},
    get(id){requestedId=id;return {async fetch(request){requestedRequest=request;return new Response('{}',{status:200});}};},
  }};
  const ctx={waitUntil(promise){waited=promise;}};
  await worker.scheduled({},env,ctx);
  assert.equal(requestedName,'primary');
  assert.equal(requestedId,'primary-id');
  assert.ok(waited instanceof Promise);
  await waited;
  assert.equal(requestedRequest.method,'POST');
  assert.equal(new URL(requestedRequest.url).pathname,'/__scheduled_settlement');
});
