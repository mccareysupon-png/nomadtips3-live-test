import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countMemberOutcomes} from '../src/member-outcomes.js';

// Exercise the same dailySummary source that production will deploy. No duplicate
// or independently reimplemented percentage formula is used in this test.
const server=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const start=server.indexOf('function dailySummary(rows) {');
const end=server.indexOf('async function sourceJson(',start);
assert(start>=0&&end>start&&end-start<1500,'dailySummary source moved unexpectedly');
const source=server.slice(start,end);
const MARKET_ORDER=['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
const dailySummary=Function('MARKET_ORDER','countMemberOutcomes',source+';return dailySummary;')(MARKET_ORDER,countMemberOutcomes);
const rowsOf=(counts,market='AH')=>
 Object.entries(counts).flatMap(([result,count])=>Array.from({length:count},()=>({result,market,pnl:
  result==='WIN'?2.5:result==='HALF_WIN'?.75:result==='LOSS'?-1:result==='HALF_LOSS'?-.5:0})));
const check=(label,counts,expectedRate,expectedDecided)=>{
 const rows=rowsOf(counts),all=dailySummary(rows).ALL,group=dailySummary(rows).AH;
 assert.equal(all.winRate,expectedRate,label+' ALL');
 assert.equal(group.winRate,expectedRate,label+' AH');
 assert.equal(all.win+all.halfWin+all.loss+all.halfLoss,expectedDecided,label+' decided');
 assert.equal(all.signals,rows.length,label+' total');
};
test('math: 8 WIN + 2 HALF WIN + 4 LOSS + 1 HALF LOSS = 10/15 = 66.7%',()=>check('sample',{WIN:8,HALF_WIN:2,LOSS:4,HALF_LOSS:1},66.7,15));
test('math: full wins only = 100%, and full losses only = 0%',()=>{
 check('all win',{WIN:8},100,8);check('all loss',{LOSS:4},0,4);
});
test('half win counts as winning pick, not half a percentage point',()=>check('one-half-win',{HALF_WIN:1},100,1));
test('half loss counts as losing pick, not an undecided push',()=>check('one-half-loss',{HALF_LOSS:1},0,1));
test('mixed WIN and HALF LOSS counts 1 of 2, 50% not 66.7%',()=>check('mixed',{WIN:1,HALF_LOSS:1},50,2));
test('mixed HALF WIN and LOSS counts 1 of 2 = 50%',()=>check('mixed',{HALF_WIN:1,LOSS:1},50,2));
test('push, void, live, pending, unresolved are excluded from numerator AND denominator',()=>{
 check('excluded',{WIN:1,HALF_WIN:1,LOSS:1,HALF_LOSS:1,PUSH:4,VOID:4,LIVE:4,PENDING:4,UNRESOLVED:4},50,4);
});
test('no graded bets yields no-rate (null), not misleading 0% or 100%',()=>{
 const empty=dailySummary([]);
 assert.equal(empty.ALL.winRate,null);
 check('ungraded',{PUSH:1,VOID:1,PENDING:2,LIVE:2,UNRESOLVED:1},null,0);
});
test('ALL and each market are computed from their own decided bets, not averaged percentages',()=>{
 const rows=[...rowsOf({WIN:8,HALF_WIN:2,LOSS:4,HALF_LOSS:1},'AH'),
  ...rowsOf({WIN:1,LOSS:3},'1X2'),...rowsOf({PUSH:8,PENDING:3},'BTTS')];
 const data=dailySummary(rows);
 assert.equal(data.ALL.winRate,57.9); // 11 wins / 19 decisions
 assert.equal(data.AH.winRate,66.7);
 assert.equal(data['1X2'].winRate,25.0);
 assert.equal(data.BTTS.winRate,null);
});
test('P/L unchanged: odds 3.50 positive net 2.50u, half win +1.25u, half loss -0.50u',()=>{
 const rows=[{result:'WIN',market:'AH',pnl:2.5},
 {result:'HALF_WIN',market:'AH',pnl:1.25},
 {result:'HALF_LOSS',market:'AH',pnl:-.5}];
 const x=dailySummary(rows).ALL;
 assert.equal(x.pnl,3.25);assert.equal(x.winRate,66.7);
 assert.match(server,/if \(r === 'HALF_WIN'\) return o===null \? 0 : \(o-1\)\/2;/);
 assert.match(server,/if \(r === 'HALF_LOSS'\) return -0\.5;/);
});
test('member tab/dashboard both display backend winRate without local recalculation',()=>{
 assert.match(js,/fmtPct\(s\.winRate\)/);
 assert.match(js,/function renderSummary\(/);
 assert.match(js,/function renderTabs\(/);
});
