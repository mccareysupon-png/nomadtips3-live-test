import test from 'node:test';
import assert from 'node:assert/strict';
import {entitledPeriodEnd, ownerEntitlement, memberAccess} from '../src/access-auth.js';

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

test('verified owner gets lifetime access without a Stripe subscription',()=>{
  const owner=ownerEntitlement({email:'mccarey.supon@gmail.com'},{
    OWNER_CHECKOUT_EMAIL:'mccarey.supon@gmail.com'
  });
  assert.equal(owner?.role,'OWNER');
  assert.equal(owner?.accessType,'LIFETIME');
  assert.equal(owner?.status,'ACTIVE');
  assert.equal(owner?.currentPeriodEnd,null);
});
test('email mismatch and missing owner configuration never grant admin entitlement',()=>{
  const env={OWNER_CHECKOUT_EMAIL:'mccarey.supon@gmail.com'};
  for(const identity of [null,{}, {email:'mccarey.supon+evil@gmail.com'},{email:'other@example.com'}]){
    assert.equal(ownerEntitlement(identity,env),null);
  }
  assert.equal(ownerEntitlement({email:env.OWNER_CHECKOUT_EMAIL},{}),null);
});
test('unverified identity and spoofed request headers are never accepted as owner',async()=>{
  const env={OWNER_CHECKOUT_EMAIL:'mccarey.supon@gmail.com',CF_ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',CF_ACCESS_AUD:'sample'};
  const request=new Request('https://member.ball46.com/member',{headers:{
    'x-email':env.OWNER_CHECKOUT_EMAIL,
    'cf-access-authenticated-user-email':env.OWNER_CHECKOUT_EMAIL,
    'cf-access-jwt-assertion':'not.a.valid.jwt'
  }});
  assert.equal(await memberAccess(request,env),null);
});
