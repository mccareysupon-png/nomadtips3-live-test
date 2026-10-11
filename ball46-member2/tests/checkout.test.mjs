import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberCheckout} from '../src/checkout.js';
const owner={id:'owner-sub',email:'mccarey.supon@gmail.com'};
const customer={id:'customer-sub',email:'customer@example.com'};
const env={MEMBER_CHECKOUT_ENABLED:'true',OWNER_CHECKOUT_EMAIL:owner.email,
  STRIPE_SECRET_KEY:'rk_live_mock_not_real',STRIPE_PRICE_ID:'price_ball46'};
const stripe=async(url,opts)=>{
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(opts.method,'POST');
  assert.equal(opts.headers.authorization,'Bearer rk_live_mock_not_real');
  const p=new URLSearchParams(opts.body);
  assert.equal(p.get('mode'),'subscription');
  assert.equal(p.get('line_items[0][price]'),'price_ball46');
  assert.equal(p.get('customer_email'),customer.email);
  assert.equal(p.get('client_reference_id'),customer.id);
  assert.match(p.get('success_url'),/^https:\/\/member\.ball46\.com\/success/);
  return {ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/cs_mock'})};
};
test('any verified non-owner can open secure hosted Stripe Checkout',async()=>{
  const r=await createMemberCheckout(customer,env,'https://member.ball46.com',stripe);
  assert.equal(r.status,303);assert.match(r.url,/^https:\/\/checkout\.stripe\.com\//);
});
test('customer checkout disabled until launch flag is on',async()=>{
  const r=await createMemberCheckout(customer,{...env,MEMBER_CHECKOUT_ENABLED:'false'},
    'https://member.ball46.com',()=>{throw Error('Unexpected call')});
  assert.equal(r.status,503);
});
test('unknown and spoofed identities fail closed before calling Stripe',async()=>{
  for(const identity of [null,{}, {email:'customer@example.com'},
    {id:'fake',email:'not-email'},{id:'fake',email:'victim@'}]){
    const r=await createMemberCheckout(identity,env,'https://member.ball46.com',
      ()=>{throw Error('Unexpected call')});
    assert.equal(r.status,401);
  }
});
test('missing secret or price denies paid checkout',async()=>{
  for(const key of ['STRIPE_SECRET_KEY','STRIPE_PRICE_ID']){
    const e={...env};delete e[key];
    const r=await createMemberCheckout(customer,e,'https://member.ball46.com',
      ()=>{throw Error('Unexpected call')});
    assert.equal(r.status,503);
  }
});
test('unexpected Origin cannot create Checkout session',async()=>{
  const r=await createMemberCheckout(customer,env,'https://untrusted.example',
    ()=>{throw Error('Unexpected call')});
  assert.equal(r.status,400);
});
test('Stripe rejects or times out without redirecting',async()=>{
  const r=await createMemberCheckout(customer,env,'https://member.ball46.com',
    async()=>({ok:false,json:async()=>({error:{message:'bad key'}})}));
  assert.equal(r.status,502);assert.equal(r.url,undefined);
});
test('malicious non-Stripe redirect is denied',async()=>{
  const r=await createMemberCheckout(customer,env,'https://member.ball46.com',
    async()=>({ok:true,json:async()=>({url:'https://phishing.example'})}));
  assert.equal(r.status,502);
});
test('Stripe Checkout never grants entitlement as a side effect',async()=>{
  const r=await createMemberCheckout(customer,env,'https://member.ball46.com',stripe);
  assert.deepEqual(Object.keys(r).sort(),['status','url']);
});
