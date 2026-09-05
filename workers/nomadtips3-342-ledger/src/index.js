const SERVICE='nomadtips3-342-ledger';
const VERSION='ledger-v1';
const SETTLEMENT_REVISION='totalcorner-final-v1';
const SETTLEMENT_SOURCE='totalcorner-live-score-v3';
const TOTALCORNER_FINALS_URL='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/finals';
const MAX_GOALS=30;
const ALLOWED_WRITE_ORIGINS=new Set([
  'https://www.nomadtips3.com',
  'https://nomadtips3.com',
  'https://mccareysupon-png.github.io',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
]);
const MAX_SIGNAL_LIMIT=500;
const SETTLEMENT_SWEEP_LIMIT=25;
const SETTLEMENT_RETRY_MS=5*60*1000;
const SETTLEMENT_ERROR_RETRY_MS=5*60*1000;
const SCHEDULED_SETTLEMENT_PATH='/__scheduled_settlement';
const TOTALCORNER_TIMEOUT_MS=10000;

const finite=value=>{
  if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
};
const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
const iso=value=>Number.isFinite(Number(value))?new Date(Number(value)).toISOString():null;
const pair=value=>{
  if(Array.isArray(value))return {home:finite(value[0]),away:finite(value[1])};
  return {home:finite(value?.home),away:finite(value?.away)};
};
const safeScore=value=>{
  const n=finite(value);
  return n!==null&&Number.isInteger(n)&&n>=0&&n<=MAX_GOALS?n:null;
};
const selectedOdds=(market,pick)=>{
  const p=String(pick||'').toUpperCase();
  if(p==='HOME')return finite(market?.home);
  if(p==='DRAW')return finite(market?.draw);
  if(p==='AWAY')return finite(market?.away);
  if(p==='OVER')return finite(market?.over??market?.overOdds);
  if(p==='UNDER')return finite(market?.under??market?.underOdds);
  return null;
};
const profitFor=(result,odds)=>result==='WIN'&&finite(odds)!==null?Number((finite(odds)-1).toFixed(4)):result==='LOSS'?-1:0;
const json=(request,body,status=200)=>{
  const origin=request.headers.get('origin')||'';
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  headers.set('access-control-allow-origin',ALLOWED_WRITE_ORIGINS.has(origin)?origin:'*');
  headers.set('access-control-allow-methods','GET,POST,OPTIONS');
  headers.set('access-control-allow-headers','content-type');
  headers.set('vary','Origin');
  return new Response(status===204?null:JSON.stringify(body),{status,headers});
};

function validateLock(body){
  const matchId=clean(body?.matchId,120),fixtureId=clean(body?.fixtureId,40),home=clean(body?.home,120),away=clean(body?.away,120);
  const minute=finite(body?.minute),score=pair(body?.entryScore),eventPass=body?.eventPass===true;
  const one=body?.prediction?.oneXtwo||{},totals=body?.prediction?.totals||{};
  const onePick=clean(one.pick,12).toUpperCase(),totalsPick=clean(totals.pick,12).toUpperCase(),line=finite(totals.line);
  const marketOne=body?.market?.oneXtwo||{},marketTotals=body?.market?.totals||{};
  const oneOdds=selectedOdds(marketOne,onePick),totalsOdds=selectedOdds(marketTotals,totalsPick);
  const errors=[];
  if(!matchId)errors.push('matchId');
  if(!home||!away)errors.push('teams');
  if(minute===null||minute<1||minute>130)errors.push('minute');
  if(score.home===null||score.away===null)errors.push('entryScore');
  if(!eventPass)errors.push('eventPass');
  if(!['HOME','DRAW','AWAY'].includes(onePick))errors.push('oneXtwo.pick');
  if(!['OVER','UNDER'].includes(totalsPick))errors.push('totals.pick');
  if(line===null||line<0||line>20)errors.push('totals.line');
  if(oneOdds===null||oneOdds<=1||oneOdds>100)errors.push('oneXtwo.odds');
  if(totalsOdds===null||totalsOdds<=1||totalsOdds>100)errors.push('totals.odds');
  return {ok:errors.length===0,errors,value:{
    matchId,fixtureId:fixtureId||null,league:clean(body?.league,160),home,away,minute,entryScore:score,eventPass,
    configVersion:clean(body?.configVersion,80)||null,presetVersion:clean(body?.presetVersion,80)||null,
    eventMetrics:body?.eventMetrics&&typeof body.eventMetrics==='object'?body.eventMetrics:null,
    prediction:{
      oneXtwo:{pick:onePick,home:finite(one.home),draw:finite(one.draw),away:finite(one.away),odds:oneOdds},
      totals:{pick:totalsPick,line,over:finite(totals.over),under:finite(totals.under),odds:totalsOdds},
    },
    market:{
      provider:clean(body?.market?.provider,80)||null,observedAt:finite(body?.market?.observedAt),
      oneXtwo:{home:finite(marketOne.home),draw:finite(marketOne.draw),away:finite(marketOne.away),bookmaker:clean(marketOne.bookmaker,80)||null,betName:clean(marketOne.betName,120)||null},
      totals:{line:finite(marketTotals.line??line),over:finite(marketTotals.over??marketTotals.overOdds),under:finite(marketTotals.under??marketTotals.underOdds),bookmaker:clean(marketTotals.bookmaker,80)||null,betName:clean(marketTotals.betName,120)||null},
    },
  }};
}

