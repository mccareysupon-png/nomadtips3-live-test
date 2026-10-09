import test from 'node:test';
import assert from 'node:assert/strict';
import {entitledPeriodEnd} from '../src/access-auth.js';

const now=1791540000, price='price_ball46';
const sub=(status,items,rootEnd)=>({
  status,items:{data:items.map(([id,end])=>({price:{id},current_period_end:end}))},
  ...(rootEnd===undefined?{}:{current_period_end:rootEnd})
});
test('modern Stripe item period permits paid plan only',()=>{
  assert.equal(entitledPeriodEnd(sub('active',[[price,now+2592000]]),price,now),now+2592000);
});
test('legacy Stripe root billing period remains compatible for matching plan',()=>{
  assert.equal(entitledPeriodEnd(sub('active',[[price,undefined]],now+2592000),price,now),now+2592000);
});
test('wrong plan cannot unlock member even if root has future period',()=>{
  assert.equal(entitledPeriodEnd(sub('active',[['price_other',now+30000]],now+30000),price,now),null);
});
test('canceled, unpaid, past_due and incomplete never grant access',()=>{
  for(const status of ['canceled','unpaid','past_due','incomplete','incomplete_expired','paused']){
    assert.equal(entitledPeriodEnd(sub(status,[[price,now+2592000]]),price,now),null,status);
  }
});
test('expired member plan cannot borrow time from another plan',()=>{
  assert.equal(entitledPeriodEnd(sub('active',[[price,now-1],['price_other',now+2592000]]),price,now),null);
});
test('missing price and missing item period deny access',()=>{
  assert.equal(entitledPeriodEnd(sub('active',[[price,now+100]]),null,now),null);
  assert.equal(entitledPeriodEnd(sub('active',[[price,undefined]]),price,now),null);
});
test('matching item with earliest end bounds multi-item entitlement',()=>{
  assert.equal(entitledPeriodEnd(sub('active',[[price,now+500],[price,now+1000]]),price,now),now+500);
});
