import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{gradeOneXtwo,gradeTotals,settleRecord,summarize,parseTotalCornerFinalPayload,matchTotalCornerFinal,settlementNeedsRevision,settlementIsDue} from '../src/index.js';

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
    id:'342:123456',matchId:'123456',fixtureId:'price-fixture-id',lockedAt:1,league:'L',home:'A',away:'B',minute:60,entryScore:{home:0,away:0},
    prediction:{oneXtwo:{pick:'HOME',odds:2},totals:{pick:'OVER',line:3,odds:2}},
  };
  const winPush=settleRecord(base,{home:2,away:1},'FT',2,{source:'totalcorner-live-score-v3',sourceMatchId:'123456',matchMode:'MATCH_ID'});
  const summary=summarize([winPush]);
  assert.equal(summary.wins,1);
  assert.equal(summary.pushes,1);
  assert.equal(summary.losses,0);
  assert.equal(summary.winRate,100);
  assert.equal(winPush.settlement.source,'totalcorner-live-score-v3');
  assert.equal(winPush.settlement.sourceMatchId,'123456');
  assert.equal(winPush.settlementRevision,'totalcorner-final-v1');
});

test('TotalCorner final payload accepts FT scores from V3 final endpoint',()=>{
  const rows=parseTotalCornerFinalPayload({
    ok:true,version:'3.42',component:'totalcorner-live-score-v3',mode:'FINAL_SCORE_FEED',
    finals:[{id:'123456',home:'Home FC',away:'Away FC',status:'FT',score:[2,1],observedAt:1}],
  });
  assert.deepEqual(rows,[{id:'123456',status:'FT',score:{home:2,away:1},home:'Home FC',away:'Away FC',observedAt:1}]);
});

test('TotalCorner settlement matches the exact live-score matchId, not team aliases',()=>{
  const rows=[{id:'123456',status:'FT',score:{home:2,away:1},home:'Completely Different Label',away:'Another Label'}];
  const matched=matchTotalCornerFinal({matchId:'123456',home:'Home FC',away:'Away FC'},rows);
  assert.equal(matched.id,'123456');
  assert.deepEqual(matched.score,{home:2,away:1});
});

test('TotalCorner final matcher waits when the exact matchId is not final yet',()=>{
  const rows=[{id:'999999',status:'FT',score:{home:1,away:0}}];
  assert.equal(matchTotalCornerFinal({matchId:'123456'},rows),null);
});

test('legacy pending record is immediately due once after settlement revision change',()=>{
  const now=1000;
  const legacy={settlement:null,nextSettlementCheckAt:now+3600000};
  assert.equal(settlementNeedsRevision(legacy),true);
  assert.equal(settlementIsDue(legacy,now),true);
});

test('current settlement revision respects its scheduled retry time',()=>{
  const now=1000;
  const future={settlement:null,settlementRevision:'totalcorner-final-v1',nextSettlementCheckAt:now+5000};
  const past={settlement:null,settlementRevision:'totalcorner-final-v1',nextSettlementCheckAt:now-1};
  assert.equal(settlementNeedsRevision(future),false);
  assert.equal(settlementIsDue(future,now),false);
  assert.equal(settlementIsDue(past,now),true);
});

test('settled records never become due for migration or retry',()=>{
  const settled={settlement:{status:'SETTLED'},nextSettlementCheckAt:0};
  assert.equal(settlementNeedsRevision(settled),false);
  assert.equal(settlementIsDue(settled,Date.now()),false);
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
