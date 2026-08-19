const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type,x-admin-token,stripe-signature,x-line-signature'
};
const PAIR_TTL_MS=24*60*60*1000;
const MAX_SEEN_SIGNALS=300;
const LINE_API='https://api.line.me/v2/bot/message';
const DEFAULT_CAR34='https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev';
const DEFAULT_LIVE_URL='https://mccareysupon-png.github.io/nomadtips3-live-test/car3-4-real-market-audit/web/';

const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});
const textEncoder=new TextEncoder();
const nowIso=()=>new Date().toISOString();
const clean=v=>String(v??'').trim();
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const safeEq=(a,b)=>{a=String(a||'');b=String(b||'');let diff=a.length^b.length;const len=Math.max(a.length,b.length);for(let i=0;i<len;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const b64=bytes=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s);};

async function hmac(secret,payload,format='hex'){
  const key=await crypto.subtle.importKey('raw',textEncoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,textEncoder.encode(payload));
  return format==='base64'?b64(sig):hex(sig);
}
async function verifyLineSignature(raw,header,secret){
  if(!secret||!header)return false;
  return safeEq(await hmac(secret,raw,'base64'),header);
}
async function verifyStripeSignature(raw,header,secret){
  if(!secret||!header)return false;
  const parts=String(header).split(',').map(x=>x.trim());
  const t=parts.find(x=>x.startsWith('t='))?.slice(2);
  const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!t||!signatures.length)return false;
  const ts=Number(t);
  if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>300)return false;
  const expected=await hmac(secret,`${t}.${raw}`,'hex');
  return signatures.some(sig=>safeEq(expected,sig));
}
function randomCode(len=8){
  const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes=new Uint8Array(len);crypto.getRandomValues(bytes);
  return [...bytes].map(v=>alphabet[v%alphabet.length]).join('');
}
function stripePairCode(session){
  const fields=Array.isArray(session?.custom_fields)?session.custom_fields:[];
  const field=fields.find(f=>f?.key==='line_pair_code');
  return clean(field?.text?.value||field?.numeric?.value||field?.dropdown?.value).toUpperCase();
}
function stripeSubscriptionId(obj){
  return clean(obj?.subscription||obj?.parent?.subscription_details?.subscription||obj?.subscription_details?.subscription);
}
function stripeCustomerId(obj){
  const v=obj?.customer;
  return clean(typeof v==='string'?v:v?.id);
}
function subscriptionState(status){
  status=String(status||'').toLowerCase();
  if(['active','trialing'].includes(status))return'ACTIVE';
  if(['past_due','unpaid','paused'].includes(status))return'PAST_DUE';
  if(['canceled','incomplete_expired'].includes(status))return'CANCELED';
  return'PENDING';
}
async function stateFetch(env,path,payload){
  const id=env.MEMBERSHIP_STATE.idFromName('global');
  const stub=env.MEMBERSHIP_STATE.get(id);
  return stub.fetch(`https://state${path}`,payload===undefined?undefined:{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
  });
}
async function stateJson(env,path,payload){
  const r=await stateFetch(env,path,payload);
  return r.json();
}
async function lineRequest(env,kind,body){
  if(!env.LINE_CHANNEL_ACCESS_TOKEN)throw new Error('LINE_CHANNEL_ACCESS_TOKEN_MISSING');
  const r=await fetch(`${LINE_API}/${kind}`,{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`},
    body:JSON.stringify(body)
  });
  if(!r.ok)throw new Error(`LINE_${kind.toUpperCase()}_${r.status}:${(await r.text()).slice(0,180)}`);
  return true;
}
const lineReply=(env,replyToken,text)=>replyToken?lineRequest(env,'reply',{replyToken,messages:[{type:'text',text:String(text).slice(0,5000)}]}):Promise.resolve(false);
const linePush=(env,to,text)=>lineRequest(env,'push',{to,messages:[{type:'text',text:String(text).slice(0,5000)}]});

function fmtLine(value){
  const n=num(value);if(n===null)return'—';
  const s=Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return n>0?`+${s}`:s;
}
function signalKey(r){
  return [r?.selectedAt||'',r?.home||'',r?.away||'',r?.selectedTeam||r?.selectedSide||'',r?.selectedLine??r?.line??'',r?.odds??''].join('|');
}
function signalMessage(r,env){
  const entry=r?.entryScore?`${r.entryScore.home??'—'}-${r.entryScore.away??'—'}`:'—';
  const minute=num(r?.entryMinute);
  const when=minute!==null?`${Math.round(minute)}'`:'LIVE';
  const team=r?.selectedTeam||r?.selectedSide||'—';
  const liveUrl=env.PUBLIC_LIVE_URL||DEFAULT_LIVE_URL;
  return [
    'NOMADTIPS3 · LIVE SIGNAL',
    `${r?.home||'—'} vs ${r?.away||'—'}`,
    `Pick: ${team} ${fmtLine(r?.selectedLine??r?.line)} @ ${num(r?.odds)?.toFixed(2)||'—'}`,
    `Detected: ${when} · Score ${entry}`,
    `Locked: ${r?.selectedAt||nowIso()}`,
    liveUrl
  ].join('\n');
}

export class MembershipState{
  constructor(state,env){this.state=state;this.env=env;}
  async upsertMember(userId,patch={}){
    const key=`member:${userId}`;
    const current=await this.state.storage.get(key)||{lineUserId:userId,role:'SUBSCRIBER',status:'PENDING',createdAt:nowIso()};
    const next={...current,...patch,lineUserId:userId,updatedAt:nowIso()};
    await this.state.storage.put(key,next);
    const index=await this.state.storage.get('members:index')||[];
    if(!index.includes(userId))await this.state.storage.put('members:index',[...index,userId]);
    if(next.stripeSubscriptionId)await this.state.storage.put(`subscription:${next.stripeSubscriptionId}`,userId);
    if(next.stripeCustomerId)await this.state.storage.put(`customer:${next.stripeCustomerId}`,userId);
    return next;
  }
  async memberForStripe(subscriptionId,customerId){
    let userId=null;
    if(subscriptionId)userId=await this.state.storage.get(`subscription:${subscriptionId}`);
    if(!userId&&customerId)userId=await this.state.storage.get(`customer:${customerId}`);
    return userId||null;
  }
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health'){
      const ids=await this.state.storage.get('members:index')||[];
      let active=0,owners=0;
      for(const id of ids){
        const m=await this.state.storage.get(`member:${id}`);
        if(m?.status==='ACTIVE')active++;
        if(m?.role==='OWNER')owners++;
      }
      return json({ok:true,members:ids.length,active,owners,initialized:Boolean(await this.state.storage.get('signals:initialized')),lastPoll:await this.state.storage.get('lastPoll')||null,lastSignalAt:await this.state.storage.get('lastSignalAt')||null,lastError:await this.state.storage.get('lastError')||null});
    }
    if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    const body=await request.json().catch(()=>({}));
    if(url.pathname==='/pair/start'){
      const userId=clean(body.userId);if(!userId)return json({ok:false,error:'USER_REQUIRED'},400);
      const member=await this.state.storage.get(`member:${userId}`);
      if(member?.role==='OWNER'&&member?.status==='ACTIVE')return json({ok:true,owner:true,member});
      let code=randomCode();
      while(await this.state.storage.get(`pair:${code}`))code=randomCode();
      const pair={code,userId,createdAt:nowIso(),expiresAt:new Date(Date.now()+PAIR_TTL_MS).toISOString()};
      await this.state.storage.put(`pair:${code}`,pair);
      return json({ok:true,code,expiresAt:pair.expiresAt,status:member?.status||'PENDING'});
    }
    if(url.pathname==='/member/status'){
      const userId=clean(body.userId);const member=userId?await this.state.storage.get(`member:${userId}`):null;
      return json({ok:true,member:member||null});
    }
    if(url.pathname==='/owner/activate'){
      const userId=clean(body.userId);if(!userId)return json({ok:false,error:'USER_REQUIRED'},400);
      return json({ok:true,member:await this.upsertMember(userId,{role:'OWNER',status:'ACTIVE',entitlementSource:'OWNER_ALLOWLIST'})});
    }
    if(url.pathname==='/stripe/checkout'){
      const code=clean(body.pairCode).toUpperCase();
      const pair=code?await this.state.storage.get(`pair:${code}`):null;
      if(!pair)return json({ok:false,error:'PAIR_CODE_NOT_FOUND'},404);
      if(Date.parse(pair.expiresAt)<Date.now())return json({ok:false,error:'PAIR_CODE_EXPIRED'},410);
      const status=['paid','no_payment_required'].includes(String(body.paymentStatus||'').toLowerCase())?'ACTIVE':'PENDING';
      const member=await this.upsertMember(pair.userId,{
        role:'SUBSCRIBER',status,entitlementSource:'STRIPE',
        stripeCustomerId:clean(body.customerId)||null,
        stripeSubscriptionId:clean(body.subscriptionId)||null,
        email:clean(body.email)||null,
        checkoutSessionId:clean(body.sessionId)||null,
        pairedAt:nowIso()
      });
      await this.state.storage.delete(`pair:${code}`);
      return json({ok:true,userId:pair.userId,member});
    }
    if(url.pathname==='/stripe/status'){
      const subscriptionId=clean(body.subscriptionId),customerId=clean(body.customerId);
      const userId=await this.memberForStripe(subscriptionId,customerId);
      if(!userId)return json({ok:false,error:'MEMBER_NOT_MAPPED'},404);
      const existing=await this.state.storage.get(`member:${userId}`);
      if(existing?.role==='OWNER')return json({ok:true,userId,member:existing,ownerBypass:true});
      const member=await this.upsertMember(userId,{status:clean(body.status)||'PENDING',stripeSubscriptionId:subscriptionId||existing?.stripeSubscriptionId||null,stripeCustomerId:customerId||existing?.stripeCustomerId||null,lastStripeEvent:clean(body.eventType)||null});
      return json({ok:true,userId,member});
    }
    if(url.pathname==='/members/active'){
      const ids=await this.state.storage.get('members:index')||[],members=[];
      for(const id of ids){const m=await this.state.storage.get(`member:${id}`);if(m?.status==='ACTIVE')members.push(m);}
      return json({ok:true,members});
    }
    if(url.pathname==='/signals/claim'){
      const records=Array.isArray(body.records)?body.records:[];
      const keys=records.map(signalKey).filter(Boolean);
      let seen=await this.state.storage.get('signals:seen')||[];
      const initialized=Boolean(await this.state.storage.get('signals:initialized'));
      if(!initialized){
        seen=[...new Set([...seen,...keys])].slice(-MAX_SEEN_SIGNALS);
        await this.state.storage.put('signals:seen',seen);
        await this.state.storage.put('signals:initialized',true);
        await this.state.storage.put('lastPoll',nowIso());
        return json({ok:true,initializedNow:true,newKeys:[]});
      }
      const set=new Set(seen),newKeys=keys.filter(k=>!set.has(k));
      seen=[...seen,...newKeys].slice(-MAX_SEEN_SIGNALS);
      await this.state.storage.put('signals:seen',seen);
      await this.state.storage.put('lastPoll',nowIso());
      if(newKeys.length)await this.state.storage.put('lastSignalAt',nowIso());
      return json({ok:true,newKeys});
    }
    if(url.pathname==='/ops/result'){
      if(body.error)await this.state.storage.put('lastError',String(body.error).slice(0,500));
      else await this.state.storage.delete('lastError');
      if(body.lastPoll)await this.state.storage.put('lastPoll',body.lastPoll);
      return json({ok:true});
    }
    return json({ok:false,error:'NOT_FOUND'},404);
  }
}

