// Customer checkout: verified email identity is required. Checkout never grants entitlement.
// The protected app requires verified Cloudflare Access identity and a live Stripe subscription.
export async function createMemberCheckout(identity, env, origin, fetcher=fetch){
  if(env.MEMBER_CHECKOUT_ENABLED!=='true') return {status:503,body:{ok:false,error:'MEMBER_CHECKOUT_DISABLED'}};
  const email=String(identity?.email||'').trim().toLowerCase();
  if(!identity?.id || !email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))
    return {status:401,body:{ok:false,error:'VERIFIED_IDENTITY_REQUIRED'}};
  if(!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID)
    return {status:503,body:{ok:false,error:'STRIPE_NOT_CONFIGURED'}};
  const base=new URL(origin);
  if(base.protocol!=='https:' || !['member.ball46.com','ball46-member-production.mccarey-supon.workers.dev'].includes(base.hostname))
    return {status:400,body:{ok:false,error:'INVALID_CHECKOUT_ORIGIN'}};
  const params=new URLSearchParams();
  params.set('mode','subscription');
  params.set('line_items[0][price]',env.STRIPE_PRICE_ID);
  params.set('line_items[0][quantity]','1');
  params.set('customer_email',email);
  params.set('client_reference_id',identity.id);
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
