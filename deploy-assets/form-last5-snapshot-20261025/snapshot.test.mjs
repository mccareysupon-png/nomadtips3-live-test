import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedFt,buildLast5Snapshot,validateSnapshot} from './snapshot-core.mjs';
const game=(id,day,h,a,hg,ag,extra={})=>({fixtureId:String(id),kickoffUtc:new Date('2026-10-'+String(day).padStart(2,'0')+'T10:00:00Z').toISOString(),status:'finished',home:{id:String(h),name:'Team '+h},away:{id:String(a),name:'Team '+a},goals:{home:hg,away:ag},...extra});
const board=[{fixtureId:'100',kickoffUtc:'2026-10-25T10:00:00Z',home:{id:'1'},away:{id:'2'}}];
test('correct home/away perspective, strict kickoff cutoff and cap 5',()=>{
 const games=[game(1,24,1,3,2,0),game(2,23,4,1,1,1),game(3,22,2,5,0,2),game(4,21,5,2,1,1),game(5,20,1,2,3,2),game(6,19,1,6,4,0),game(7,18,1,7,0,1)];
 const s=buildLast5Snapshot(board,games);assert.equal(validateSnapshot(s),true);
 assert.deepEqual(s.fixtures['100'].home.rows.map(x=>x.result),['W','D','W','W','L']);
 assert.deepEqual(s.fixtures['100'].away.rows.map(x=>x.result),['L','D','L']);
 assert.equal(s.fixtures['100'].home.rows[0].opponent.name,'Team 3');
});
test('filter unfinished, unverified, future, invalid, and selected fixture',()=>{
 const games=[game(100,24,1,2,1,0),game(11,26,1,2,2,0),game(12,24,1,2,1,1,{status:'live'}),game(13,23,1,2,2,1,{verified:false}),game(14,22,1,2,null,0),game(15,20,1,2,0,0)];
 const s=buildLast5Snapshot(board,games);assert.equal(s.fixtures['100'].home.count,1);assert.equal(s.fixtures['100'].away.rows[0].result,'D');
});
test('conflicting FT evidence fails closed',()=>{
 assert.throws(()=>buildLast5Snapshot(board,[game(9,20,1,2,1,0),game(9,20,1,2,2,0)]),/CONFLICTING_FINAL_RESULT/);
});
test('unix seconds are interpreted as UTC milliseconds',()=>{
 const x=game(8,19,1,3,1,0);x.kickoffUtc=1792404000;
 assert.equal(verifiedFt(x)?.kickoffUtc,'2026-10-19T10:00:00.000Z');
});
test('empty verified history stays empty, no fabricated rows',()=>{
 const s=buildLast5Snapshot(board,[]);assert.equal(s.fixtures['100'].home.count,0);assert.equal(s.fixtures['100'].away.count,0);
});
