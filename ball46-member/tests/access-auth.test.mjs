import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {memberAccess} from '../src/access-auth.js';
import worker from '../src/worker.js';

globalThis.crypto ??= webcrypto;
const team='ball46-unit-test.cloudflareaccess.com';
const price='price_ball46_unit_test';
const email='paid-member@example.invalid';
const now=Math.floor(Date.now()/1000);
const env={CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:'ball46-unit-test-audience',STRIPE_SECRET_KEY:'unit-test-placeholder',STRIPE_PRICE_ID:price};
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'unit-test-signing-key',use:'sig'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function jwt(overrides={},headerOverrides={}){
  const header=encode({alg:'RS256',kid:jwk.kid,...headerOverrides});
  const payload=encode({sub:'unit-test-member',email,iss:'https://'+team,aud:[env.CF_ACCESS_AUD],iat:now-5,exp:now+600,...overrides});
  const unsigned=header+'.'+payload;
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned));
  return unsigned+'.'+Buffer.from(signature).toString('base64url');
}
const validJwt=await jwt();
function subscription(overrides={}){
  return {id:'sub_unit_test',status:'active',current_period_end:now+3600,ended_at:null,cancel_at:null,cancel_at_period_end:false,
    latest_invoice:{id:'in_unit_test',status:'paid'},items:{data:[{id:'si_unit_test',price:{id:price},current_period_end:now+3600}]},...overrides};
}
async function scenario(options={},check){
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async input=>{
    const url=new URL(String(input));
    calls.push(url);
    if(options.failNetwork)throw new Error('SIMULATED_UNAVAILABLE');
    if(url.href==='https://'+team+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});
    if(url.origin!=='https://api.stripe.com')throw new Error('UNEXPECTED_NETWORK_ORIGIN');
    if(url.pathname==='/v1/customers')return Response.json({data:options.customers??[{id:'cus_unit_test',email}]});
    if(url.pathname==='/v1/subscriptions'){
      assert.equal(url.searchParams.get('customer'),'cus_unit_test');
      assert.deepEqual(url.searchParams.getAll('expand[]'),['data.latest_invoice']);
      return Response.json({data:options.subscriptions??[subscription()]});
    }
    throw new Error('UNEXPECTED_NETWORK_PATH');
  };
  try{
    const request=new Request('https://member.ball46.com/member',{headers:{'Cf-Access-Jwt-Assertion':options.token??validJwt}});
    const result=await memberAccess(request,{...env,...options.env});
    await check(result,{calls,request});
  }finally{globalThis.fetch=originalFetch;}
}
test('signed identity with modern paid item receives MEMBER entitlement',async()=>{
  const sub=subscription();
  delete sub.current_period_end;
  await scenario({subscriptions:[sub]},result=>{
    assert.equal(result?.role,'MEMBER');
    assert.equal(result.accessType,'SUBSCRIPTION');
    assert.equal(result.expiresAt,(now+3600)*1000);
  });
});
test('legacy subscription period remains supported',async()=>{
  const sub=subscription();
  delete sub.items.data[0].current_period_end;
  await scenario({subscriptions:[sub]},result=>assert.equal(result?.expiresAt,(now+3600)*1000));
});
test('expired matching item cannot borrow another items future period',async()=>{
  const sub=subscription({current_period_end:now+7200,items:{data:[
    {price:{id:price},current_period_end:now-1},
    {price:{id:'price_other'},current_period_end:now+7200}
  ]}});
  await scenario({subscriptions:[sub]},result=>assert.equal(result,null));
});
test('expired legacy paid period is denied',async()=>{
  await scenario({subscriptions:[subscription({current_period_end:now-1,items:{data:[{price:{id:price}}]}})]},result=>assert.equal(result,null));
});
test('period-end cancellation retains access only through its paid end',async()=>{
  await scenario({subscriptions:[subscription({cancel_at_period_end:true})]},result=>{
    assert.equal(result?.cancelAtPeriodEnd,true);
    assert.equal(result.expiresAt,(now+3600)*1000);
  });
});
test('custom cancellation caps access at the cancellation time',async()=>{
  await scenario({subscriptions:[subscription({cancel_at:now+300})]},result=>assert.equal(result?.expiresAt,(now+300)*1000));
});
test('reached cancellation time is denied even before status update arrives',async()=>{
  await scenario({subscriptions:[subscription({cancel_at:now-1})]},result=>assert.equal(result,null));
});
for(const status of ['canceled','unpaid','past_due','incomplete','incomplete_expired','paused','trialing']){
  test('subscription status '+status+' is denied',async()=>{
    await scenario({subscriptions:[subscription({status})]},result=>assert.equal(result,null));
  });
}
test('active subscription with unpaid invoice is denied',async()=>{
  await scenario({subscriptions:[subscription({latest_invoice:{status:'open'}})]},result=>assert.equal(result,null));
});
test('unexpanded or missing invoice cannot be used as proof of payment',async()=>{
  await scenario({subscriptions:[subscription({latest_invoice:'in_unit_test'})]},result=>assert.equal(result,null));
});
test('different price cannot grant access',async()=>{
  await scenario({subscriptions:[subscription({items:{data:[{price:{id:'price_other'},current_period_end:now+3600}]}})]},result=>assert.equal(result,null));
});
test('unpaid identity with no subscriptions is denied',async()=>{
  await scenario({subscriptions:[]},result=>assert.equal(result,null));
});
test('ended subscription cannot grant access despite an inconsistent active status',async()=>{
  await scenario({subscriptions:[subscription({ended_at:now-1})]},result=>assert.equal(result,null));
});
test('deleted or unrelated customers cannot grant access',async()=>{
  await scenario({customers:[{id:'cus_unit_test',email,deleted:true},{id:'cus_other',email:'different@example.invalid'}]},(result,{calls})=>{
    assert.equal(result,null);
    assert.equal(calls.filter(x=>x.pathname==='/v1/subscriptions').length,0);
  });
});
test('expired JWT is denied before Stripe lookup',async()=>{
  await scenario({token:await jwt({exp:now-1})},(result,{calls})=>{assert.equal(result,null);assert.equal(calls.length,0)});
});
test('incorrect JWT audience is denied before Stripe lookup',async()=>{
  await scenario({token:await jwt({aud:['another-audience']})},(result,{calls})=>{assert.equal(result,null);assert.equal(calls.length,0)});
});
test('incorrect JWT issuer is denied before Stripe lookup',async()=>{
  await scenario({token:await jwt({iss:'https://other.cloudflareaccess.com'})},(result,{calls})=>{assert.equal(result,null);assert.equal(calls.length,0)});
});
test('forged signature is denied before Stripe lookup',async()=>{
  const parts=validJwt.split('.');
  parts[2]=Buffer.alloc(256).toString('base64url');
  await scenario({token:parts.join('.')},(result,{calls})=>{
    assert.equal(result,null);
    assert.equal(calls.some(x=>x.hostname==='api.stripe.com'),false);
  });
});
test('future JWT issue time is denied',async()=>{
  await scenario({token:await jwt({iat:now+120})},result=>assert.equal(result,null));
});
test('missing JWT cannot grant access from a spoofed email header',async()=>{
  const result=await memberAccess(new Request('https://member.ball46.com/member',{headers:{'Cf-Access-Authenticated-User-Email':email}}),env);
  assert.equal(result,null);
});
test('missing Stripe configuration and unavailable upstream fail closed',async()=>{
  await scenario({env:{STRIPE_SECRET_KEY:''}},result=>assert.equal(result,null));
  await scenario({failNetwork:true},result=>assert.equal(result,null));
});
test('session response never substitutes an OWNER identity',async()=>{
  await scenario({},async(result,{request})=>{
    const response=await worker.fetch(new Request('https://member.ball46.com/api/member/session',request),env);
    const body=await response.json();
    assert.equal(body.member.role,'MEMBER');
    assert.equal(body.member.accessType,'SUBSCRIPTION');
  });
});
test('checkout remains disabled even for a verified paid member',async()=>{
  const response=await worker.fetch(new Request('https://member.ball46.com/api/stripe/checkout',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':validJwt}}),env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'CHECKOUT_DISABLED_UNTIL_VERIFIED_ENTITLEMENTS');
});