async function handleLineWebhook(request,env){
  const raw=await request.text();
  const signature=request.headers.get('x-line-signature')||'';
  if(!await verifyLineSignature(raw,signature,env.LINE_CHANNEL_SECRET))return json({ok:false,error:'INVALID_LINE_SIGNATURE'},401);
  const payload=JSON.parse(raw||'{}');
  for(const event of payload.events||[]){
    const userId=clean(event?.source?.userId),replyToken=clean(event?.replyToken);
    if(!userId)continue;
    if(event.type==='follow'){
      await lineReply(env,replyToken,'NOMADTIPS3 LINE Alerts\nSend JOIN to get your payment pairing code.\nSend STATUS to check alert access.');
      continue;
    }
    if(event.type!=='message'||event?.message?.type!=='text')continue;
    const message=clean(event.message.text),upper=message.toUpperCase();
    if(upper==='JOIN'){
      const out=await stateJson(env,'/pair/start',{userId});
      if(out.owner)await lineReply(env,replyToken,'OWNER access is ACTIVE. You receive locked CAR 3.4 signal alerts without subscription.');
      else if(out.code)await lineReply(env,replyToken,`Your pairing code: ${out.code}\nEnter this code on the $30/month Stripe checkout page. Code expires in 24 hours.`);
      else await lineReply(env,replyToken,'Could not create a pairing code. Please try again.');
      continue;
    }
    if(upper==='STATUS'){
      const out=await stateJson(env,'/member/status',{userId}),m=out.member;
      await lineReply(env,replyToken,m?`NOMADTIPS3 Alerts: ${m.status}${m.role==='OWNER'?' · OWNER':''}`:'NOMADTIPS3 Alerts: NOT ACTIVE\nSend JOIN to subscribe.');
      continue;
    }
    if(upper.startsWith('OWNER ')){
      const supplied=message.slice(6).trim();
      if(!env.OWNER_PAIR_SECRET||!safeEq(supplied,env.OWNER_PAIR_SECRET)){await lineReply(env,replyToken,'Owner code not accepted.');continue;}
      await stateJson(env,'/owner/activate',{userId});
      await lineReply(env,replyToken,'OWNER access activated. Locked CAR 3.4 signals will be sent to this LINE account.');
      continue;
    }
    await lineReply(env,replyToken,'Commands: JOIN · STATUS');
  }
  return json({ok:true});
}

