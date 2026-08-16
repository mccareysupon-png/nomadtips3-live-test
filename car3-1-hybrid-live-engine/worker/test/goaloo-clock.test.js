import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalooClockSource,attachGoalooClock} from '../src/goaloo-clock.js';

function row({id='3000001',start='2026-08-16 08:00:00',clock='2026-08-16 08:42:37',state=1}={}){
  const fields=[id,1,0,0,'Home','Away',start,clock,state,0,0];
  return `A[0]=[${fields.map(v=>typeof v==='string'?`'${v}'`:v).join(',')}];`;
}

test('parses Goaloo fields 6/7/8 into exact elapsed seconds',()=>{
  const clocks=parseGoalooClockSource(row());
  const clock=clocks.get('3000001');
  assert.equal(clock.stateCode,1);
  assert.equal(clock.status,'LIVE');
  assert.equal(clock.elapsedSeconds,42*60+37);
  assert.equal(clock.sourceStart,'2026-08-16 08:00:00');
  assert.equal(clock.sourceClock,'2026-08-16 08:42:37');
});

test('supports second-half live state without browser interpolation',()=>{
  const clocks=parseGoalooClockSource(row({clock:'2026-08-16 09:03:24',state:3}));
  assert.equal(clocks.get('3000001').elapsedSeconds,63*60+24);
});

test('half-time is source status and freezes at 45 minutes',()=>{
  const clocks=parseGoalooClockSource(row({clock:'2026-08-16 08:55:00',state:2}));
  const clock=clocks.get('3000001');
  assert.equal(clock.status,'HT');
  assert.equal(clock.elapsedSeconds,45*60);
});

test('exact seconds are exposed only when they agree with CAR 3.1 minute',()=>{
  const clock=parseGoalooClockSource(row()).get('3000001');
  const accepted=attachGoalooClock({sourceMatchId:'3000001',minute:43,status:'LIVE'},clock);
  assert.equal(accepted.goalooClock.verified,true);
  assert.equal(accepted.goalooElapsedSeconds,2557);

  const rejected=attachGoalooClock({sourceMatchId:'3000001',minute:70,status:'LIVE'},clock);
  assert.equal(rejected.goalooClock.verified,false);
  assert.equal('goalooElapsedSeconds' in rejected,false);
});
