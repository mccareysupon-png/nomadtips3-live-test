import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalooLiveClocks} from '../src/live-clock-source.js';

test('Goaloo live clock parser keeps exact source snapshot seconds',()=>{
  const source=`A[1]=["2955578",1,0,0,"Home","Away","2026-08-16 10:00:00","2026-08-16 11:05:18",1,0,1,0,0,0,0,0,0];`;
  const [row]=parseGoalooLiveClocks(source);
  assert.equal(row.id,'2955578');
  assert.equal(row.status,'LIVE');
  assert.equal(row.elapsedSeconds,3918);
  assert.equal(row.minute,65);
  assert.equal(row.sourceClock,'2026-08-16 11:05:18');
});

test('Goaloo half time clock stops at 45:00',()=>{
  const source=`A[2]=["88",1,0,0,"H","A","2026-08-16 10:00:00","2026-08-16 10:53:00",2,0,0,0,0,0,0,0,0];`;
  const [row]=parseGoalooLiveClocks(source);
  assert.equal(row.status,'HT');
  assert.equal(row.elapsedSeconds,2700);
});