export function gradeOneXtwo(pick,home,away){
  const p=String(pick||'').toUpperCase();
  if(!Number.isFinite(home)||!Number.isFinite(away))return 'PENDING';
  const actual=home>away?'HOME':home<away?'AWAY':'DRAW';
  return p===actual?'WIN':'LOSS';
}
export function gradeTotals(pick,line,home,away){
  const p=String(pick||'').toUpperCase(),l=finite(line);
  if(!['OVER','UNDER'].includes(p)||l===null||!Number.isFinite(home)||!Number.isFinite(away))return 'PENDING';
  const total=home+away;
  if(Math.abs(total-l)<1e-9)return 'PUSH';
  if(p==='OVER')return total>l?'WIN':'LOSS';
  return total<l?'WIN':'LOSS';
}
export function settlementNeedsRevision(record){
  return Boolean(record&&!record.settlement&&record.settlementRevision!==SETTLEMENT_REVISION);
}
export function settlementIsDue(record,now=Date.now()){
  if(!record||record.settlement)return false;
  if(settlementNeedsRevision(record))return true;
  return Number.isFinite(Number(record.nextSettlementCheckAt))&&Number(record.nextSettlementCheckAt)<=Number(now);
}
export function settleRecord(record,finalScore,status,settledAt=Date.now(),sourceMeta=null){
  const score=pair(finalScore);
  if(score.home===null||score.away===null)return record;
  const oneResult=gradeOneXtwo(record?.prediction?.oneXtwo?.pick,score.home,score.away);
  const totalsResult=gradeTotals(record?.prediction?.totals?.pick,record?.prediction?.totals?.line,score.home,score.away);
  const oneOdds=finite(record?.prediction?.oneXtwo?.odds),totalsOdds=finite(record?.prediction?.totals?.odds);
  return {...record,settlementRevision:SETTLEMENT_REVISION,settlement:{status:'SETTLED',fixtureStatus:status,finalScore:score,settledAt,
    source:sourceMeta?.source||null,sourceMatchId:sourceMeta?.sourceMatchId||null,matchMode:sourceMeta?.matchMode||null,
    oneXtwo:{result:oneResult,profit:profitFor(oneResult,oneOdds)},
    totals:{result:totalsResult,profit:profitFor(totalsResult,totalsOdds)},
  },nextSettlementCheckAt:null,lastSettlementCheckAt:settledAt,settlementError:null};
}
function rowsFromRecords(records){
  const rows=[];
  for(const record of records){
    const common={recordId:record.id,matchId:record.matchId,fixtureId:record.fixtureId,lockedAt:record.lockedAt,league:record.league,home:record.home,away:record.away,minute:record.minute,entryScore:record.entryScore,finalScore:record.settlement?.finalScore||null};
    rows.push({...common,market:'1X2',pick:record.prediction.oneXtwo.pick,line:null,odds:record.prediction.oneXtwo.odds,result:record.settlement?.oneXtwo?.result||'PENDING',profit:record.settlement?.oneXtwo?.profit??null});
    rows.push({...common,market:`O/U ${Number(record.prediction.totals.line).toFixed(Number.isInteger(Number(record.prediction.totals.line))?1:2)}`,pick:record.prediction.totals.pick,line:record.prediction.totals.line,odds:record.prediction.totals.odds,result:record.settlement?.totals?.result||'PENDING',profit:record.settlement?.totals?.profit??null});
  }
  return rows.sort((a,b)=>Number(b.lockedAt)-Number(a.lockedAt));
}
export function summarize(records){
  const rows=rowsFromRecords(records),settled=rows.filter(row=>row.result!=='PENDING');
  const wins=settled.filter(row=>row.result==='WIN').length,losses=settled.filter(row=>row.result==='LOSS').length,pushes=settled.filter(row=>row.result==='PUSH').length;
  const decided=wins+losses,profit=settled.reduce((sum,row)=>sum+(finite(row.profit)||0),0);
  return {lockedMatches:records.length,totalPredictions:rows.length,settledPredictions:settled.length,pendingPredictions:rows.length-settled.length,wins,losses,pushes,winRate:decided?wins/decided*100:0,profit:Number(profit.toFixed(4))};
}

