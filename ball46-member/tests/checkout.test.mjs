import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotCheckout} from '../src/checkout.js';

const good={id:'verified-uid',email:'mccarey.supon@gmail.com'};
const env={OWNER_CHECKOUT_ENABLED:'true',OWNER_CHECKOUT_EMAIL:good.email,STRIPE_SECRET_KEY:'rk_live_local_test_only',STRIPE_PRICE_ID:'price_ball46'};
const ok=async(url,opts)=>{
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(opts.method,'POST');
  assert.equal(opts.headers.authorization,'Bearer rk_live_local_test_only');
  const p=new URLSearchParams(opts.body);
  assert.equal(p.get('mode'),'subscription');
  assert.equal(p.get('line_items[0][price]'),'price_ball46');
  assert.equal(p.get('customer_email'),good.email);
  assert.equal(p.get('client_reference_id'),good.id);
  assert.match(p.get('success_url'),/^https:\/\/member\.ball46\.com\/success/);
  return {ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/cs_mock'})};
};
test('only verified owner enters hosted Stripe Checkout',async()=>{
  const r=await createPilotCheckout(good,env,'https://member.ball46.com',ok);
  assert.equal(r.status,303);
  assert.match(r.url,/^https:\/\/checkout\.stripe\.com\//);
});
test('deny owner pilot when flag off',async()=>{
  const r=await createPilotCheckout(good,{...env,OWNER_CHECKOUT_ENABLED:'false'},'https://member.ball46.com',()=>{throw Error('No Stripe network allowed')});
  assert.equal(r.status,503);
});
test('deny unauthorized, missing, and spoofed identity',async()=>{
  for(const identity of [null,{}, {email:'another@example.com'},{email:'MCCAREY.SUPON@gmail.com'}]){
    const r=await createPilotCheckout(identity,env,'https://member.ball46.com',()=>{throw Error('No Stripe network allowed')});
    assert.equal(r.status,403);
  }
});
test('deny missing secrets and price',async()=>{
  for(const key of ['STRIPE_SECRET_KEY','STRIPE_PRICE_ID']){
    const e={...env};delete e[key];
    const r=await createPilotCheckout(good,e,'https://member.ball46.com',()=>{throw Error('No Stripe network allowed')});
    assert.equal(r.status,503);
  }
});
test('deny unexpected checkout origin',async()=>{
  const r=await createPilotCheckout(good,env,'https://not-ball46.example',()=>{throw Error('No Stripe network allowed')});
  assert.equal(r.status,400);
});
test('Stripe failures fail closed and never issue a redirect',async()=>{
  const r=await createPilotCheckout(good,env,'https://member.ball46.com',async()=>({ok:false,json:async()=>({error:{message:'declined'}})}));
  assert.equal(r.status,502);assert.equal(r.url,undefined);
});
test('Reject untrusted Stripe redirect URL',async()=>{
  const r=await createPilotCheckout(good,env,'https://member.ball46.com',async()=>({ok:true,json:async()=>({url:'https://evil.example/redirect'})}));
  assert.equal(r.status,502);
});
