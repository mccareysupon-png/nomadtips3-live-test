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
      const r=await fetch('https://api.stripe.com/v1/subscriptions?customer='+encodeURIComponent(customer.id)+'&status=all&limit=100&expand%5B%5D=data.latest_invoice',{headers,signal:AbortSignal.timeout(8000)});
      if(!r.ok)return null;
      const subscriptions=await r.json();
      for(const sub of subscriptions.data||[]){
        if(sub.status!=='active'||sub.latest_invoice?.status!=='paid')continue;
        if(sub.ended_at!=null&&(!Number.isFinite(sub.ended_at)||sub.ended_at<=now))continue;
        const matchingItems=(sub.items?.data||[]).filter(i=>i.price?.id===env.STRIPE_PRICE_ID);
        let periodEnd=null;
        for(const item of matchingItems){
          // Basil and later put the period on the item; older API versions put it on the subscription.
          let end=Object.hasOwn(item,'current_period_end')?item.current_period_end:sub.current_period_end;
          if(sub.cancel_at!=null){
            if(!Number.isFinite(sub.cancel_at)){end=null}
            else if(Number.isFinite(end)){end=Math.min(end,sub.cancel_at)}
          }
          if(Number.isFinite(end)&&end>now)periodEnd=Math.max(periodEnd||0,end);
        }
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
