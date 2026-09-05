const SERVICE='nomadtips3-342-ledger';
const VERSION='ledger-v1';
const API_FOOTBALL_BASE='https://v3.football.api-sports.io';
const FINAL_STATUSES=new Set(['FT','AET','PEN']);
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
  if(!fixtureId)errors.push('fixtureId');
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
    matchId,fixtureId,league:clean(body?.league,160),home,away,minute,entryScore:score,eventPass,
    configVersion:clean(body?.configVersion,80)||null,presetVersion:clean(body?.presetVersion,80)||null,
    eventMetrics:body?.eventMetrics&&typeof body.eventMetrics==='object'?body.eventMetrics:null,
    prediction:{
      oneXtwo:{pick:onePick,home:finite(one.home),draw:finite(one.draw),away:finite(one.away),odds:oneOdds},
      totals:{pick:totalsPick,line,over:finite(totals.over),under:finite(totals.under),odds:totalsOdds},
    },
    market:{
      provider:clean(body?.market?.provider,80)||'API-Football',observedAt:finite(body?.market?.observedAt),
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
export function settleRecord(record,finalScore,status,settledAt=Date.now()){
  const score=pair(finalScore);
  if(score.home===null||score.away===null)return record;
  const oneResult=gradeOneXtwo(record?.prediction?.oneXtwo?.pick,score.home,score.away);
  const totalsResult=gradeTotals(record?.prediction?.totals?.pick,record?.prediction?.totals?.line,score.home,score.away);
  const oneOdds=finite(record?.prediction?.oneXtwo?.odds),totalsOdds=finite(record?.prediction?.totals?.odds);
  return {...record,settlement:{status:'SETTLED',fixtureStatus:status,finalScore:score,settledAt,
    oneXtwo:{result:oneResult,profit:profitFor(oneResult,oneOdds)},
    totals:{result:totalsResult,profit:profitFor(totalsResult,totalsOdds)},
  },nextSettlementCheckAt:null,lastSettlementCheckAt:settledAt};
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

async function apiFixture(apiKey,fixtureId){
  if(!apiKey)throw new Error('API_FOOTBALL_KEY_MISSING');
  const url=new URL('/fixtures',API_FOOTBALL_BASE);url.searchParams.set('id',String(fixtureId));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url,{headers:{accept:'application/json','x-apisports-key':apiKey,'user-agent':'NOMADTIPS3-342-LEDGER/1.0'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`API_FOOTBALL_HTTP_${response.status}`);
    const payload=await response.json(),row=Array.isArray(payload?.response)?payload.response[0]:null;
    if(!row)throw new Error('API_FOOTBALL_FIXTURE_NOT_FOUND');
    const status=clean(row?.fixture?.status?.short,12).toUpperCase();
    const fulltime={home:finite(row?.score?.fulltime?.home),away:finite(row?.score?.fulltime?.away)};
    const goals={home:finite(row?.goals?.home),away:finite(row?.goals?.away)};
    const finalScore=fulltime.home!==null&&fulltime.away!==null?fulltime:goals;
    return {status,finalScore};
  }finally{clearTimeout(timer)}
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
    const record={...value,id:`342:${value.matchId}`,status:'LOCKED',lockedAt,settlement:null,lastSettlementCheckAt:null,nextSettlementCheckAt:lockedAt+minutesUntilCheck*60*1000};
    await this.state.storage.put(key,record);await this.scheduleNext();
    return json(request,{ok:true,locked:true,duplicate:false,record},201);
  }
  async signal(request,url){
    const requested=Math.trunc(finite(url.searchParams.get('limit'))||200),limit=Math.max(1,Math.min(MAX_SIGNAL_LIMIT,requested));
    const records=(await this.records()).slice(0,limit),summary=summarize(records);
    return json(request,{ok:true,version:VERSION,updatedAt:new Date().toISOString(),summary,records});
  }
  async statistics(request,url){
    const requested=Math.trunc(finite(url.searchParams.get('limit'))||500),limit=Math.max(1,Math.min(MAX_SIGNAL_LIMIT,requested));
    const all=await this.records(),records=all.slice(0,limit),summary=summarize(all),rows=rowsFromRecords(records);
    return json(request,{ok:true,version:VERSION,updatedAt:new Date().toISOString(),summary,rows});
  }
  async health(request){
    const records=await this.records(),summary=summarize(records);
    return json(request,{ok:true,service:SERVICE,version:VERSION,storage:'durable-object',apiFootballConfigured:Boolean(this.env.API_FOOTBALL_KEY),summary,alarmAt:iso(await this.state.storage.getAlarm())});
  }
  async settleDue(){
    const records=await this.records(),now=Date.now(),due=records.filter(record=>!record.settlement&&Number(record.nextSettlementCheckAt)<=now).slice(0,8);
    for(const record of due){
      const key=`record:${record.matchId}`;
      try{
        const fixture=await apiFixture(this.env.API_FOOTBALL_KEY,record.fixtureId),checkedAt=Date.now();
        if(FINAL_STATUSES.has(fixture.status)&&fixture.finalScore.home!==null&&fixture.finalScore.away!==null){
          await this.state.storage.put(key,settleRecord(record,fixture.finalScore,fixture.status,checkedAt));
        }else{
          await this.state.storage.put(key,{...record,lastSettlementCheckAt:checkedAt,nextSettlementCheckAt:checkedAt+SETTLEMENT_RETRY_MS});
        }
      }catch(error){
        const checkedAt=Date.now();
        await this.state.storage.put(key,{...record,lastSettlementCheckAt:checkedAt,nextSettlementCheckAt:checkedAt+SETTLEMENT_ERROR_RETRY_MS,settlementError:clean(error?.message||error,180)});
      }
    }
    await this.scheduleNext();
  }
  async alarm(){await this.settleDue();}
  async fetch(request){
    if(request.method==='OPTIONS')return json(request,{},204);
    const url=new URL(request.url);
    if(url.pathname==='/lock'&&request.method==='POST')return this.lock(request);
    if(url.pathname==='/signal'&&request.method==='GET')return this.signal(request,url);
    if(url.pathname==='/statistics'&&request.method==='GET')return this.statistics(request,url);
    if((url.pathname==='/'||url.pathname==='/health')&&request.method==='GET')return this.health(request);
    return json(request,{ok:false,error:'not_found'},404);
  }
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return json(request,{},204);
    const id=env.LEDGER.idFromName('primary');
    return env.LEDGER.get(id).fetch(request);
  }
};
