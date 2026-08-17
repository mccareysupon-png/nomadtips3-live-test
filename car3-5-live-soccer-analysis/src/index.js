import {fetchDirectFrame,fetchAnimation} from './goaloo-direct.js';
import {DEFAULT_CONFIG,normConfig,evaluate,makeRecord,settleRecord} from './car35-engine.js';
const BRAND_CSS=`<style id="car35-brand-nav">.brand{font-family:Arial,Helvetica,sans-serif!important;font-weight:900!important;letter-spacing:-1.1px!important;text-decoration:none!important;white-space:nowrap!important;color:#fff!important}.brand .brand-nomad{color:#fff!important}.brand .brand-tips{color:#f3c623!important}.bottom-nav{left:0!important;right:0!important;bottom:0!important;width:100%!important;max-width:none!important;transform:none!important;border-left:0!important;border-right:0!important;border-radius:0!important}</style>`;
const BRAND_JS=`<script id="car35-brand-script">(()=>{const apply=()=>{document.querySelectorAll('.brand').forEach(el=>{el.setAttribute('aria-label','nomadtips3 home');el.innerHTML='<span class="brand-nomad">nomad</span><span class="brand-tips">tips3</span>';});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();})();<\/script>`;
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-owner-key'};
const OLD='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...H,'cache-control':cache}});
const day=()=>new Date().toISOString().slice(0,10);
function stub(env){const id=env.CAR35_STATE.idFromName('primary');return env.CAR35_STATE.get(id)}
async function stateJson(env,path,init){return stub(env).fetch(`https://car35.local${path}`,init)}
function ownerOk(req,env){const expected=String(env.CAR35_OWNER_KEY||'').trim();return Boolean(expected)&&req.headers.get('x-owner-key')===expected}
export class Car35State{
  constructor(ctx,env){this.ctx=ctx;this.env=env}
  async get(key,fallback){const v=await this.ctx.storage.get(key);return v===undefined?fallback:v}
  async scan(){
    const config=normConfig(await this.get('config',DEFAULT_CONFIG)),snapshots=await this.get('snapshots',[]),history=await this.get('history',[]),streaks=await this.get('streaks',{});
    const frame=await fetchDirectFrame(),now=Date.now(),existingPending=new Map(history.filter(r=>!r.settledAt).map(r=>[`${r.sourceMatchId}:${r.market}:${r.selectedSide}`,r]));
    const todaySignals=history.filter(r=>String(r.selectedAt||'').startsWith(day())).length;
    let added=0;
    const matches=frame.live.map(match=>{
      let engine=evaluate(match,config,snapshots),key=`${match.sourceMatchId}:${engine.market}:${engine.selectedSide}`;
      if(existingPending.has(key)){engine={...engine,decision:'SIGNAL',confirmed:true,locked:true};streaks[key]=config.confirmationRounds}
      else if(engine.decision==='SIGNAL'){
        streaks[key]=(streaks[key]||0)+1;
        const limitOk=!config.signalLimitEnabled||(todaySignals+added)<config.maxSignalsPerDay;
        if(streaks[key]>=config.confirmationRounds&&limitOk){const record=makeRecord(match,engine);history.push(record);existingPending.set(key,record);added++;engine={...engine,decision:'SIGNAL',confirmed:true,locked:true}}
        else engine={...engine,decision:'NEAR',confirmed:false,confirmationProgress:streaks[key],confirmationRequired:config.confirmationRounds}
      }else{streaks[key]=0}
      return{...match,engine,pressure:engine.pressure,activity:{type:'LIVE ACTIVITY',team:engine.selectedSide}}
    });
    const byId=new Map(frame.all.map(m=>[String(m.sourceMatchId),m]));
    for(let i=0;i<history.length;i++){const r=history[i];if(r.settledAt)continue;const final=byId.get(String(r.sourceMatchId));if(final?.status==='FT')history[i]=settleRecord(r,final)}
    const snap={generatedAt:frame.collectedAt,matches:matches.map(m=>({sourceMatchId:m.sourceMatchId,id:m.id,minute:m.minute,score:m.score,stats:m.stats,coreStatsComplete:m.coreStatsComplete}))};
    const nextSnaps=[...snapshots,snap].filter(s=>now-Date.parse(s.generatedAt||0)<=45*60*1000).slice(-180);
    const live={ok:true,engine:'CAR 3.5',source:'GOALOO_DIRECT',generatedAt:frame.collectedAt,matches,sourceHealth:frame.sourceHealth};
    await this.ctx.storage.put({config,snapshots:nextSnaps,history:history.slice(-1000),streaks,live,lastScanAt:frame.collectedAt,sourceHealth:frame.sourceHealth});
    return live
  }
  async live(){const last=await this.get('lastScanAt',null);if(!last||Date.now()-Date.parse(last)>12000){try{return await this.scan()}catch(e){const cached=await this.get('live',null);if(cached)return{...cached,stale:true,error:String(e?.message||e)}}}return await this.get('live',{ok:true,engine:'CAR 3.5',source:'GOALOO_DIRECT',generatedAt:null,matches:[]})}
  async fetch(request){
    const u=new URL(request.url),p=u.pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:H});
    try{
      if(p==='/scan'&&request.method==='POST')return json(await this.scan());
      if(p==='/live')return json(await this.live());
      if(p==='/health'){const last=await this.get('lastScanAt',null),health=await this.get('sourceHealth',{});return json({ok:true,engine:'CAR 3.5',mode:'DIRECT_GOALOO',source:'GOALOO_DIRECT',lastScanAt:last,ageSeconds:last?Math.max(0,Math.round((Date.now()-Date.parse(last))/1000)):null,sourceHealth:health})}
      if(p==='/config'&&request.method==='GET')return json({ok:true,config:normConfig(await this.get('config',DEFAULT_CONFIG)),source:'CAR35_LOCAL'});
      if(p==='/config'&&request.method==='POST'){const body=await request.json().catch(()=>({})),config=normConfig(body?.config||body);await this.ctx.storage.put('config',config);return json({ok:true,config})}
      if(p==='/snapshots'){const snapshots=await this.get('snapshots',[]);return json({ok:true,snapshots,items:snapshots})}
      if(p==='/history'){const records=(await this.get('history',[])).slice().reverse(),page=Math.max(1,Number(u.searchParams.get('page'))||1),limit=Math.max(1,Math.min(250,Number(u.searchParams.get('limit'))||100)),start=(page-1)*limit,settled=records.filter(r=>r.settledAt),wins=settled.filter(r=>r.resultGroup==='W').length,losses=settled.filter(r=>r.resultGroup==='L').length,net=settled.reduce((s,r)=>s+(Number(r.netUnits)||0),0);return json({ok:true,source:'CAR35_LOCAL_GOALOO_DIRECT',page,limit,total:records.length,records:records.slice(start,start+limit),items:records.slice(start,start+limit),summary:{signals:records.length,settled:settled.length,wins,losses,winRate:settled.length?Number((wins/settled.length*100).toFixed(1)):0,netUnits:Number(net.toFixed(3))}})}
      if(p==='/match'){const id=String(u.searchParams.get('id')||''),live=await this.live(),match=(live.matches||[]).find(m=>String(m.sourceMatchId)===id);return match?json({ok:true,match}):json({ok:false,reason:'MATCH_NOT_LIVE'},404)}
      return json({ok:false,reason:'NOT_FOUND'},404)
    }catch(e){return json({ok:false,error:String(e?.message||e)},500)}
  }
}
async function dynamic(request,env){
  const u=new URL(request.url),p=u.pathname;
  if(p==='/animation'){
    const id=String(u.searchParams.get('id')||'').trim();if(!/^\d+$/.test(id))return json({ok:false,reason:'INVALID_MATCH_ID'},400);
    const mr=await stateJson(env,`/match?id=${encodeURIComponent(id)}`),mp=await mr.json().catch(()=>null);if(!mr.ok||!mp?.match)return json({ok:false,matchId:id,reason:'MATCH_NOT_IN_CURRENT_CAR35_LIVE_FEED'},404);
    try{return json(await fetchAnimation(mp.match),200,'public, max-age=1')}catch(e){return json({ok:false,matchId:id,reason:'ANIMATION_SOURCE_UNAVAILABLE',error:String(e?.message||e)},200,'public, max-age=1')}
  }
  if(['/live','/health','/snapshots','/history'].includes(p))return stateJson(env,`${p}${u.search}`);
  if(p==='/config'){
    if(request.method==='GET')return stateJson(env,p);
    if(request.method==='POST'){if(!String(env.CAR35_OWNER_KEY||'').trim())return json({ok:false,reason:'CAR35_OWNER_KEY_NOT_CONFIGURED'},503);if(!ownerOk(request,env))return json({ok:false,reason:'UNAUTHORIZED'},401);return stateJson(env,p,{method:'POST',headers:{'content-type':'application/json'},body:await request.text()})}
  }
  if(p==='/scan'&&request.method==='POST'){if(!ownerOk(request,env))return json({ok:false,reason:'UNAUTHORIZED'},401);return stateJson(env,p,{method:'POST'})}
  return null
}
async function staticResponse(request,env){const response=await env.ASSETS.fetch(request),ct=response.headers.get('content-type')||'';if(!response.ok||(!ct.includes('text/')&&!ct.includes('javascript')&&!ct.includes('json')))return response;const origin=new URL(request.url).origin;let text=(await response.text()).replaceAll(OLD,origin).replaceAll('CAR_3_1_NORMALIZED_GOALOO','GOALOO_DIRECT').replaceAll('READ_ONLY_PRESENTATION','DIRECT_GOALOO');if(ct.includes('text/html'))text=text.replace('</head>',`${BRAND_CSS}${BRAND_JS}</head>`);const h=new Headers(response.headers);h.set('cache-control','no-store');return new Response(text,{status:response.status,headers:h})}
export default{
  async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/owner-settings'||url.pathname==='/owner-settings.html')return Response.redirect(new URL('/owner-control.html?rev=20260818-direct-goaloo',url),302);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:H});const d=await dynamic(request,env);return d||staticResponse(request,env)},
  async scheduled(event,env,ctx){ctx.waitUntil(stateJson(env,'/scan',{method:'POST'}).then(r=>r.text()).catch(()=>null))}
};