// Owner-only pilot checkout. No entitlement is granted by a redirect or payment URL.
// The protected app requires verified Cloudflare Access identity and a live Stripe subscription.
export async function createPilotCheckout(identity, env, origin, fetcher=fetch){
  if(env.OWNER_CHECKOUT_ENABLED!=='true') return {status:503,body:{ok:false,error:'CHECKOUT_PILOT_DISABLED'}};
  const owner=String(env.OWNER_CHECKOUT_EMAIL||'').trim().toLowerCase();
  if(!owner || !identity?.email || identity.email!==owner)
    return {status:403,body:{ok:false,error:'OWNER_PILOT_ONLY'}};
  if(!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID)
    return {status:503,body:{ok:false,error:'STRIPE_NOT_CONFIGURED'}};
  const base=new URL(origin);
  if(base.protocol!=='https:' || !['member.ball46.com','ball46-member-production.mccarey-supon.workers.dev'].includes(base.hostname))
    return {status:400,body:{ok:false,error:'INVALID_CHECKOUT_ORIGIN'}};
  const params=new URLSearchParams();
  params.set('mode','subscription');
  params.set('line_items[0][price]',env.STRIPE_PRICE_ID);
  params.set('line_items[0][quantity]','1');
  params.set('customer_email',owner);
  params.set('client_reference_id',identity.id||owner);
  params.set('success_url','https://member.ball46.com/success?session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url','https://member.ball46.com/pricing?canceled=1');
  params.set('allow_promotion_codes','true');
  try{
    const response=await fetcher('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',
      headers:{
        authorization:'Bearer '+env.STRIPE_SECRET_KEY,
        'content-type':'application/x-www-form-urlencoded',
        'Stripe-Version':'2025-06-30.basil'
      },
      body:params.toString(),
      signal:AbortSignal.timeout(12000)
    });
    const result=await response.json();
    if(!response.ok||!/^https:\/\/checkout\.stripe\.com\//.test(String(result?.url||'')))
      return {status:502,body:{ok:false,error:'STRIPE_CHECKOUT_UNAVAILABLE'}};
    return {status:303,url:result.url};
  }catch{return {status:502,body:{ok:false,error:'STRIPE_CHECKOUT_UNAVAILABLE'}}}
}
