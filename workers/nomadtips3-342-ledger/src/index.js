const SERVICE='nomadtips3-342-ledger';
const VERSION='ledger-v1';
const SETTLEMENT_SOURCE='goaloo-bf_us-direct-index';
const GOALOO_INDEX_URLS=[
  'https://live10.goaloo28.com/gf/data/bf_us.js',
  'https://live10.goaloo28.com/gf/data/bf_us1.js',
];
const GOALOO_FINAL_STATE=-1;
const MAX_GOALS=30;
const ALLOWED_WRITE_ORIGINS=new Set([
  'https://www.nomadtips3.com',
  'https://nomadtips3.com',
  'https://mccareysupon-png.github.io',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
]);
const MAX_SIGNAL_LIMIT=500;
const SETTLEMENT_RETRY_MS=10*60*1000;
const SETTLEMENT_ERROR_RETRY_MS=15*60*1000;
const SCHEDULED_SETTLEMENT_PATH='/__scheduled_settlement';
const GOALOO_TIMEOUT_MS=8000;

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
  // fixtureId remains stored as market trace metadata, but settlement no longer depends on it.
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
export function settleRecord(record,finalScore,status,settledAt=Date.now(),sourceMeta=null){
  const score=pair(finalScore);
  if(score.home===null||score.away===null)return record;
  const oneResult=gradeOneXtwo(record?.prediction?.oneXtwo?.pick,score.home,score.away);
  const totalsResult=gradeTotals(record?.prediction?.totals?.pick,record?.prediction?.totals?.line,score.home,score.away);
  const oneOdds=finite(record?.prediction?.oneXtwo?.odds),totalsOdds=finite(record?.prediction?.totals?.odds);
  return {...record,settlement:{status:'SETTLED',fixtureStatus:status,finalScore:score,settledAt,
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

function jsScalar(raw){
  const value=String(raw??'').trim();
  if(!value||value==='null'||value==='undefined')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  return value;
}
function splitJsArray(body){
  const out=[];let token='',quote=null,escape=false;
  for(const ch of body){
    if(quote){
      if(escape){token+=ch;escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;continue;}
      token+=ch;continue;
    }
    if(ch==="'"||ch==='"'){quote=ch;continue;}
    if(ch===','){out.push(jsScalar(token));token='';continue;}
    token+=ch;
  }
  out.push(jsScalar(token));return out;
}
function parseIndexedArrays(source,variable){
  const out=new Map(),re=new RegExp(`${variable}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`,'g');
  for(const match of String(source||'').matchAll(re))out.set(Number(match[1]),splitJsArray(match[2]));
  return out;
}
export function parseGoalooIndex(source){
  const A=parseIndexedArrays(source,'A'),rows=[];
  for(const row of A.values()){
    if(row.length<11)continue;
    const state=finite(row[8]);
    if(state===null)continue;
    rows.push({
      id:String(row[0]??''),home:clean(row[4],120),away:clean(row[5],120),state,
      score:{home:safeScore(row[9]),away:safeScore(row[10])},
    });
  }
  return rows.filter(row=>row.id&&row.home&&row.away);
}
const strictTeam=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const looseTeam=value=>strictTeam(value)
  .replace(/&/g,' and ')
  .replace(/\b(?:fc|cf|sc|afc|fk|bk|sk)\b/g,' ')
  .replace(/[^a-z0-9]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();
function pairMatches(record,row,normalizer){
  return normalizer(record?.home)===normalizer(row?.home)&&normalizer(record?.away)===normalizer(row?.away);
}
export function matchGoalooRecord(record,rows){
  const list=Array.isArray(rows)?rows:[];
  const pinned=clean(record?.settlementGoalooId,40);
  if(pinned){
    const row=list.find(item=>String(item?.id)===pinned);
    if(row)return {row,mode:'PINNED_ID'};
  }
  const strict=list.filter(row=>pairMatches(record,row,strictTeam));
  if(strict.length===1)return {row:strict[0],mode:'EXACT_TEAMS'};
  if(strict.length>1)throw new Error('GOALOO_MATCH_AMBIGUOUS_EXACT');
  const loose=list.filter(row=>pairMatches(record,row,looseTeam));
  if(loose.length===1)return {row:loose[0],mode:'NORMALIZED_TEAMS'};
  if(loose.length>1)throw new Error('GOALOO_MATCH_AMBIGUOUS_NORMALIZED');
  throw new Error('GOALOO_MATCH_NOT_FOUND');
}
async function fetchGoalooText(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),GOALOO_TIMEOUT_MS);
  try{
    const separator=url.includes('?')?'&':'?';
    const response=await fetch(`${url}${separator}t=${Math.floor(Date.now()/30000)}`,{
      headers:{'user-agent':'NOMADTIPS3-342-LEDGER/2.0 (+Goaloo settlement)','accept':'*/*','accept-language':'en-US,en;q=0.8'},
      cache:'no-store',signal:controller.signal,
    });
    if(!response.ok)throw new Error(`GOALOO_HTTP_${response.status}`);
    const text=await response.text();
    if(text.length<100)throw new Error('GOALOO_BODY_TOO_SHORT');
    return text;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('GOALOO_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);}
}
async function goalooIndex(){
  const errors=[];
  for(const url of GOALOO_INDEX_URLS){
    try{
      const rows=parseGoalooIndex(await fetchGoalooText(url));
      if(rows.length)return {rows,url};
      errors.push(`${url}:GOALOO_EMPTY_INDEX`);
    }catch(error){errors.push(`${url}:${String(error?.message||error)}`);}
  }
  throw new Error(`GOALOO_INDEX_FAILED:${errors.join('|')}`);
}
async function goalooFixture(record,source=null){
  const index=source||await goalooIndex();
  const matched=matchGoalooRecord(record,index.rows);
  const row=matched.row;
  const final=row.state===GOALOO_FINAL_STATE;
  if(final&&(row.score.home===null||row.score.away===null))throw new Error('GOALOO_FINAL_SCORE_INVALID');
  return {
    source:SETTLEMENT_SOURCE,sourceUrl:index.url,goalooId:String(row.id),matchMode:matched.mode,
    status:final?'FT':row.state===2?'HT':row.state>0?'LIVE':'SCHEDULED',finalScore:final?row.score:null,
  };
}

export class PredictionLedger{
  constructor(state,env){this.state=state;this.env=env;}
  async records(){return [...(await this.state.storage.list({prefix:'record:'})).values()].filter(Boolean).sort((a,b)=>Number(b.lockedAt)-Number(a.lockedAt));}
  async scheduleNext(records=null){
    const list=records||await this.records(),pending=list.filter(record=>!record.settlement&&Number.isFinite(Number(record.nextSettlementCheckAt)));
    if(!pending.length){const alarm=await this.state.storage.getAlarm();if(alarm!==null)await this.state.storage.deleteAlarm();return;}
    const next=Math.max(Date.now()+1000,Math.min(...pending.map(record=>Number(record.nextSettlementCheckAt))));
    const current=await this.state.storage.getAlarm();if(current===null||Math.abs(current-next)>1000)await this.state.storage.setAlarm(next);
  }
  async lock(request){
    const origin=request.headers.get('origin')||'';
    if(!ALLOWED_WRITE_ORIGINS.has(origin))return json(request,{ok:false,error:'write_origin_not_allowed'},403);
    let body;try{body=await request.json();}catch{return json(request,{ok:false,error:'invalid_json'},400);}
    const checked=validateLock(body);if(!checked.ok)return json(request,{ok:false,error:'invalid_lock',fields:checked.errors},400);
    const value=checked.value,key=`record:${value.matchId}`,existing=await this.state.storage.get(key);
    if(existing)return json(request,{ok:true,locked:true,duplicate:true,record:existing},200);
    const lockedAt=Date.now(),minutesUntilCheck=Math.max(10,105-(value.minute||0));
    const record={...value,id:`342:${value.matchId}`,status:'LOCKED',lockedAt,settlement:null,settlementGoalooId:null,lastSettlementCheckAt:null,nextSettlementCheckAt:lockedAt+minutesUntilCheck*60*1000};
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
      try{const source=await goalooIndex();sourceProbe={ok:true,source:SETTLEMENT_SOURCE,rows:source.rows.length,url:source.url};}
      catch(error){sourceProbe={ok:false,source:SETTLEMENT_SOURCE,error:clean(error?.message||error,240)};}
    }
    const records=await this.records(),summary=summarize(records),settlementMeta=await this.state.storage.get('meta:settlement');
    return json(request,{ok:sourceProbe?.ok===false?false:true,service:SERVICE,version:VERSION,storage:'durable-object',settlementSource:SETTLEMENT_SOURCE,autoSettlement:'alarm+cron+read-repair',summary,alarmAt:iso(await this.state.storage.getAlarm()),settlementMeta:settlementMeta||null,sourceProbe});
  }
  async settleDue(records=null,reason='runtime'){
    const list=records||await this.records(),now=Date.now(),due=list.filter(record=>!record.settlement&&Number.isFinite(Number(record.nextSettlementCheckAt))&&Number(record.nextSettlementCheckAt)<=now).slice(0,8);
    let settled=0,errors=0;
    let source=null,sourceError=null;
    if(due.length){try{source=await goalooIndex();}catch(error){sourceError=error;}}
    for(const record of due){
      const key=`record:${record.matchId}`;
      try{
        if(sourceError)throw sourceError;
        const fixture=await goalooFixture(record,source),checkedAt=Date.now();
        const traced={...record,settlementGoalooId:fixture.goalooId,settlementSource:SETTLEMENT_SOURCE,settlementMatchMode:fixture.matchMode};
        if(fixture.status==='FT'&&fixture.finalScore?.home!==null&&fixture.finalScore?.away!==null){
          await this.state.storage.put(key,settleRecord(traced,fixture.finalScore,'FT',checkedAt,{source:SETTLEMENT_SOURCE,sourceMatchId:fixture.goalooId,matchMode:fixture.matchMode}));settled++;
        }else{
          await this.state.storage.put(key,{...traced,lastSettlementCheckAt:checkedAt,nextSettlementCheckAt:checkedAt+SETTLEMENT_RETRY_MS,settlementError:null});
        }
      }catch(error){
        errors++;
        const checkedAt=Date.now();
        await this.state.storage.put(key,{...record,lastSettlementCheckAt:checkedAt,nextSettlementCheckAt:checkedAt+SETTLEMENT_ERROR_RETRY_MS,settlementError:clean(error?.message||error,240),settlementSource:SETTLEMENT_SOURCE});
      }
    }
    await this.state.storage.put('meta:settlement',{source:SETTLEMENT_SOURCE,reason,ranAt:Date.now(),due:due.length,settled,errors});
    await this.scheduleNext();
    return {source:SETTLEMENT_SOURCE,due:due.length,settled,errors};
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
