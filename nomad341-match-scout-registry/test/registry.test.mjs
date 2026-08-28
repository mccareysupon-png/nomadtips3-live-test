import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{ScoutRegistry} from '../src/index.js';

function createRegistry(){
  const data=new Map();
  const state={storage:{
    get:async key=>data.get(key),
    put:async(key,value)=>data.set(key,structuredClone(value)),
  }};
  return {registry:new ScoutRegistry(state),data};
}

async function request(registry,path,{method='GET',body}={}){
  const init={method,headers:{}};
  if(body!==undefined){init.headers['content-type']='application/json';init.body=JSON.stringify(body);}
  return registry.fetch(new Request(`https://registry.test${path}`,init));
}

test('register allocates stable monotonic IDs and is idempotent by configVersion',async()=>{
  const {registry}=createRegistry();
  let response=await request(registry,'/scouts/register',{method:'POST',body:{name:' K-HomEX ',configVersion:71,appliesFromCycle:12884}});
  let data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.item.scoutId,'MS-0001');
  assert.equal(data.item.name,'K-HomEX');
  assert.equal(data.item.configVersion,71);
  assert.equal(data.existing,false);

  response=await request(registry,'/scouts/register',{method:'POST',body:{name:'SHOULD-NOT-REPLACE',configVersion:71}});
  data=await response.json();
  assert.equal(data.existing,true);
  assert.equal(data.item.scoutId,'MS-0001');
  assert.equal(data.item.name,'K-HomEX');

  response=await request(registry,'/scouts/register',{method:'POST',body:{name:'K-LateEX',configVersion:72}});
  data=await response.json();
  assert.equal(data.item.scoutId,'MS-0002');

  response=await request(registry,'/scouts');
  data=await response.json();
  assert.deepEqual(data.scouts.map(item=>[item.scoutId,item.configVersion]),[['MS-0001',71],['MS-0002',72]]);
});

test('legacy migration preserves MS-0001 sequence and remains idempotent',async()=>{
  const {registry}=createRegistry();
  const legacy={
    scoutId:'MS-0001',
    sequence:1,
    name:'K-HomEX',
    configVersion:71,
    appliesFromCycle:12884,
    createdAt:'2026-08-28T10:00:00.000Z',
    settingsSnapshot:{minuteFrom:55,minuteTo:88},
  };

  let response=await request(registry,'/scouts/migrate',{method:'POST',body:{items:[legacy]}});
  let data=await response.json();
  assert.equal(data.added,1);
  assert.equal(data.scouts[0].scoutId,'MS-0001');
  assert.deepEqual(data.scouts[0].settingsSnapshot,{minuteFrom:55,minuteTo:88});

  response=await request(registry,'/scouts/migrate',{method:'POST',body:{items:[legacy]}});
  data=await response.json();
  assert.equal(data.added,0);
  assert.equal(data.scouts.length,1);

  response=await request(registry,'/scouts/register',{method:'POST',body:{name:'K-Next',configVersion:72}});
  data=await response.json();
  assert.equal(data.item.scoutId,'MS-0002');
});

test('outer worker keeps writes protected and health independent of the registry binding',async()=>{
  const health=await worker.fetch(new Request('https://registry.test/health'),{});
  const healthData=await health.json();
  assert.equal(health.status,200);
  assert.equal(healthData.ok,true);

  const denied=await worker.fetch(new Request('https://registry.test/scouts/register',{
    method:'POST',
    headers:{'content-type':'application/json','origin':'https://www.nomadtips3.com'},
    body:JSON.stringify({name:'K-HomEX',configVersion:71}),
  }),{});
  const deniedData=await denied.json();
  assert.equal(denied.status,401);
  assert.equal(deniedData.error,'unauthorized');
});