async function handleStripeWebhook(request,env){
  const raw=await request.text();
  const signature=request.headers.get('stripe-signature')||'';
  if(!await verifyStripeSignature(raw,signature,env.STRIPE_WEBHOOK_SECRET))return json({ok:false,error:'INVALID_STRIPE_SIGNATURE'},401);
  const event=JSON.parse(raw||'{}'),obj=event?.data?.object||{};
  if(event.type==='checkout.session.completed'){
    const pairCode=stripePairCode(obj);
    const out=await stateJson(env,'/stripe/checkout',{
      pairCode,customerId:stripeCustomerId(obj),subscriptionId:stripeSubscriptionId(obj),
      email:obj?.customer_details?.email||obj?.customer_email||null,
      paymentStatus:obj?.payment_status||null,sessionId:obj?.id||null
    });
    if(out?.userId&&out?.member?.status==='ACTIVE'){
      await linePush(env,out.userId,'NOMADTIPS3 LINE Alerts activated.\nPlan: $30/month\nStatus: ACTIVE\nLocked CAR 3.4 signals will be sent here.');
    }
  }else if(event.type==='invoice.paid'||event.type==='invoice.payment_failed'){
    const status=event.type==='invoice.paid'?'ACTIVE':'PAST_DUE';
    const out=await stateJson(env,'/stripe/status',{subscriptionId:stripeSubscriptionId(obj),customerId:stripeCustomerId(obj),status,eventType:event.type});
    if(out?.userId&&!out.ownerBypass){
      await linePush(env,out.userId,status==='ACTIVE'?'NOMADTIPS3 LINE Alerts payment confirmed. Access is ACTIVE.':'NOMADTIPS3 LINE Alerts payment failed. Alerts are paused until Stripe confirms payment.');
    }
  }else if(event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
    const status=event.type==='customer.subscription.deleted'?'CANCELED':subscriptionState(obj?.status);
    const out=await stateJson(env,'/stripe/status',{subscriptionId:clean(obj?.id),customerId:stripeCustomerId(obj),status,eventType:event.type});
    if(out?.userId&&!out.ownerBypass&&['PAST_DUE','CANCELED'].includes(status)){
      await linePush(env,out.userId,status==='CANCELED'?'NOMADTIPS3 LINE Alerts subscription canceled. Alerts are now disabled.':'NOMADTIPS3 LINE Alerts subscription needs payment. Alerts are temporarily paused.');
    }
  }
  return json({received:true});
}

