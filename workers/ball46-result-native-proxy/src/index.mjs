/**
 * Private BALL46 Goaloo -> original Engine 3.43 FT auth bridge.
 * NO public route, workers.dev or cron. Engine's live 5USD token is stored
 * only here, never in the identity matcher Sidecar or its public payload.
 * Does not calculate or write a Signal/price/Unit itself.
 */
const utc=x=>typeof x==='string'&&/(Z|[+-]\d\d:\d\d)$/i.test(x)&&Number.isFinite(Date.parse(x));
const goal=x=>Number.isInteger(x)&&x>=0&&x<=30;
export function inspectFtProof(body,{now=Date.now()}={}){
 const p=body?.provenance,f=body?.fixture;
 if(!p||p.source!=='goaloo'||!f||!p.sourceFixtureId||!p.canonicalId||
    String(f.id)!==String(p.canonicalId))return {ok:false,reason:'SOURCE_IDENTITY'};
 if(!utc(p.kickoffUtc)||!utc(p.verifiedAt)||!utc(p.firstFtSeenAt)||
    Date.parse(p.verifiedAt)>now||Date.parse(p.verifiedAt)-Date.parse(p.firstFtSeenAt)<60_000||
    Date.parse(p.firstFtSeenAt)<Date.parse(p.kickoffUtc)+90*60_000)
  return {ok:false,reason:'FT_NOT_STABLE_90MIN'};
 if(!goal(f.goals?.home)||!goal(f.goals?.away)||
    f.corners?.home!=null||f.corners?.away!=null||
    f.status!=='finished'||f.status_code!=='full')
  return {ok:false,reason:'FT_SCORE_SCOPE'};
 return {ok:true};
}
export async function handlePrivateFinal(req,env){
 if(req.method!=='POST'||new URL(req.url).pathname!=='/verified-goaloo-ft')
  return new Response('NOT_FOUND',{status:404});
 const expected=String(env.RESULT_PROXY_TOKEN??''),
  actual=String(req.headers.get('x-ball46-result-auth')??'');
 if(expected.length<32||actual!==expected)
  return Response.json({ok:false,error:'UNAUTHORIZED'},{status:401});
 const key=String(env.FIVEDOLLAR_API_KEY??'');
 if(key.length<16||!env.ENGINE?.fetch)return Response.json({
  ok:false,error:'NATIVE_CREDENTIAL_OR_BINDING_UNAVAILABLE'},{status:503});
 const data=await req.json().catch(()=>null);
 const check=inspectFtProof(data);
 if(!check.ok)return Response.json({ok:false,error:check.reason},{status:422});
 const upstream=await env.ENGINE.fetch('https://engine.internal/reconcile-final',{
  method:'POST',headers:{'content-type':'application/json','x-settlement-token':key},
  body:JSON.stringify({fixture:data.fixture})
 });
 if(!upstream.ok)return Response.json({
  ok:false,error:'NATIVE_HTTP_'+upstream.status},{status:502});
 const ack=await upstream.json().catch(()=>null);
 if(ack?.ok!==true||String(ack.fixtureId)!==String(data.provenance.canonicalId)||
    ack.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||
    !Number.isInteger(ack.settled)||!Number.isInteger(ack.ledgerUpdated))
  return Response.json({ok:false,error:'NATIVE_LEDGER_V2_ACK_INVALID'},{status:502});
 return Response.json({ok:true,fixtureId:ack.fixtureId,
  nativeSettled:ack.settled,ledgerInserted:ack.ledgerInserted,
  ledgerUpdated:ack.ledgerUpdated,ledgerV2Native:true,
  requiresLedgerReadback:true});
}
export default {fetch:handlePrivateFinal};
