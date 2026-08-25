import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineState} from '../src/index.js';
import {DEFAULT_CONFIG,editableConfig} from '../src/config.js';

const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));

class MemoryStorage{
  constructor(){this.values=new Map();this.alarm=null;this.alarmWrites=0;this.writes=0;}
  async get(key){return copy(this.values.get(key));}
  async put(key,value){this.writes++;this.values.set(key,copy(value));}
  async delete(key){this.writes++;this.values.delete(key);}
  async transaction(callback){return callback(this);}
  async getAlarm(){return this.alarm;}
  async setAlarm(value){this.alarmWrites++;this.alarm=value;}
}

function fixture(mode){
  const pending=[];
  const storage=new MemoryStorage();
  const state={storage,waitUntil:promise=>pending.push(promise)};
  const engine=new EngineState(state,mode?{ENGINE_CYCLE_MODE:mode}:{});
  let cycles=0;

  engine.runCycle=async()=>{
    cycles++;
    const time=Date.now();
    await storage.put('state',{
      lastCycle:time,lastSuccess:time,lastError:null,matches:[],signals:[],cycle:cycles,source:{},
    });
    return {ok:true,cycle:cycles};
  };

  return {
    engine,storage,pending,
    get cycles(){return cycles;},
    async request(path){return engine.fetch(new Request(`https://engine.local${path}`));},
    async settle(){await Promise.all(pending);},
  };
}

test('Production retains its continuous alarm and stale health wake behavior',async()=>{
  const production=fixture();
  const response=await production.request('/health');
  await production.settle();

  assert.equal(response.status,200);
  assert.equal(production.cycles,1);
  assert.ok(production.storage.alarm);
  assert.equal(production.storage.alarmWrites,1);
});

test('TEST health is strictly read-only and never wakes a cycle or schedules an alarm',async()=>{
  const testEngine=fixture('on_demand');
  const response=await testEngine.request('/health');
  const body=await response.json();

  assert.equal(response.status,200);
  assert.equal(body.cycle,0);
  assert.equal(testEngine.cycles,0);
  assert.equal(testEngine.pending.length,0);
  assert.equal(testEngine.storage.writes,0);
  assert.equal(testEngine.storage.alarmWrites,0);
  assert.equal(testEngine.storage.alarm,null);
});

test('a stale TEST /feed runs one request-driven cycle without a persistent alarm',async()=>{
  const testEngine=fixture('on_demand');
  const response=await testEngine.request('/feed');
  await testEngine.settle();

  assert.equal(response.status,200);
  assert.equal(testEngine.cycles,1);
  assert.equal(testEngine.pending.length,1);
  assert.equal(testEngine.storage.alarmWrites,0);
  assert.equal(testEngine.storage.alarm,null);

  await testEngine.request('/feed');
  assert.equal(testEngine.cycles,1,'fresh feed data must not start another cycle');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(testEngine.cycles,1,'without another stale browser request, TEST remains idle');
});

test('TEST statistics requests never wake a stale engine or schedule an alarm',async()=>{
  const testEngine=fixture('on_demand');
  const response=await testEngine.request('/statistics');

  assert.equal(response.status,200);
  assert.equal(testEngine.cycles,0);
  assert.equal(testEngine.pending.length,0);
  assert.equal(testEngine.storage.alarmWrites,0);
});

test('TEST config reads never wake a cycle or schedule an alarm',async()=>{
  const testEngine=fixture('on_demand');
  const response=await testEngine.request('/config');

  assert.equal(response.status,200);
  assert.equal(testEngine.cycles,0);
  assert.equal(testEngine.pending.length,0);
  assert.equal(testEngine.storage.alarmWrites,0);
});

test('any existing TEST alarm is ignored instead of running or rescheduling',async()=>{
  const testEngine=fixture('on_demand');
  await testEngine.engine.alarm();

  assert.equal(testEngine.cycles,0);
  assert.equal(testEngine.storage.alarmWrites,0);
  assert.equal(testEngine.storage.writes,0);
});

test('Production alarms run a cycle and schedule the next continuous cycle',async()=>{
  const production=fixture('continuous');
  await production.engine.alarm();

  assert.equal(production.cycles,1);
  assert.equal(production.storage.alarmWrites,1);
  assert.ok(production.storage.alarm>Date.now());
});

test('TEST settings updates never create alarms while Production settings still do',async()=>{
  const testEngine=fixture('on_demand');
  const production=fixture();

  await testEngine.engine.stageConfig(editableConfig(DEFAULT_CONFIG),0);
  await production.engine.stageConfig(editableConfig(DEFAULT_CONFIG),0);

  assert.equal(testEngine.storage.alarmWrites,0);
  assert.equal(production.storage.alarmWrites,1);
});
