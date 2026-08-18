import {fetchDirectFrame,fetchAnimation} from './goaloo-direct.js';
import {DEFAULT_CONFIG,normConfig,validateConfig,evaluate,makeRecord,settleRecord} from './car35-engine.js';

const BRAND_CSS=`<style id="car35-brand-nav">.brand{font-family:Arial,Helvetica,sans-serif!important;font-weight:900!important;letter-spacing:-1.1px!important;text-decoration:none!important;white-space:nowrap!important;color:#fff!important}.brand .brand-nomad{color:#fff!important}.brand .brand-tips{color:#f3c623!important}.bottom-nav{left:0!important;right:0!important;bottom:0!important;width:100%!important;max-width:none!important;transform:none!important;border-left:0!important;border-right:0!important;border-radius:0!important}</style>`;
const BRAND_JS=`<script id="car35-brand-script">(()=>{const apply=()=>{document.querySelectorAll('.brand').forEach(el=>{el.setAttribute('aria-label','nomadtips3 home');el.innerHTML='<span class="brand-nomad">nomad</span><span class="brand-tips">tips3</span>';});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();})();<\/script>`;
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'};
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...H,'cache-control':cache}});
const bangkokDay=(value=Date.now())=>new Date((typeof value==='string'?Date.parse(value):Number(value))+7*3600*1000).toISOString().slice(0,10);
const rangeDays={"30D":30,"90D":90,"6M":183,"1Y":365,"3Y":1095};
function stub(env){const id=env.CAR35_STATE.idFromName('primary');return env.CAR35_STATE.get(id)}
async function stateJson(env,path,init){return stub(env).fetch(`https://car35.local${path}`,init)}