async function pollSignals(env){
  const base=env.CAR34_WORKER_URL||DEFAULT_CAR34;
  try{
    if(!env.LINE_CHANNEL_ACCESS_TOKEN)throw new Error('LINE_CHANNEL_ACCESS_TOKEN_MISSING');
    const r=await fetch(`${base}/history?page=1&limit=25`,{headers:{accept:'application/json'},cf:{cacheTtl:0,cacheEverything:false}});
    if(!r.ok)throw new Error(`CAR34_HISTORY_${r.status}`);
    const payload=await r.json(),records=(payload.records||[]).filter(x=>x?.selectedAt).sort((a,b)=>Date.parse(a.selectedAt)-Date.parse(b.selectedAt));
    const claim=await stateJson(env,'/signals/claim',{records});
    if(!claim.newKeys?.length){await stateJson(env,'/ops/result',{lastPoll:nowIso()});return{sent:0,newSignals:0};}
    const keySet=new Set(claim.newKeys),fresh=records.filter(r=>keySet.has(signalKey(r)));
    const active=await stateJson(env,'/members/active',{}),members=active.members||[];
    let sent=0,failures=0;
    for(const signal of fresh){
      const msg=signalMessage(signal,env);
      for(const member of members){
        try{await linePush(env,member.lineUserId,msg);sent++;}catch{failures++;}
      }
    }
    await stateJson(env,'/ops/result',failures?{lastPoll:nowIso(),error:`LINE_DELIVERY_FAILURES:${failures}`}:{lastPoll:nowIso()});
    return{sent,newSignals:fresh.length,recipients:members.length,failures};
  }catch(error){
    await stateJson(env,'/ops/result',{lastPoll:nowIso(),error:String(error?.message||error)});
    return{sent:0,newSignals:0,error:String(error?.message||error)};
  }
}

