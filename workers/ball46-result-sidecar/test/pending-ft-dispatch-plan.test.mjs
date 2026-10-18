import test from 'node:test';
import assert from 'node:assert/strict';
import {planVerifiedPendingFt} from '../src/pending-ft-dispatch-plan.mjs';
const sig=(fixtureId,market,id='s1')=>({fixtureId,market,id,status:'PENDING',period:'FT'});
const ft=(fid='5d-1',g={home:2,away:1})=>({
 source:'goaloo',sourceFixtureId:'go-1',fixtureId:fid,score:g,
 firstFtSeenAt:'2026-10-17T12:00:00Z',verifiedAt:'2026-10-17T12:01:10Z',
 fixture:{fixtureId:fid,home:'Home FC',away:'Away FC',league:'L',
  kickoffUtc:'2026-10-17T10:00:00Z',
  sourceIds:{goaloo:'go-1'},sourceMapping:{policy:'fixture-match-v3'}}
});
test('only PENDING goal markets are prepared for existing native grader',()=>{
 const r=planVerifiedPendingFt({pendingRows:[sig('5d-1','ft_over'),sig('5d-1','ft_corner_over','s2'),
  sig('5d-1','ft_ah','s3')],verifiedResults:[ft()]});
 assert.equal(r.ready.length,1);assert.deepEqual(r.ready[0].signalIds,['s1','s3']);
 assert.equal(r.ready[0].prepared.fixture.goals.home,2);
 assert.equal(r.ready[0].prepared.fixture.corners.home,null);
});
test('ignore fixtures with only Corners PENDING',()=>{
 const r=planVerifiedPendingFt({pendingRows:[sig('5d-1','ft_corner_over')],verifiedResults:[ft()]});
 assert.equal(r.ready.length,0);
});
test('hold conflicting verified source scores',()=>{
 const r=planVerifiedPendingFt({pendingRows:[sig('5d-1','ft_over')],
  verifiedResults:[ft('5d-1'),ft('5d-1',{home:3,away:1})]});
 assert.equal(r.ready.length,0);assert.equal(r.hold[0].reason,'COMPETING_FT_EVIDENCE');
});
test('hold explicit FT conflict against 5USD',()=>{
 const r=planVerifiedPendingFt({pendingRows:[sig('5d-1','ft_over')],verifiedResults:[ft()],
  hubFixtures:[{fixtureId:'5d-1',boardState:'finished',goals:{home:1,away:1}}]});
 assert.equal(r.ready.length,0);assert.equal(r.hold[0].reason,'5USD_GOALOO_FT_CONFLICT');
});
test('never forward result without persisted dual observation evidence',()=>{
 const f=ft();delete f.firstFtSeenAt;
 const r=planVerifiedPendingFt({pendingRows:[sig('5d-1','ft_over')],verifiedResults:[f]});
 assert.equal(r.ready.length,0);
});
test('limits one cycle to 3 verified fixtures, never invents Signals',()=>{
 const rows=Array.from({length:5},(_,i)=>sig('5d-'+i,'ft_over','s'+i));
 const results=rows.map(x=>ft(x.fixtureId));
 const r=planVerifiedPendingFt({pendingRows:rows,verifiedResults:results});
 assert.equal(r.ready.length,3);assert.equal(r.deferred,2);
});
