import baseWorker, { Nomad343Engine as BaseNomad343Engine } from './index.js';
import { MARKET_RULES, settleMarketSignal } from './market-core.js';
import { SETTLEMENT_WATCH_PAGE } from './settlement-watch-page.js';

const WATCH_VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1-watch-v1';
const API_BASE='https://api.5dollarfootballapi.com/v1';
const WATCH_MAX_CHECKS_PER_SCAN=2;
const WATCH_RETRY_MS=2*60_000;
const WATCH_KEEP_COMPLETED=80;
const SETTLEMENT_REVISION='bet365-rules-v2';
const now=()=>Date.now();
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const text=v=>v===null||v===undefined?null:String(v);

function pair(v){return v&&typeof v==='object'?{home:num(v.home),away:num(v.away),halfHome:num(v.half_home??v.halfHome),halfAway:num(v.half_away??v.halfAway)}:{home:null,away:null,halfHome:null,halfAway:null}}
function cards(v){const side=x=>x&&typeof x==='object'?{yellow:num(x.yellow),red:num(x.red)}:null;return {home:side(v?.home),away:side(v?.away)}}
function fixtureState(status,statusCode){const s=`${status||''} ${statusCode||''}`.toLowerCase();if(/unknown|postpon|cancel|canceled|abandon|suspend/.test(s))return'unknown';if(/finished|full_time|full time|\bft\b|ended|\bfull\b|after extra|\baet\b|penalties|\bpen\b/.test(s))return'finished';if(/in_play|in play|live|half|first|second|\b1h\b|\b2h\b/.test(s)||/^\d+$/.test(String(statusCode||'')))return'live';return'scheduled'}
function normalizeFixture(payload,fallbackId){const f=payload?.data?.id!==undefined?payload.data:(payload?.data?.data??payload?.fixture??payload?.data??payload),status=text(f?.status?.name??f?.status??''),statusCode=text(f?.status_code??f?.status?.code??f?.status?.short??''),fixtureId=String(f?.id??f?.fixture_id??f?.fixture?.id??fallbackId);return {fixtureId,status,statusCode,statusReason:text(f?.status_reason??f?.status?.reason??null),boardState:fixtureState(status,statusCode),minute:num(f?.minute??f?.elapsed??f?.status?.minute??f?.status?.elapsed),goals:pair(f?.goals??f?.score),corners:pair(f?.corners),cards:cards(f?.cards)}}
function isFinished(f){return f?.boardState==='finished'}
function isUnknown(f){return f?.boardState==='unknown'}
function isLive(f){return f?.boardState==='live'}
function isHalfComplete(f){if(isFinished(f))return true;const raw=`${f?.status??''} ${f?.statusCode??''}`.toLowerCase(),minute=num(f?.minute);return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw)||(minute!==null&&minute>=46)}
function periodComplete(signal,f){const def=MARKET_RULES[signal?.market];if(!def)return false;return def.period==='HT'?isHalfComplete(f):isFinished(f)}
async function fetchFixture(fixtureId,env){if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let payload=null;try{payload=JSON.parse(raw)}catch{}if(!r.ok){const e=new Error(`5USD_FIXTURE_HTTP_${r.status}`);e.status=r.status;throw e}if(!payload||typeof payload!=='object')throw new Error('5USD_FIXTURE_SHAPE');return normalizeFixture(payload,fixtureId)}
function signalSummary(s){return {id:s.id,market:s.market,marketLabel:s.marketLabel,period:s.period,selection:s.selection,line:s.line,odds:s.odds,bookmaker:s.bookmaker,strategy:s.strategy,createdAt:s.createdAt,entryMinute:s.entryMinute??s.minute,entryScore:clone(s.entryScore??s.scoreAt??null),status:s.status,result:s.result,settledAt:s.settledAt??null,settlementError:s.settlementError??null}}
function groupSignals(signals){const map=new Map();for(const s of signals){const id=String(s?.fixtureId??'');if(!id)continue;if(!map.has(id))map.set(id,[]);map.get(id).push(s)}for(const rows of map.values())rows.sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));return map}
function newest(rows){return rows.reduce((best,s)=>Number(s?.createdAt||0)>=Number(best?.createdAt||0)?s:best,rows[0]||{})}
function finalFromSignals(rows,key){const done=[...rows].filter(s=>s?.status==='SETTLED'&&s?.[key]).sort((a,b)=>Number(b?.settledAt||0)-Number(a?.settledAt||0));return done[0]?.[key]??null}
function scoreReady(v){return num(v?.home)!==null&&num(v?.away)!==null}
function buildRecord(id,rows,fixture,old={}){const sample=newest(rows),pending=rows.filter(s=>s.status==='PENDING'),unresolved=rows.filter(s=>s.status==='UNRESOLVED'),settled=rows.filter(s=>s.status==='SETTLED'),allSettled=rows.length>0&&settled.length===rows.length,hasActive=pending.length>0||unresolved.length>0;let state='WAIT_FT';if(allSettled)state='FT';else if(!pending.length&&unresolved.length)state='UNRESOLVED';else if(fixture&&isFinished(fixture))state='FT';else if(fixture&&isLive(fixture))state='LIVE';else if(fixture)state='TRACKING';const finalScore=scoreReady(fixture?.goals)&&isFinished(fixture)?clone(fixture.goals):finalFromSignals(rows,'finalScore');const finalCorners=isFinished(fixture)?clone(fixture?.corners):finalFromSignals(rows,'finalCorners');const finalCards=isFinished(fixture)?clone(fixture?.cards):finalFromSignals(rows,'finalCards');return {fixtureId:id,league:clone(sample?.league??old.league??null),home:clone(sample?.home??old.home??null),away:clone(sample?.away??old.away??null),state,firstSignalAt:Math.min(...rows.map(s=>Number(s.createdAt||now()))),lastSignalAt:Math.max(...rows.map(s=>Number(s.createdAt||0))),lastSeenAt:fixture?now():(old.lastSeenAt??null),lastMinute:num(fixture?.minute??old.lastMinute),lastScore:clone(fixture?.goals??old.lastScore??sample?.scoreAt??sample?.entryScore??null),providerStatus:fixture?.status??old.providerStatus??null,providerStatusCode:fixture?.statusCode??old.providerStatusCode??null,finalScore:clone(finalScore),finalCorners:clone(finalCorners),finalCards:clone(finalCards),statisticsStatus:allSettled?'WRITTEN':hasActive?'PENDING':settled.length?'WRITTEN':'PENDING',activeSignals:pending.length+unresolved.length,settledSignals:settled.length,totalSignals:rows.length,signals:rows.map(signalSummary),lastCheckAt:old.lastCheckAt??null,lastCheckState:old.lastCheckState??null,lastCheckError:old.lastCheckError??null,completedAt:allSettled?(Math.max(...settled.map(s=>Number(s.settledAt||0)))||old.completedAt||now()):(old.completedAt??null),updatedAt:now()}}

