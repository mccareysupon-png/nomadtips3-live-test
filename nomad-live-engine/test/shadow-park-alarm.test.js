import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EngineState} from '../src/index-fiveusd-test.js';

test('shadow mode on_demand prevents 3-second Durable Object Alarm from rescheduling', async()=>{
  const calls=[];
  const storage={
    getAlarm:async()=>{calls.push('getAlarm');return Date.now()+1000},
    setAlarm:async()=>{calls.push('setAlarm')},
    deleteAlarm:async()=>{calls.push('deleteAlarm')},
    get:async()=>{calls.push('get');return null}
  };
  const engine=new EngineState({storage}, {ENGINE_CYCLE_MODE:'on_demand',FIVEUSD_NATIVE_MODE:'authority'});
  assert.equal(engine.continuousCycles(),false);
  await engine.armAlarm();
  await engine.alarm();
  assert.deepEqual(calls,['deleteAlarm'],'on-demand worker must cancel prior alarms and never rearm');
});

test('on-demand is the exact supported key; off is NOT safe',()=>{
 const t=readFileSync(new URL('../wrangler-fiveusd-shadow.toml',import.meta.url),'utf8');
 assert.match(t,/^ENGINE_CYCLE_MODE = "on_demand"$/m);
 assert.match(t,/^name = "nomadtips3-live-engine-5usd-shadow"$/m);
 assert.match(t,/^name = "ENGINE"$/m);
 assert.match(t,/^class_name = "EngineState"$/m);
 assert.match(t,/^FIVEUSD_LIVE_REFRESH_MS = "3000"$/m);
});
