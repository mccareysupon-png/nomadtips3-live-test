import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from '../src/worker.js';
import {entitledPeriodEnd} from '../src/access-auth.js';

// Read-only worker integration test with sandbox-shaped Stripe responses.
// The real $5 USD Stripe Test Mode invoice, paid subscription and cancellation
// are verified separately using Stripe's API. These mocks cannot create charges.
test('member: signed Access -> Stripe subscription -> protected routes -> cancellation', async t=>{
  const keypair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pub={...await webcrypto.subtle.exportKey('jwk',keypair.publicKey),kid:'qa-ball46-kid',use:'sig',alg:'RS256'};
  const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  async function jwt(email,overrides={}){
    const now=Math.floor(Date.now()/1000),head=encode({alg:'RS256',kid:pub.kid,typ:'JWT'});
    const payload=encode({iss:'https://qa.cloudflareaccess.com',aud:['ball46-e2e-qa'],sub:'signed-'+email,email,iat:now,nbf:now-5,exp:now+300,...overrides});
    const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keypair.privateKey,new TextEncoder().encode(head+'.'+payload));
    return head+'.'+payload+'.'+Buffer.from(sig).toString('base64url');
  }
  const email='ball46-e2e-20261021@example.com', owner='owner-test@ball46.example', wrong='other@ball46.example';
  const price='price_1URU2jFXmKSSVxQd98cwIgDY';
  const env={CF_ACCESS_TEAM_DOMAIN:'qa.cloudflareaccess.com',CF_ACCESS_AUD:'ball46-e2e-qa',STRIPE_SECRET_KEY:'rk_test_not_real',STRIPE_PRICE_ID:price,OWNER_CHECKOUT_EMAIL:owner,MEMBER_CHECKOUT_ENABLED:'true',APP_STAGE:'sandbox'};
  let status='active',subscriptionPrice=price,periodEnd=Math.floor(Date.now()/1000)+2592000;
  const now=()=>Math.floor(Date.now()/1000);
  let customerLookups=0,subscriptionLookups=0,checkoutRequests=0;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async (input,options={})=>{
    const u=new URL(input instanceof Request?input.url:input);
    const asJSON=(body,statusCode=200)=>new Response(JSON.stringify(body),{status:statusCode,headers:{'content-type':'application/json'}});
    if(u.hostname==='qa.cloudflareaccess.com'&&u.pathname==='/cdn-cgi/access/certs')return asJSON({keys:[pub]});
    if(u.hostname==='api.stripe.com'){
      if(u.pathname==='/v1/customers'){customerLookups++;return asJSON({data:[{id:'cus_test_qa',email,deleted:false}]});}
      if(u.pathname==='/v1/subscriptions'){subscriptionLookups++;return asJSON({data:[{
        id:'sub_qa',status,items:{data:[{price:{id:subscriptionPrice},current_period_end:periodEnd}]},
        cancel_at_period_end:false
      }]});}
      if(u.pathname==='/v1/checkout/sessions'&&options.method==='POST'){
        checkoutRequests++;
        const params=new URLSearchParams(options.body);
        assert.equal(params.get('mode'),'subscription');
        assert.equal(params.get('line_items[0][price]'),price);
        assert.equal(params.get('customer_email'),email);
        assert.equal(params.get('client_reference_id'),'signed-'+email);
        return asJSON({url:'https://checkout.stripe.com/c/pay/cs_test_qa_signed'});
      }
      throw Error('Unexpected Stripe endpoint: '+u.pathname);
    }
    if(u.hostname==='www.ball46.com'&&u.pathname==='/api/engine/statistics')return asJSON({ok:true,rows:[],hasMore:false});
    if(u.hostname==='www.ball46.com'&&u.pathname==='/api/engine/board')return asJSON({ok:true,fixtures:[]});
    throw Error('Unexpected external fetch: '+u.toString());
  };
  const get=async (path,token=null)=>{
    const headers=token?{'Cf-Access-Jwt-Assertion':token}:{};
    return worker.fetch(new Request('https://member.ball46.com'+path,{headers}),{...env,ASSETS:{fetch:async req=>new Response('<html>member-protected-asset</html>',{headers:{'content-type':'text/html'}})}});
  };
  try{
    const customerToken=await jwt(email),ownerToken=await jwt(owner),unknownToken=await jwt(wrong);
    await t.test('active paid subscription exposes protected member session',async()=>{
      status='active';periodEnd=now()+2592000;subscriptionPrice=price;
      const r=await get('/api/member/session',customerToken),body=await r.json();
      assert.equal(r.status,200);assert.equal(body.authenticated,true);assert.equal(body.member.role,'MEMBER');
      assert.equal(body.member.accessType,'SUBSCRIPTION');assert.equal(body.member.status,'ACTIVE');
      assert.equal(body.member.currentPeriodEnd,periodEnd*1000);
    });
    await t.test('active paid subscriber can enter protected member HTML',async()=>{
      const r=await get('/member',customerToken);
      assert.equal(r.status,200);
      assert.match(await r.text(),/member-protected-asset/);
    });
    await t.test('paid subscriber can request protected daily board',async()=>{
      const r=await get('/api/member/daily',customerToken);
      assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
    });
    await t.test('owner has lifetime access independent of billing',async()=>{
      const body=await (await get('/api/member/session',ownerToken)).json();
      assert.equal(body.authenticated,true);
      assert.equal(body.member.role,'OWNER');
      assert.equal(body.member.accessType,'LIFETIME');
    });
    await t.test('unverified requests cannot access premium routes or create checkout',async()=>{
      const r=await get('/member');
      assert.equal(r.status,303);assert.match(r.headers.get('location'),/membership=required/);
      assert.equal((await get('/api/member/daily')).status,401);
      assert.equal((await get('/api/member/checkout')).status,401);
    });
    await t.test('tampered JWT signature never grants a role',async()=>{
      const parts=customerToken.split('.');parts[1]=encode({email:owner,sub:'fake',exp:now()+300});
      const body=await (await get('/api/member/session',parts.join('.'))).json();
      assert.equal(body.authenticated,false);
    });
    await t.test('verified identity without a paid customer is denied',async()=>{
      const body=await (await get('/api/member/session',unknownToken)).json();
      assert.equal(body.authenticated,false);
    });
    for(const denied of ['canceled','unpaid','incomplete','incomplete_expired','past_due','paused']){
      await t.test(denied+' subscription never opens Member',async()=>{
        status=denied;periodEnd=now()+2592000;subscriptionPrice=price;
        const body=await (await get('/api/member/session',customerToken)).json();
        assert.equal(body.authenticated,false);
        assert.equal((await get('/api/member/daily',customerToken)).status,401);
      });
    }
    await t.test('active but expired subscription is denied',async()=>{
      status='active';periodEnd=now()-10;
      const body=await (await get('/api/member/session',customerToken)).json();
      assert.equal(body.authenticated,false);
    });
    await t.test('active subscription for wrong price does not open member',async()=>{
      status='active';periodEnd=now()+2592000;subscriptionPrice='price_other_plan';
      const body=await (await get('/api/member/session',customerToken)).json();
      assert.equal(body.authenticated,false);
    });
    await t.test('non-subscribed verified customer is sent to Stripe Checkout',async()=>{
      status='canceled';subscriptionPrice=price;
      const r=await get('/api/member/checkout',customerToken);
      assert.equal(r.status,303);assert.match(r.headers.get('location'),/^https:\/\/checkout\.stripe\.com\//);
      assert(checkoutRequests>0);
    });
    await t.test('success page alone cannot create entitlement',async()=>{
      status='canceled';
      assert.equal((await get('/success',customerToken)).status,200);
      const body=await (await get('/api/member/session',customerToken)).json();
      assert.equal(body.authenticated,false);
    });
    await t.test('Webhook is explicitly not configured: never assume processed',async()=>{
      const r=await get('/api/stripe/webhook',customerToken);
      assert.equal(r.status,503);
      assert.equal((await r.json()).error,'WEBHOOK_NOT_CONFIGURED');
    });
    await t.test('wrong price never entitled regardless of root period',()=>{
      assert.equal(entitledPeriodEnd({status:'active',current_period_end:now()+2592000,items:{data:[{price:{id:'other'}}]}},price),null);
    });
    assert(customerLookups>0&&subscriptionLookups>0);
    console.log('BALL46_MEMBER_PAYMENT_SIGNED_JWT_ROUTING_INTEGRATION_PASS',JSON.stringify({tested:'active/canceled/unpaid/expired/wrong-price/owner/JWT/checkout/success',stripeMode:'MOCK_RESPONSES',testPrice:price,noProductionWrites:true}));
  }finally{globalThis.fetch=previousFetch;}
});
