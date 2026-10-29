import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailySnapshot,validateSummary,londonSportDay} from './snapshot.mjs';
const asOfMs=Date.parse('2026-10-29T12:00:00Z'); // after 06:00 London cutoff
const row=(id,result,status,createdAt,odds=2,market='AH')=>({id,result,status,createdAt,odds,market});
test('October London cutoff at exactly 06:00 after DST ends',()=>{
  assert.equal(londonSportDay(Date.parse('2026-10-29T05:59:59Z')),'2026-10-28');
  assert.equal(londonSportDay(Date.parse('2026-10-29T06:00:00Z')),'2026-10-29');
});
test('July London cutoff follows daylight-saving clock',()=>{
  assert.equal(londonSportDay(Date.parse('2026-07-15T04:59:59Z')),'2026-07-14');
  assert.equal(londonSportDay(Date.parse('2026-07-15T05:00:00Z')),'2026-07-15');
});
test('WIN LOSS PUSH HALF and VOID map to current reference outcomes',()=>{
  const rows=['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','VOID'].map((result,i)=>
    row('r'+i,result,'SETTLED',asOfMs-60000,2.1));
  const s=buildDailySnapshot(rows,{asOfMs});
  assert.deepEqual([s.today.win,s.today.loss,s.today.push,s.today.pending],[2,2,2,0]);
  assert.equal(s.today.winRate,'50%');
  assert.equal(s.today.totalPicks,6);
  assert.equal(validateSummary(s),true);
});
test('pending added to today and its odds included, yesterday only settled',()=>{
  const rows=[
    row('p',null,'PENDING',asOfMs-1000,3.5),
    row('w','WIN','SETTLED',asOfMs-3000,2.5),
    row('oldp',null,'PENDING','2026-10-28T12:00:00Z',9),
    row('oldw','WIN','SETTLED','2026-10-28T12:00:00Z',2.25)
  ];
  const s=buildDailySnapshot(rows,{asOfMs});
  assert.equal(s.today.pending,1);
  assert.equal(s.today.avgOdds,'3.00');
  assert.equal(s.yesterday.pending,0);
  assert.equal(s.yesterday.avgOdds,'2.25');
});
test('rate excludes PUSH and PENDING; correct precision',()=>{
  const rows=[...Array.from({length:2},(_,i)=>row('w'+i,'WIN','SETTLED',asOfMs-1)),
              row('l','LOSS','SETTLED',asOfMs-1),
              row('p','PUSH','SETTLED',asOfMs-1),
              row('pending',null,'PENDING',asOfMs-1)];
  const s=buildDailySnapshot(rows,{asOfMs});
  assert.equal(s.today.winRate,'66.7%');
  assert.equal(s.today.totalPicks,5);
});
test('duplicate stable IDs are deduplicated globally and missing dates ignored',()=>{
  const t='2026-10-29T11:00:00Z';
  const s=buildDailySnapshot([
    row('A','WIN','SETTLED',t),
    row('A','LOSS','SETTLED',t),
    row('B','WIN','SETTLED',undefined),
    row('C','WIN','SETTLED','2026-10-01T12:00:00Z')
  ],{asOfMs});
  assert.equal(s.today.win,1);
  assert.equal(s.today.loss,0);
  assert.equal(s.diagnostics.duplicates,1);
  assert.equal(s.diagnostics.ignoredMissingTime,1);
});
test('settled market families and odds validity',()=>{
  const s=buildDailySnapshot([
    row('a','WIN','SETTLED',asOfMs-1,1.6,'asian_handicap'),
    row('b','LOSS','SETTLED',asOfMs-1,2.2,'over_under'),
    row('c','PUSH','SETTLED',asOfMs-1,1,'1x2'),
    row('d','WIN','SETTLED',asOfMs-1,null,'total_corners')
  ],{asOfMs});
  assert.equal(s.today.markets.AH.win,1);
  assert.equal(s.today.markets['O/U'].loss,1);
  assert.equal(s.today.markets['O/U'].win,1);
  assert.equal(s.today.markets['1X2'].push,1);
  assert.equal(s.today.oddsCount,2);
  assert.equal(s.today.avgOdds,'1.90');
});
test('rejects non-production London rules and incomplete inputs',()=>{
  assert.throws(()=>buildDailySnapshot(null,{asOfMs}),/ROWS_NOT_ARRAY/);
  assert.throws(()=>buildDailySnapshot([],{asOfMs,cut:8}),/DAY_RULE_DRIFT/);
});
