import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,editableConfig,validateEditableConfig} from '../src/config.js';

const complete=()=>editableConfig(DEFAULT_CONFIG);

test('D-001 rejects coercible non-scalar numeric values instead of turning them into numbers',()=>{
  const invalidValues=[null,true,false,[],[5],{},'', '   '];
  for(const value of invalidValues){
    const result=validateEditableConfig({...complete(),rollingWindowMinutes:value},{requireAll:true});
    assert.equal(result.ok,false,`rollingWindowMinutes=${JSON.stringify(value)} must fail`);
    assert.match(result.errors.join(' '),/rollingWindowMinutes/);
  }
});

test('D-001 keeps finite numeric strings compatible with direct Settings payloads',()=>{
  const result=validateEditableConfig({
    ...complete(),
    minuteFrom:'55',
    minuteTo:'88',
    rollingWindowMinutes:'5',
    attackWeight:'1',
    dangerousAttackWeight:'2',
    homePressureShareMinimum:'54',
    oddsMinimum:'1.50',
    maximumPriceAgeSeconds:'90',
  },{requireAll:true});
  assert.equal(result.ok,true);
  assert.equal(result.config.minuteFrom,55);
  assert.equal(result.config.rollingWindowMinutes,5);
  assert.equal(result.config.oddsMinimum,1.5);
});

test('D-001 preserves real zero while rejecting fake zero values',()=>{
  const zero=validateEditableConfig({...complete(),attackWeight:0,dangerousAttackWeight:2},{requireAll:true});
  assert.equal(zero.ok,true);
  assert.equal(zero.config.attackWeight,0);
  for(const value of [null,false,[],{}]){
    const result=validateEditableConfig({...complete(),attackWeight:value},{requireAll:true});
    assert.equal(result.ok,false,`attackWeight=${JSON.stringify(value)} must not become zero`);
  }
});

test('D-001 rejects malformed selected-line elements but still accepts numeric strings',()=>{
  const good=validateEditableConfig({...complete(),allowedLinesMode:'SELECTED',allowedSelectionLines:['-0.25','0','1.00']},{requireAll:true});
  assert.equal(good.ok,true);
  assert.deepEqual(good.config.allowedSelectionLines,[-0.25,0,1]);
  for(const value of [null,false,true,[0],{}]){
    const bad=validateEditableConfig({...complete(),allowedLinesMode:'SELECTED',allowedSelectionLines:[value]},{requireAll:true});
    assert.equal(bad.ok,false,`selected line ${JSON.stringify(value)} must fail`);
  }
});

test('D-001 still permits null Maximum Odds only while the switch is disabled',()=>{
  const disabled=validateEditableConfig({...complete(),oddsMaximumEnabled:false,oddsMaximum:null},{requireAll:true});
  assert.equal(disabled.ok,true);
  assert.equal(disabled.config.oddsMaximum,null);
  const enabled=validateEditableConfig({...complete(),oddsMaximumEnabled:true,oddsMaximum:null},{requireAll:true});
  assert.equal(enabled.ok,false);
  assert.match(enabled.errors.join(' '),/Maximum Odds is required/);
});