export function parseTotalCornerFinalPayload(payload){
  if(!payload||payload.ok!==true)throw new Error('TOTALCORNER_FINALS_NOT_OK');
  if(payload.version!=='3.42'||payload.component!=='totalcorner-live-score-v3'||payload.mode!=='FINAL_SCORE_FEED')throw new Error('TOTALCORNER_FINALS_CONTRACT_MISMATCH');
  const rows=[];
  for(const row of Array.isArray(payload.finals)?payload.finals:[]){
    const id=clean(row?.id,120),score=pair(row?.score),status=clean(row?.status,20).toUpperCase();
    const home=safeScore(score.home),away=safeScore(score.away);
    if(!id||status!=='FT'||home===null||away===null)continue;
    rows.push({id,status:'FT',score:{home,away},home:clean(row?.home,120)||null,away:clean(row?.away,120)||null,observedAt:finite(row?.observedAt)});
  }
  return rows;
}
export function matchTotalCornerFinal(record,rows){
  const id=clean(record?.matchId,120);
  if(!id)return null;
  return (Array.isArray(rows)?rows:[]).find(row=>String(row?.id)===id)||null;
}
async function totalCornerFinalIndex(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TOTALCORNER_TIMEOUT_MS);
  try{
    const url=new URL(TOTALCORNER_FINALS_URL);
    url.searchParams.set('force','1');
    url.searchParams.set('t',String(Date.now()));
    const response=await fetch(url.toString(),{cache:'no-store',signal:controller.signal,headers:{'accept':'application/json','user-agent':'NOMADTIPS3-342-LEDGER/3.0 (+TotalCorner final settlement)'}});
    if(!response.ok)throw new Error(`TOTALCORNER_FINALS_HTTP_${response.status}`);
    let data;try{data=await response.json();}catch{throw new Error('TOTALCORNER_FINALS_JSON_INVALID');}
    const rows=parseTotalCornerFinalPayload(data);
    return {rows,url:TOTALCORNER_FINALS_URL,updatedAt:data.updatedAt||null};
  }catch(error){
    if(error?.name==='AbortError')throw new Error('TOTALCORNER_FINALS_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);}
}

export class PredictionLedger{
  constructor(state,env){this.state=state;this.env=env;}
  async records(){return [...(await this.state.storage.list({prefix:'record:'})).values()].filter(Boolean).sort((a,b)=>Number(b.lockedAt)-Number(a.lockedAt));}
  async scheduleNext(records=null){
    const list=records||await this.records(),now=Date.now();
    const pending=list.filter(record=>!record.settlement);
    if(!pending.length){const alarm=await this.state.storage.getAlarm();if(alarm!==null)await this.state.storage.deleteAlarm();return;}
    const candidates=pending.map(record=>settlementNeedsRevision(record)?now+1000:Number(record.nextSettlementCheckAt)).filter(Number.isFinite);
    if(!candidates.length){const alarm=await this.state.storage.getAlarm();if(alarm!==null)await this.state.storage.deleteAlarm();return;}
    const next=Math.max(now+1000,Math.min(...candidates));
    const current=await this.state.storage.getAlarm();if(current===null||Math.abs(current-next)>1000)await this.state.storage.setAlarm(next);
  }
  async lock(request){
    const origin=request.headers.get('origin')||'';
    if(!ALLOWED_WRITE_ORIGINS.has(origin))return json(request,{ok:false,error:'write_origin_not_allowed'},403);
    let body;try{body=await request.json();}catch{return json(request,{ok:false,error:'invalid_json'},400);}
    const checked=validateLock(body);if(!checked.ok)return json(request,{ok:false,error:'invalid_lock',fields:checked.errors},400);
    const value=checked.value,key=`record:${value.matchId}`,existing=await this.state.storage.get(key);
    if(existing)return json(request,{ok:true,locked:true,duplicate:true,record:existing},200);
    const lockedAt=Date.now(),minutesUntilCheck=Math.max(3,92-(value.minute||0));
    const record={...value,id:`342:${value.matchId}`,status:'LOCKED',lockedAt,settlement:null,settlementRevision:SETTLEMENT_REVISION,lastSettlementCheckAt:null,nextSettlementCheckAt:lockedAt+minutesUntilCheck*60*1000,settlementSource:SETTLEMENT_SOURCE,settlementMatchMode:'MATCH_ID'};
    await this.state.storage.put(key,record);await this.scheduleNext();
    return json(request,{ok:true,locked:true,duplicate:false,record},201);
  }
  async signal(request,url){
    await this.settleDue();
    const requested=Math.trunc(finite(url.searchParams.get('limit'))||200),limit=Math.max(1,Math.min(MAX_SIGNAL_LIMIT,requested));
    const records=(await this.records()).slice(0,limit),summary=summarize(records);
    return json(request,{ok:true,version:VERSION,updatedAt:new Date().toISOString(),summary,records});
  }
  async statistics(request,url){
    await this.settleDue();
    const requested=Math.trunc(finite(url.searchParams.get('limit'))||500),limit=Math.max(1,Math.min(MAX_SIGNAL_LIMIT,requested));
    const all=await this.records(),records=all.slice(0,limit),summary=summarize(all),rows=rowsFromRecords(records);
    return json(request,{ok:true,version:VERSION,updatedAt:new Date().toISOString(),summary,rows});
  }
  async health(request,url){
    await this.settleDue();
    let sourceProbe=null;
    if(url.searchParams.get('probe')==='1'){
      try{const source=await totalCornerFinalIndex();sourceProbe={ok:true,source:SETTLEMENT_SOURCE,rows:source.rows.length,url:source.url,updatedAt:source.updatedAt};}
      catch(error){sourceProbe={ok:false,source:SETTLEMENT_SOURCE,error:clean(error?.message||error,240)};}
    }
    const records=await this.records(),summary=summarize(records),settlementMeta=await this.state.storage.get('meta:settlement');
    return json(request,{ok:sourceProbe?.ok===false?false:true,service:SERVICE,version:VERSION,settlementRevision:SETTLEMENT_REVISION,storage:'durable-object',settlementSource:SETTLEMENT_SOURCE,settlementEndpoint:TOTALCORNER_FINALS_URL,autoSettlement:'alarm+cron+read-repair',summary,alarmAt:iso(await this.state.storage.getAlarm()),settlementMeta:settlementMeta||null,sourceProbe});
  }
  async settleDue(records=null,reason='runtime'){
    const list=records||await this.records(),now=Date.now(),due=list.filter(record=>settlementIsDue(record,now)).slice(0,SETTLEMENT_SWEEP_LIMIT);
    let settled=0,waiting=0,errors=0,migrated=0;
    let source=null,sourceError=null;
    if(due.length){try{source=await totalCornerFinalIndex();}catch(error){sourceError=error;}}
    for(const record of due){
      const key=`record:${record.matchId}`,legacy=settlementNeedsRevision(record);
      try{
        if(sourceError)throw sourceError;
        const final=matchTotalCornerFinal(record,source?.rows||[]),checkedAt=Date.now();
        if(final){
          const traced={...record,settlementRevision:SETTLEMENT_REVISION,settlementSource:SETTLEMENT_SOURCE,settlementSourceMatchId:final.id,settlementMatchMode:'MATCH_ID'};
          await this.state.storage.put(key,settleRecord(traced,final.score,'FT',checkedAt,{source:SETTLEMENT_SOURCE,sourceMatchId:final.id,matchMode:'MATCH_ID'}));settled++;
        }else{
          waiting++;
          await this.state.storage.put(key,{...record,settlementRevision:SETTLEMENT_REVISION,lastSettlementCheckAt:checkedAt,nextSettlementCheckAt:checkedAt+SETTLEMENT_RETRY_MS,settlementError:null,settlementSource:SETTLEMENT_SOURCE,settlementMatchMode:'MATCH_ID'});
        }
        if(legacy)migrated++;
      }catch(error){
        errors++;
        const checkedAt=Date.now();
        await this.state.storage.put(key,{...record,settlementRevision:SETTLEMENT_REVISION,lastSettlementCheckAt:checkedAt,nextSettlementCheckAt:checkedAt+SETTLEMENT_ERROR_RETRY_MS,settlementError:clean(error?.message||error,240),settlementSource:SETTLEMENT_SOURCE,settlementMatchMode:'MATCH_ID'});
        if(legacy)migrated++;
      }
    }
    await this.state.storage.put('meta:settlement',{source:SETTLEMENT_SOURCE,revision:SETTLEMENT_REVISION,endpoint:TOTALCORNER_FINALS_URL,reason,ranAt:Date.now(),due:due.length,migrated,settled,waiting,errors});
    await this.scheduleNext();
    return {source:SETTLEMENT_SOURCE,revision:SETTLEMENT_REVISION,due:due.length,migrated,settled,waiting,errors};
  }
  async alarm(){await this.settleDue(null,'durable-object-alarm');}
  async fetch(request){
    if(request.method==='OPTIONS')return json(request,{},204);
    const url=new URL(request.url);
    if(url.pathname==='/lock'&&request.method==='POST')return this.lock(request);
    if(url.pathname==='/signal'&&request.method==='GET')return this.signal(request,url);
    if(url.pathname==='/statistics'&&request.method==='GET')return this.statistics(request,url);
    if((url.pathname==='/'||url.pathname==='/health')&&request.method==='GET')return this.health(request,url);
    if(url.pathname===SCHEDULED_SETTLEMENT_PATH&&request.method==='POST'){
      const sweep=await this.settleDue(null,'worker-cron');
      return json(request,{ok:true,version:VERSION,sweep});
    }
    return json(request,{ok:false,error:'not_found'},404);
  }
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return json(request,{},204);
    const id=env.LEDGER.idFromName('primary');
    return env.LEDGER.get(id).fetch(request);
  },
  async scheduled(_controller,env,ctx){
    const id=env.LEDGER.idFromName('primary');
    const request=new Request(`https://nomadtips3.internal${SCHEDULED_SETTLEMENT_PATH}`,{method:'POST'});
    const task=(async()=>{
      const response=await env.LEDGER.get(id).fetch(request);
      if(!response.ok)throw new Error(`LEDGER_SCHEDULED_SETTLEMENT_HTTP_${response.status}`);
    })();
    ctx.waitUntil(task);
  }
};
