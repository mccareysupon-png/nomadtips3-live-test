import { Nomad343Engine as BaseNomad343Engine } from './index-bulk.js';
import { MARKET_RULES, settleMarketSignal } from './market-core.js';

const BRIDGE_VERSION='external-final-bridge-v1';
const MAX_SIGNALS=1600;
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
const now=()=>Date.now();

function isFinished(f){
  const s=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();
  return f?.boardState==='finished'||/finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s);
}
function isHalfComplete(f){
  if(isFinished(f))return true;
  const raw=`${f?.status??''} ${f?.statusCode??''}`.toLowerCase(),minute=num(f?.minute);
  return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw)||(minute!==null&&minute>=46);
}
function periodComplete(signal,fixture){
  const def=MARKET_RULES[signal?.market];
  if(!def)return false;
  return def.period==='HT'?isHalfComplete(fixture):isFinished(fixture);
}
function normalizeFinalFixture(raw){
  const d=raw?.data??raw;
  if(!d||typeof d!=='object'||(d.id===undefined&&d.fixture_id===undefined))return null;
  const status=String(d.status??d.status_code??'');
  const statusCode=d.status_code??d.statusCode??null;
  const finished=/finished|full_time|full time|\bft\b|ended|\bfull\b/i.test(`${status} ${statusCode}`);
  const minute=num(d.minute??d.elapsed??d.status?.minute??d.status?.elapsed);
  return {
    fixtureId:String(d.id??d.fixture_id),
    boardState:finished?'finished':(/live|in_play|in play|playing|half|\b1h\b|\b2h\b/i.test(`${status} ${statusCode}`)?'live':'unknown'),
    status,statusCode,minute,
    league:clone(d.league),home:clone(d.teams?.home??d.home),away:clone(d.teams?.away??d.away),
    goals:{home:num(d.goals?.home??d.score?.home),away:num(d.goals?.away??d.score?.away),halfHome:num(d.goals?.halfHome??d.goals?.half_home??d.score?.halfHome??d.score?.half_home),halfAway:num(d.goals?.halfAway??d.goals?.half_away??d.score?.halfAway??d.score?.half_away)},
    corners:{home:num(d.corners?.home),away:num(d.corners?.away),halfHome:num(d.corners?.halfHome??d.corners?.half_home),halfAway:num(d.corners?.halfAway??d.corners?.half_away)},
    cards:clone(d.cards)
  };
}
function secureTokenOk(request,env){
  const expected=String(env.FIVEDOLLAR_API_KEY||'');
  const provided=String(request.headers.get('x-settlement-token')||'');
  return expected.length>=16&&provided.length===expected.length&&provided===expected;
}

export class Nomad343Engine extends BaseNomad343Engine{
  async reconcileExternalFinal(request){
    if(!secureTokenOk(request,this.env))return Response.json({ok:false,error:'UNAUTHORIZED'},{status:401});
    const body=await request.json().catch(()=>null);
    const fixture=normalizeFinalFixture(body?.fixture??body);
    if(!fixture)return Response.json({ok:false,error:'INVALID_FIXTURE_PAYLOAD'},{status:400});
    if(!isFinished(fixture)&&!isHalfComplete(fixture))return Response.json({ok:true,version:BRIDGE_VERSION,fixtureId:fixture.fixtureId,state:'NOT_FINAL',settled:0});
    const signals=await this.ctx.storage.get('signals')||[];
    const changed=[];
    for(const s of signals){
      if(s?.status!=='PENDING'||String(s?.fixtureId)!==fixture.fixtureId||!periodComplete(s,fixture))continue;
      const result=settleMarketSignal(s,fixture);
      if(!result)continue;
      s.status='SETTLED';s.result=result;s.finalScore=clone(fixture.goals);s.finalCorners=clone(fixture.corners);s.finalCards=clone(fixture.cards);s.settledAt=now();s.settlementError=null;s.settlementSource='EXTERNAL_FINAL_BRIDGE';
      changed.push({id:s.id,market:s.market,selection:s.selection,line:s.line,result:s.result,finalScore:s.finalScore,finalCorners:s.finalCorners});
    }
    if(changed.length)await this.ctx.storage.put('signals',signals.slice(-MAX_SIGNALS));
    return Response.json({ok:true,version:BRIDGE_VERSION,fixtureId:fixture.fixtureId,finished:isFinished(fixture),settled:changed.length,rows:changed});
  }
  async fetch(request){
    const u=new URL(request.url);
    if(u.pathname==='/reconcile-final'&&request.method==='POST')return this.reconcileExternalFinal(request);
    if(u.pathname==='/bridge-health'&&request.method==='GET')return Response.json({ok:true,version:BRIDGE_VERSION});
    return super.fetch(request);
  }
}

function stub(env){return env.ENGINE.get(env.ENGINE.idFromName('global'))}
function cors(request,response){const h=new Headers(response.headers);h.set('access-control-allow-origin',request.headers.get('origin')||'*');h.set('access-control-allow-methods','GET,PUT,POST,OPTIONS');h.set('access-control-allow-headers','content-type,x-settlement-token');h.set('cache-control','no-store');return new Response(response.body,{status:response.status,headers:h})}
export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return cors(request,new Response(null,{status:204}));
    const u=new URL(request.url),allowed=['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history','/fixture-odds','/referee','/reconcile-final','/bridge-health'];
    if(!allowed.includes(u.pathname))return cors(request,new Response('Not found',{status:404}));
    return cors(request,await stub(env).fetch(new Request(`https://engine.internal${u.pathname}${u.search}`,request)));
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(stub(env).fetch('https://engine.internal/scan',{method:'POST'}))}
};