export class Nomad343Engine extends BaseNomad343Engine{
  async scan(){
    const baseMeta=await super.scan();
    if(!baseMeta?.ok)return baseMeta;
    const at=now();
    try{
      const signals=await this.ctx.storage.get('signals')||[];
      const board=await this.ctx.storage.get('board')||{fixtures:[]};
      const previous=await this.ctx.storage.get('settlementWatch')||{};
      const grouped=groupSignals(signals),boardMap=new Map((Array.isArray(board?.fixtures)?board.fixtures:[]).map(f=>[String(f?.fixtureId??''),f]));
      const records={};
      for(const [id,rows] of grouped){const active=rows.some(s=>['PENDING','UNRESOLVED'].includes(s.status));const old=previous[id]||{};if(active||old.completedAt||rows.some(s=>s.status==='SETTLED'))records[id]=buildRecord(id,rows,boardMap.get(id)||null,old)}
      const candidates=Object.values(records).filter(r=>r.activeSignals>0&&!boardMap.has(String(r.fixtureId))&&at-Number(r.lastCheckAt||0)>=WATCH_RETRY_MS).sort((a,b)=>Number(b.lastSignalAt||0)-Number(a.lastSignalAt||0));
      const selected=candidates.slice(0,WATCH_MAX_CHECKS_PER_SCAN),checkedFixtures=new Map();let requests=0,recovered=0,errors=[];
      for(const record of selected){
        const id=String(record.fixtureId);record.lastCheckAt=now();
        try{
          requests++;const fixture=await fetchFixture(id,this.env);checkedFixtures.set(id,fixture);record.lastCheckState=fixture.boardState;record.lastCheckError=null;record.providerStatus=fixture.status;record.providerStatusCode=fixture.statusCode;record.lastMinute=num(fixture.minute??record.lastMinute);record.lastScore=clone(fixture.goals??record.lastScore);record.lastSeenAt=now();if(isFinished(fixture)||isUnknown(fixture))recovered++;
          for(const signal of grouped.get(id)||[]){
            if(!['PENDING','UNRESOLVED'].includes(signal.status))continue;
            if(isUnknown(fixture)){signal.status='UNRESOLVED';signal.settlementError=String(fixture.statusReason||'RESULT_UNCONFIRMED').toUpperCase();signal.settledAt=signal.settledAt||now();signal.settlementRevision=SETTLEMENT_REVISION;continue}
            if(!periodComplete(signal,fixture))continue;
            const result=settleMarketSignal(signal,fixture);
            if(!result){signal.status='UNRESOLVED';signal.settlementError='FINAL_DATA_UNAVAILABLE';signal.settledAt=signal.settledAt||now();signal.settlementRevision=SETTLEMENT_REVISION;continue}
            signal.status='SETTLED';signal.result=result;signal.finalScore=clone(fixture.goals);signal.finalCorners=clone(fixture.corners);signal.finalCards=clone(fixture.cards);signal.settledAt=now();signal.settlementError=null;signal.settlementRevision=SETTLEMENT_REVISION;
          }
        }catch(e){record.lastCheckError=String(e?.message||e);record.lastCheckState='ERROR';errors.push({fixtureId:id,error:record.lastCheckError})}
      }
      if(selected.length)await this.ctx.storage.put('signals',signals);
      const regrouped=groupSignals(signals),finalRecords={};
      for(const [id,rows] of regrouped){const old=records[id]||previous[id]||{},fixture=checkedFixtures.get(id)||boardMap.get(id)||null,active=rows.some(s=>['PENDING','UNRESOLVED'].includes(s.status));if(active||old.completedAt||rows.some(s=>s.status==='SETTLED'))finalRecords[id]=buildRecord(id,rows,fixture,old)}
      const activeRecords=Object.values(finalRecords).filter(r=>r.activeSignals>0),completedRecords=Object.values(finalRecords).filter(r=>r.activeSignals===0&&r.statisticsStatus==='WRITTEN').sort((a,b)=>Number(b.completedAt||0)-Number(a.completedAt||0)).slice(0,WATCH_KEEP_COMPLETED),kept={};
      for(const r of [...activeRecords,...completedRecords])kept[r.fixtureId]=r;
      await this.ctx.storage.put('settlementWatch',kept);
      const watchMeta={maxChecksPerScan:WATCH_MAX_CHECKS_PER_SCAN,retryMs:WATCH_RETRY_MS,requests,recovered,queued:Math.max(0,candidates.length-selected.length),errors,active:activeRecords.length,waiting:activeRecords.filter(r=>r.state==='WAIT_FT').length,settled:completedRecords.length};
      const meta={...baseMeta,version:WATCH_VERSION,finishedAt:now(),settlementWatchRequests:requests,settlementWatchRecovered:recovered,settlementWatchQueued:watchMeta.queued,settlementWatch:watchMeta};await this.ctx.storage.put('lastScan',meta);return meta;
    }catch(e){const meta={...baseMeta,version:WATCH_VERSION,settlementWatchError:String(e?.message||e),finishedAt:now()};await this.ctx.storage.put('lastScan',meta);return meta}
  }
  async fetch(request){
    const u=new URL(request.url);
    if(u.pathname==='/settlement-watch-page'&&request.method==='GET')return new Response(SETTLEMENT_WATCH_PAGE,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    if(u.pathname==='/settlement-watch'&&request.method==='GET'){
      await this.scanIfDue();const data=await this.ctx.storage.get('settlementWatch')||{},meta=await this.ctx.storage.get('lastScan')||{},records=Object.values(data).sort((a,b)=>{const aa=a.activeSignals>0?1:0,bb=b.activeSignals>0?1:0;return bb-aa||Number(b.lastSignalAt||b.completedAt||0)-Number(a.lastSignalAt||a.completedAt||0)});
      return Response.json({ok:true,version:WATCH_VERSION,records,counts:{active:records.filter(r=>r.activeSignals>0).length,waiting:records.filter(r=>r.state==='WAIT_FT').length,settled:records.filter(r=>r.statisticsStatus==='WRITTEN').length},watch:meta.settlementWatch||null},{headers:{'cache-control':'no-store'}})
    }
    if(u.pathname==='/health'&&request.method==='GET'){await this.scanIfDue();const m=await this.ctx.storage.get('lastScan')||{};return Response.json({ok:Boolean(m?.ok),component:'NOMAD343_ENGINE',version:WATCH_VERSION,...m},{headers:{'cache-control':'no-store'}})}
    return super.fetch(request)
  }
}

function stub(env){return env.ENGINE.get(env.ENGINE.idFromName('global'))}
function cors(request,response){const h=new Headers(response.headers);h.set('access-control-allow-origin',request.headers.get('origin')||'*');h.set('access-control-allow-methods','GET,PUT,POST,OPTIONS');h.set('access-control-allow-headers','content-type');h.set('cache-control','no-store');return new Response(response.body,{status:response.status,headers:h})}
export default{
  async fetch(request,env){if(request.method==='OPTIONS')return cors(request,new Response(null,{status:204}));const u=new URL(request.url);const allowed=['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history','/fixture-odds','/settlement-watch','/settlement-watch-page'];if(!allowed.includes(u.pathname))return cors(request,new Response('Not found',{status:404}));return cors(request,await stub(env).fetch(new Request(`https://engine.internal${u.pathname}${u.search}`,request)))},
  async scheduled(event,env,ctx){return baseWorker.scheduled(event,env,ctx)}
};