export class Car35State{
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS signal_history(
        record_key TEXT PRIMARY KEY,
        source_match_id TEXT NOT NULL,
        selected_day TEXT NOT NULL,
        selected_at TEXT NOT NULL,
        settled_at TEXT,
        result_group TEXT NOT NULL,
        odds REAL,
        net_units REAL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_signal_history_selected_at ON signal_history(selected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_signal_history_selected_day ON signal_history(selected_day);
      CREATE INDEX IF NOT EXISTS idx_signal_history_pending ON signal_history(settled_at);
    `);
  }
  async get(key,fallback){const v=await this.ctx.storage.get(key);return v===undefined?fallback:v}
  recordKey(r){return String(r.recordKey||`${r.sourceMatchId||r.id}:${r.market||'NA'}:${r.selectedSide||'NA'}:${r.selectedAt||'legacy'}`)}
  upsertRecord(r){
    const key=this.recordKey(r),record={...r,recordKey:key};
    this.sql.exec(`INSERT OR REPLACE INTO signal_history(record_key,source_match_id,selected_day,selected_at,settled_at,result_group,odds,net_units,payload) VALUES(?,?,?,?,?,?,?,?,?)`,key,String(record.sourceMatchId||record.id||''),bangkokDay(record.selectedAt||Date.now()),String(record.selectedAt||new Date().toISOString()),record.settledAt?String(record.settledAt):null,String(record.resultGroup||record.result||'PENDING'),Number.isFinite(Number(record.odds))?Number(record.odds):null,Number.isFinite(Number(record.netUnits))?Number(record.netUnits):null,JSON.stringify(record));
    return record;
  }
  parseRows(rows){return rows.map(x=>{try{return JSON.parse(x.payload)}catch{return null}}).filter(Boolean)}
  async migrateLegacy(){
    if(await this.get('historySqlMigratedV2',false))return;
    const legacy=await this.get('history',[]);
    for(const r of legacy||[])this.upsertRecord(r);
    await this.ctx.storage.put('historySqlMigratedV2',true);
  }
  pendingRecords(){return this.parseRows(this.sql.exec(`SELECT payload FROM signal_history WHERE settled_at IS NULL ORDER BY selected_at ASC`).toArray())}
  countToday(){const row=this.sql.exec(`SELECT COUNT(*) AS n FROM signal_history WHERE selected_day=?`,bangkokDay()).toArray()[0];return Number(row?.n)||0}
  async scan(){
    await this.migrateLegacy();
    const config=normConfig(await this.get('config',DEFAULT_CONFIG)),snapshots=await this.get('snapshots',[]),streaks=await this.get('streaks',{});
    const frame=await fetchDirectFrame({bookmakerCompanyId:config.bookmakerCompanyId}),now=Date.now(),pending=this.pendingRecords();
    const existingPending=new Map(pending.map(r=>[`${r.sourceMatchId}:${r.market}:${r.selectedSide}`,r]));
    const todaySignals=this.countToday();let added=0;
    const matches=frame.live.map(match=>{
      let engine=evaluate(match,config,snapshots),key=`${match.sourceMatchId}:${engine.market}:${engine.selectedSide}`;
      if(existingPending.has(key)){
        engine={...engine,decision:'SIGNAL',confirmed:true,locked:true};streaks[key]=config.confirmationRounds;
      }else if(engine.decision==='SIGNAL'){
        streaks[key]=(streaks[key]||0)+1;
        const limitOk=!config.signalLimitEnabled||(todaySignals+added)<config.maxSignalsPerDay;
        if(streaks[key]>=config.confirmationRounds&&limitOk){
          const record=this.upsertRecord(makeRecord(match,engine));existingPending.set(key,record);added++;
          engine={...engine,decision:'SIGNAL',confirmed:true,locked:true};
        }else engine={...engine,decision:'NEAR',confirmed:false,confirmationProgress:streaks[key],confirmationRequired:config.confirmationRounds,limitReached:!limitOk};
      }else streaks[key]=0;
      return{...match,engine,pressure:engine.pressure,activity:{type:'LIVE ACTIVITY',team:engine.selectedSide}};
    });
    const byId=new Map(frame.all.map(m=>[String(m.sourceMatchId),m]));
    for(const r of this.pendingRecords()){
      const final=byId.get(String(r.sourceMatchId));
      if(final?.status==='FT')this.upsertRecord(settleRecord(r,final));
    }
    const snap={generatedAt:frame.collectedAt,matches:matches.map(m=>({sourceMatchId:m.sourceMatchId,id:m.id,minute:m.minute,score:m.score,stats:m.stats,coreStatsComplete:m.coreStatsComplete,pressure:m.engine?.pressure||m.pressure,sourceFreshnessSeconds:m.sourceFreshnessSeconds,matchConfidence:m.matchConfidence}))};
    const nextSnaps=[...snapshots,snap].filter(s=>now-Date.parse(s.generatedAt||0)<=45*60*1000).slice(-180);
    const live={ok:true,engine:'CAR 3.5',source:'GOALOO_DIRECT',generatedAt:frame.collectedAt,matches,sourceHealth:frame.sourceHealth,activeConfig:config};
    await this.ctx.storage.put({config,snapshots:nextSnaps,streaks,live,lastScanAt:frame.collectedAt,sourceHealth:frame.sourceHealth});
    return{...live,liveMatches:matches.length,candidates:matches.filter(m=>m.engine?.decision==='NEAR').length,signals:matches.filter(m=>m.engine?.decision==='SIGNAL').length,newSignals:added};
  }
  async live(){
    const last=await this.get('lastScanAt',null);
    if(!last||Date.now()-Date.parse(last)>12000){
      try{return await this.scan()}catch(e){const cached=await this.get('live',null);if(cached)return{...cached,stale:true,error:String(e?.message||e)}}
    }
    return await this.get('live',{ok:true,engine:'CAR 3.5',source:'GOALOO_DIRECT',generatedAt:null,matches:[],activeConfig:normConfig(await this.get('config',DEFAULT_CONFIG))});
  }
  historyResponse(u){
    const page=Math.max(1,Number(u.searchParams.get('page'))||1),limit=Math.max(1,Math.min(250,Number(u.searchParams.get('limit'))||25));
    const range=String(u.searchParams.get('range')||'ALL').toUpperCase(),days=rangeDays[range]||null,cutoff=days?new Date(Date.now()-days*86400000).toISOString():null;
    const where=cutoff?' WHERE selected_at>=?':'',args=cutoff?[cutoff]:[];
    const total=Number(this.sql.exec(`SELECT COUNT(*) AS n FROM signal_history${where}`,...args).toArray()[0]?.n)||0;
    const settledWhere=cutoff?' WHERE settled_at IS NOT NULL AND selected_at>=?':' WHERE settled_at IS NOT NULL';
    const s=this.sql.exec(`SELECT COUNT(*) AS settled,SUM(CASE WHEN result_group='W' THEN 1 ELSE 0 END) AS win,SUM(CASE WHEN result_group='L' THEN 1 ELSE 0 END) AS loss,SUM(CASE WHEN result_group='D' THEN 1 ELSE 0 END) AS draw,AVG(odds) AS average_odds,SUM(COALESCE(net_units,0)) AS net_units FROM signal_history${settledWhere}`,...args).toArray()[0]||{};
    const offset=(page-1)*limit,rows=this.sql.exec(`SELECT payload FROM signal_history${where} ORDER BY selected_at DESC LIMIT ? OFFSET ?`,...args,limit,offset).toArray();
    const group=this.sql.exec(`SELECT selected_day,SUM(CASE WHEN result_group='W' THEN 1 ELSE 0 END) AS win,SUM(CASE WHEN result_group='L' THEN 1 ELSE 0 END) AS loss,SUM(CASE WHEN result_group='D' THEN 1 ELSE 0 END) AS draw FROM signal_history${settledWhere} GROUP BY selected_day ORDER BY selected_day ASC`,...args).toArray();
    let cw=0,cl=0,cd=0;const trend=group.map(r=>({date:r.selected_day,index:0,win:(cw+=Number(r.win)||0),loss:(cl+=Number(r.loss)||0),draw:(cd+=Number(r.draw)||0)})).map((r,i)=>({...r,index:i}));
    const win=Number(s.win)||0,loss=Number(s.loss)||0,draw=Number(s.draw)||0,settled=Number(s.settled)||0;
    return{ok:true,source:'CAR35_LOCAL_GOALOO_DIRECT',historyStorage:'CAR35_SQLITE_HISTORY_V2',range,page,limit,total,pages:Math.max(1,Math.ceil(total/limit)),records:this.parseRows(rows),items:this.parseRows(rows),summary:{signals:total,settled,win,loss,draw,wins:win,losses:loss,draws:draw,winRate:settled?Number((win/settled*100).toFixed(2)):0,averageOdds:Number((Number(s.average_odds)||0).toFixed(2)),netUnits:Number((Number(s.net_units)||0).toFixed(3)),trend}};
  }
  async fetch(request){
    const u=new URL(request.url),p=u.pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:H});
    try{
      if(p==='/scan'&&request.method==='POST')return json(await this.scan());
      if(p==='/live')return json(await this.live());
      if(p==='/health'){
        const last=await this.get('lastScanAt',null),health=await this.get('sourceHealth',{}),config=normConfig(await this.get('config',DEFAULT_CONFIG)),configUpdatedAt=await this.get('configUpdatedAt',null);
        return json({ok:true,engine:'CAR 3.5',mode:'DIRECT_GOALOO',source:'GOALOO_DIRECT',lastScanAt:last,ageSeconds:last?Math.max(0,Math.round((Date.now()-Date.parse(last))/1000)):null,sourceHealth:health,activeConfig:config,configUpdatedAt});
      }
      if(p==='/config'&&request.method==='GET')return json({ok:true,config:normConfig(await this.get('config',DEFAULT_CONFIG)),updatedAt:await this.get('configUpdatedAt',null),source:'CAR35_LOCAL'});
      if(p==='/config'&&request.method==='POST'){
        const body=await request.json().catch(()=>({})),validation=validateConfig(body?.config||body);
        if(!validation.ok)return json({ok:false,reason:'INVALID_CONFIG',errors:validation.errors},400);
        const updatedAt=new Date().toISOString();await this.ctx.storage.put({config:validation.config,configUpdatedAt:updatedAt});return json({ok:true,config:validation.config,updatedAt});
      }
      if(p==='/snapshots'){const snapshots=await this.get('snapshots',[]);return json({ok:true,snapshots,items:snapshots})}
      if(p==='/history'){await this.migrateLegacy();return json(this.historyResponse(u))}
      if(p==='/match'){const id=String(u.searchParams.get('id')||''),live=await this.live(),match=(live.matches||[]).find(m=>String(m.sourceMatchId)===id);return match?json({ok:true,match}):json({ok:false,reason:'MATCH_NOT_LIVE'},404)}
      return json({ok:false,reason:'NOT_FOUND'},404);
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
    if(request.method==='POST')return stateJson(env,p,{method:'POST',headers:{'content-type':'application/json'},body:await request.text()});
  }
  if(p==='/scan'&&request.method==='POST')return stateJson(env,p,{method:'POST'});
  return null;
}
async function staticResponse(request,env){
  const response=await env.ASSETS.fetch(request),ct=response.headers.get('content-type')||'';
  if(!response.ok||(!ct.includes('text/')&&!ct.includes('javascript')&&!ct.includes('json')))return response;
  let text=await response.text();
  if(ct.includes('text/html'))text=text.replace('</head>',`${BRAND_CSS}${BRAND_JS}</head>`);
  const h=new Headers(response.headers);h.set('cache-control','no-store');return new Response(text,{status:response.status,headers:h});
}
export default{
  async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/owner-settings'||url.pathname==='/owner-settings.html')return Response.redirect(new URL('/owner-control.html?rev=20260818-wiring-v2',url),302);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:H});const d=await dynamic(request,env);return d||staticResponse(request,env)},
  async scheduled(event,env,ctx){ctx.waitUntil(stateJson(env,'/scan',{method:'POST'}).then(r=>r.text()).catch(()=>null))}
};
