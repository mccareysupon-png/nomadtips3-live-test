import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyMatchScoutsRegistry,
  normalizeScoutName,
  registerMatchScout,
  setMatchScoutsEnabled,
} from '../src/match-scouts.js';

test('Match Scouts register in permanent monotonic order',()=>{
  const empty=emptyMatchScoutsRegistry();
  const one=registerMatchScout(empty,{name:'K-HomEX',configVersion:21},{valueOf:()=>1000});
  assert.equal(one.ok,true);
  assert.equal(one.created,true);
  assert.equal(one.scout.scoutId,'MS-0001');
  assert.equal(one.scout.sequence,1);

  const two=registerMatchScout(one.registry,{name:'K-LateEX',configVersion:22},2000);
  assert.equal(two.ok,true);
  assert.equal(two.scout.scoutId,'MS-0002');
  assert.equal(two.scout.sequence,2);
  assert.equal(two.registry.nextSequence,3);
});

test('retrying the same config version is idempotent and does not create another universe',()=>{
  const first=registerMatchScout(emptyMatchScoutsRegistry(),{name:'K-HomEX',configVersion:31},1000);
  const retry=registerMatchScout(first.registry,{name:'Different retry label',configVersion:31},2000);
  assert.equal(retry.ok,true);
  assert.equal(retry.created,false);
  assert.equal(retry.idempotent,true);
  assert.equal(retry.scout.scoutId,'MS-0001');
  assert.equal(retry.scout.name,'K-HomEX');
  assert.equal(retry.registry.scouts.length,1);
  assert.equal(retry.registry.nextSequence,2);
});

test('detach and attach preserve every registered box and sequence',()=>{
  const first=registerMatchScout(emptyMatchScoutsRegistry(),{name:'K-HomEX',configVersion:41},1000);
  const detached=setMatchScoutsEnabled(first.registry,false,2000);
  assert.equal(detached.enabled,false);
  assert.equal(detached.scouts.length,1);
  assert.equal(detached.scouts[0].scoutId,'MS-0001');
  assert.equal(detached.nextSequence,2);

  const attached=setMatchScoutsEnabled(detached,true,3000);
  assert.equal(attached.enabled,true);
  assert.deepEqual(attached.scouts,detached.scouts);
  assert.equal(attached.nextSequence,2);
});

test('names are required, trimmed and bounded without changing core config',()=>{
  assert.deepEqual(normalizeScoutName('  K-HomEX   Main  '),{ok:true,name:'K-HomEX Main'});
  assert.equal(normalizeScoutName('   ').ok,false);
  assert.equal(normalizeScoutName('x'.repeat(81)).ok,false);
});
