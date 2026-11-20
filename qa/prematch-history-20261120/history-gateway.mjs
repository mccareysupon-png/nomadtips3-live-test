// Test-only gateway candidate. Must run inside the same central HUB quota authority as live/rich.
// Never connect this to an independent API key or a second live poller.
const integer=s=>/^[1-9]\d{0,15}$/.test(String(s))&&Number.isSafeInteger(Number(s))?Number(s):null;
export function parseHistoryPath(path,now){
 if(typeof path!=='string'||path.length>420||!path.startsWith('/v1/'))throw Error('INVALID_HISTORY_PATH');
 const u=new URL(path,'https://history.invalid'),m=/^\/v1\/leagues\/([1-9]\d{0,15})\/fixtures$/.exec(u.pathname),daily=u.pathname==='/v1/fixtures';
 if(u.origin!=='https://history.invalid'||u.hash||(!daily&&!m)||(m&&!integer(m[1])))throw Error('INVALID_HISTORY_PATH');
 const q=u.searchParams,keys=[...q.keys()].sort().join(','),s=q.get('season'),start=integer(q.get('start_time')),end=integer(q.get('end_time')),page=integer(q.get('page'));
 const seasonal=!!m&&/^(?:\d{4}|\d{2}\/\d{2}|\d{4}\/\d{2}|\d{4}\/\d{4})$/.test(s??'')&&keys==='page,per_page,season,status';
 const window=keys==='end_time,page,per_page,start_time,status'&&start&&end&&end>start&&end<=now&&(!daily||end-start<=86400);
 if((!seasonal&&!window)||q.get('status')!=='finished'||q.get('per_page')!=='100'||!page||page>200)throw Error('INVALID_HISTORY_PARAMETERS');
 const params={status:'finished',per_page:'100',page:String(page)};
 if(seasonal)params.season=s;else{params.start_time=String(start);params.end_time=String(end)}
 return {path:u.pathname+'?'+new URLSearchParams(params),league:m?integer(m[1]):null,page};
}
// This pure decision is called WITHIN a shared atomic reservation transaction,
// not on a separately cached health response. Unknown/stale quota => zero calls.
// Reserve at least 12 requests for existing traffic; limit background to 1 per minute.
export function decideHistoryQuota(t,now){
 if(!t||t.sharedAllTraffic!==true||!Number.isFinite(t.resetAt)||t.resetAt<=now||!Number.isInteger(t.remaining)||t.remaining<0||t.remaining>40||!Number.isFinite(t.observedAt)||t.observedAt>now||now-t.observedAt>15000||!Number.isInteger(t.pending)||t.pending<0)return 'UNVERIFIED_QUOTA';
 if(Number(t.backoffUntil)>now)return 'PROVIDER_COOLDOWN';
 if(t.liveWaiting||t.richWaiting||t.liveInFlight)return 'LIVE_PRIORITY';
 if(t.lastHistoryAt!=null&&(!Number.isFinite(t.lastHistoryAt)||now-t.lastHistoryAt<60000))return 'HISTORY_PACE';
 if(t.remaining-t.pending<=12)return 'RESERVED_HEADROOM';
 return 'ALLOW';
}
export function makeHistoryGateway({authorize,reserve,call,observe,failed,clock=Date.now}={}){
 if([authorize,reserve,call,observe,failed].some(x=>typeof x!=='function'))throw Error('SHARED_HUB_ADAPTER_REQUIRED');
 let busy=false;
 return async function handle(request){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/internal/prematch-history/page')return Response.json({error:'NOT_FOUND'},{status:404});
  if(!await authorize(request))return Response.json({error:'NOT_FOUND'},{status:404});
  let p;try{const j=await request.json();if(!j||Object.keys(j).join(',')!=='path')throw Error('INVALID');p=parseHistoryPath(j.path,Math.floor(clock()/1000))}catch{return Response.json({error:'INVALID_HISTORY_QUERY'},{status:400})}
  if(busy)return Response.json({state:'deferred_budget',reason:'HISTORY_IN_FLIGHT'});
  busy=true;let lease;
  try{
   // reserve() must atomically test sharedAllTraffic and decideHistoryQuota while
   // claiming a slot, tracking it alongside Live and Rich. No fallback on error.
   lease=await reserve({kind:'PREMATCH_HISTORY',decision:decideHistoryQuota,path:p.path});
   if(!lease?.allowed||!lease.id)return Response.json({state:'deferred_budget',reason:lease?.reason??'NO_ATOMIC_RESERVATION'});
   let response;
   try{response=await call(p.path,lease)}catch{await failed(lease);return Response.json({state:'transport_error',status:502})}
   // Must commit provider header observations and backoff before returning.
   try{await observe(response,lease)}catch{return Response.json({state:'quota_unconfirmed',status:502})}
   const status=response.status,retryAfter=response.headers.get('retry-after');
   if(status===429){const seconds=Number(retryAfter),date=Date.parse(retryAfter??'');const delay=retryAfter&&Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):Number.isFinite(date)?Math.max(1,Math.ceil((date-clock())/1000)):60;return Response.json({status,retryAfter:delay})}
   // Merges are unresolved, no automatic redirect and no unbounded follow-up.
   if(status!==200)return Response.json({status,state:status===301?'league_moved_review':'provider_error'});
   let body;try{body=await response.json()}catch{return Response.json({status:502,state:'invalid_json'})}
   if(body?.success!==1||!Array.isArray(body.data)||body.data.length>100||body.pagination?.page!==p.page||typeof body.pagination?.has_more!=='boolean')return Response.json({status:502,state:'invalid_payload'});
   // Existing consumer checks fixture IDs, status, kickoff window and scores.
   return Response.json({status,body});
  }catch{return Response.json({state:'deferred_budget',reason:'GATEWAY_FAIL_CLOSED'})}finally{busy=false}
 };
}