function adminOk(request,env){
  const token=request.headers.get('x-admin-token')||new URL(request.url).searchParams.get('token')||'';
  return Boolean(env.OWNER_ADMIN_TOKEN)&&safeEq(token,env.OWNER_ADMIN_TOKEN);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    if(url.pathname==='/health'){
      const state=await stateJson(env,'/health');
      return json({ok:true,service:'NOMADTIPS3 CAR 3.4 LINE ALERTS',stripePaymentLink:env.STRIPE_PAYMENT_LINK||null,configured:{lineChannelSecret:Boolean(env.LINE_CHANNEL_SECRET),lineAccessToken:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),stripeWebhookSecret:Boolean(env.STRIPE_WEBHOOK_SECRET),ownerPairSecret:Boolean(env.OWNER_PAIR_SECRET),ownerAdminToken:Boolean(env.OWNER_ADMIN_TOKEN)},...state});
    }
    if(url.pathname==='/line/webhook'&&request.method==='POST')return handleLineWebhook(request,env);
    if(url.pathname==='/stripe/webhook'&&request.method==='POST')return handleStripeWebhook(request,env);
    if(url.pathname==='/payment'&&request.method==='GET'){
      const link=env.STRIPE_PAYMENT_LINK;
      return link?Response.redirect(link,302):json({ok:false,error:'PAYMENT_LINK_NOT_CONFIGURED'},503);
    }
    if(url.pathname==='/admin/test'&&request.method==='POST'){
      if(!adminOk(request,env))return json({ok:false,error:'UNAUTHORIZED'},401);
      const active=await stateJson(env,'/members/active',{}),owners=(active.members||[]).filter(m=>m.role==='OWNER');
      let sent=0;for(const owner of owners){await linePush(env,owner.lineUserId,'NOMADTIPS3 · TEST ALERT\nLINE notification system is connected and working.');sent++;}
      return json({ok:true,owners:owners.length,sent});
    }
    if(url.pathname==='/admin/poll'&&request.method==='POST'){
      if(!adminOk(request,env))return json({ok:false,error:'UNAUTHORIZED'},401);
      return json({ok:true,...await pollSignals(env)});
    }
    return json({ok:false,error:'NOT_FOUND'},404);
  },
  async scheduled(event,env,ctx){ctx.waitUntil(pollSignals(env));}
};
