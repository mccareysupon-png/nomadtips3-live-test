// Cloudflare Access identity + Stripe subscription authorization.
// Both independent checks are required. Missing configuration always denies access.
function decodeJson64(value){
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
}
async function verifyAccessIdentity(request,env){
  const team=String(env.CF_ACCESS_TEAM_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  const aud=String(env.CF_ACCESS_AUD||'');
  if(!team||!aud||!/^[-a-zA-Z0-9.]+\.cloudflareaccess\.com$/.test(team))return null;
  const jwt=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!jwt)return null;
  const parts=jwt.split('.');
  if(parts.length!==3)return null;
  try{
    const header=decodeJson64(parts[0]),claims=decodeJson64(parts[1]);
    const now=Math.floor(Date.now()/1000);
    if(header.alg!=='RS256'||!header.kid||!claims.sub||!claims.email||
       claims.iss!=='https://'+team||!Array.isArray(claims.aud)||!claims.aud.includes(aud)||
       !Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||
       (claims.nbf!=null&&claims.nbf>now))return null;
    const jwksResponse=await fetch('https://'+team+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(7000)});
    if(!jwksResponse.ok)return null;
    const jwks=await jwksResponse.json();
    const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
    if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signature=Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(parts[0]+'.'+parts[1]));
    if(!ok)return null;
    return {id:claims.sub,email:String(claims.email).trim().toLowerCase()};
  }catch{return null}
}
// Stripe API 2025-03-31+ stores the current billing period on subscription items.
// Require the period on the item for *our* configured price, not another plan.
export function entitledPeriodEnd(subscription,priceId,now=Math.floor(Date.now()/1000)){
  if(!subscription || !['active','trialing'].includes(subscription.status) || !priceId)return null;
  const matching=(subscription.items?.data||[]).filter(item=>item?.price?.id===priceId);
  const future=matching.map(item=>Number(item.current_period_end ?? subscription.current_period_end))
    .filter(t=>Number.isSafeInteger(t)&&t>now);
  return future.length ? Math.min(...future) : null;
}

async function paidEntitlement(identity,env){
  if(!identity||!env.STRIPE_SECRET_KEY||!env.STRIPE_PRICE_ID)return null;
  try{
    const headers={authorization:'Bearer '+env.STRIPE_SECRET_KEY};
    const c=await fetch('https://api.stripe.com/v1/customers?email='+encodeURIComponent(identity.email)+'&limit=100',{headers,signal:AbortSignal.timeout(8000)});
    if(!c.ok)return null;
    const customers=await c.json();
    const now=Math.floor(Date.now()/1000);
    for(const customer of customers.data||[]){
      if(customer.deleted||String(customer.email||'').trim().toLowerCase()!==identity.email)continue;
      const r=await fetch('https://api.stripe.com/v1/subscriptions?customer='+encodeURIComponent(customer.id)+'&status=all&limit=100',{headers,signal:AbortSignal.timeout(8000)});
      if(!r.ok)return null;
      const subscriptions=await r.json();
      for(const sub of subscriptions.data||[]){
        const periodEnd=entitledPeriodEnd(sub,env.STRIPE_PRICE_ID,now);
        if(periodEnd===null)continue;
        return {displayName:identity.email.split('@')[0],status:'ACTIVE',plan:'BALL46 MEMBER',
          role:'MEMBER',accessType:'SUBSCRIPTION',expiresAt:periodEnd*1000,
          currentPeriodEnd:periodEnd*1000,cancelAtPeriodEnd:Boolean(sub.cancel_at_period_end)};
      }
    }
  }catch{return null}
  return null;
}
export async function memberAccess(request,env){
  const identity=await verifyAccessIdentity(request,env);
  if(!identity)return null;
  return paidEntitlement(identity,env);
}
