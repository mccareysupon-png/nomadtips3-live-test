/**
 * BALL46 Pre-Match performance ledger projection (isolated, TEST-ONLY staging).
 * This is a PURE reducer, not a production settlement handler.
 * The owner must call applyLedgerEvent ONCE in the same atomic transaction as
 * a unique, authoritative settlement ledger event, then persist the snapshot.
 * Read routes serve the persisted snapshot; they must never replay match rows.
 * The test UI must not claim this module is already connected to the worker.
 */
export const SCHEMA=1;
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const numeric=(n,what)=>{const v=Number(n);if(!Number.isFinite(v))throw Error('INVALID_'+what);return v;};
const int=(n,what)=>{const v=numeric(n,what);if(!Number.isSafeInteger(v))throw Error('INVALID_'+what);return v;};
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
export const londonBusinessDay=(when)=>{
  const ms=typeof when==='number'?(when<1e11?when*1000:when):Date.parse(when);
  if(!Number.isFinite(ms))throw Error('INVALID_EVENT_TIME');
  const p=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  const utc=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day));
  return new Date(utc-(Number(p.hour)<6?86400000:0)).toISOString().slice(0,10);
};
export const emptyPerformance=()=>({
  schema:SCHEMA,market:'1X2',unitStake:1,timezone:'Europe/London',cutoff:'06:00',
  lastSequence:0,picks:0,pending:0,settled:0,win:0,draw:0,loss:0,halfWin:0,halfLoss:0,
  netUnits:0,stakedUnits:0,oddsSum:0,oddsCount:0,daily:[],updatedAt:null,
  // The source Ledger must enforce unique (market,signalId) on SELECTED and
  // unique SETTLED transition; monotonic event sequences are required.
});
const dayRow=date=>({date,picks:0,settled:0,win:0,draw:0,loss:0,halfWin:0,halfLoss:0,netUnits:0,stakedUnits:0,oddsSum:0,oddsCount:0,cumulativeUnits:0});
const getDay=(snapshot,date)=>{
  let row=snapshot.daily.find(r=>r.date===date);
  if(!row){row=dayRow(date);snapshot.daily.push(row);snapshot.daily.sort((a,b)=>a.date.localeCompare(b.date));}
  return row;
};
const outcomeOf=(status,odds)=>{
  const state=String(status||'').trim().toUpperCase().replace(/[_-]/g,' ');
  if(!['WIN','LOSS','PUSH','DRAW','HALF WIN','HALF LOSS'].includes(state))throw Error('UNSUPPORTED_SETTLEMENT');
  if(state==='WIN'||state==='HALF WIN')return {state,units:round((odds-1)*(state==='HALF WIN'?.5:1))};
  if(state==='LOSS'||state==='HALF LOSS')return {state,units:state==='LOSS'?-1:-.5};
  return {state:'PUSH',units:0};
};
export function applyLedgerEvent(snapshot,event){
  if(!snapshot||snapshot.schema!==SCHEMA)throw Error('INVALID_PERFORMANCE_SCHEMA');
  if(snapshot.market!=='1X2')throw Error('INVALID_PERFORMANCE_MARKET');
  const seq=int(event.sequence,'SEQUENCE');
  if(seq<=snapshot.lastSequence)return {snapshot,applied:false,reason:'ALREADY_APPLIED'};
  if(seq!==snapshot.lastSequence+1)throw Error('EVENT_SEQUENCE_GAP');
  if(!event.signalId||typeof event.signalId!=='string')throw Error('SIGNAL_ID_REQUIRED');
  const action=String(event.action||'').toUpperCase();
  const next=structuredClone(snapshot);
  const selectionOdds=numeric(event.odds,'LOCKED_ODDS');
  if(selectionOdds<=1||selectionOdds>1000)throw Error('INVALID_LOCKED_ODDS');
  if(action==='SELECTED'){
    const date=londonBusinessDay(event.pickedAt);
    next.picks++;next.pending++;next.oddsCount++;next.oddsSum=round(next.oddsSum+selectionOdds);
    const r=getDay(next,date);r.picks++;r.oddsCount++;r.oddsSum=round(r.oddsSum+selectionOdds);
  }else if(action==='SETTLED'){
    if(next.pending<=0)throw Error('SETTLEMENT_WITHOUT_PENDING');
    const date=londonBusinessDay(event.settledAt);
    const {state,units}=outcomeOf(event.status,selectionOdds);
    // A settlement event MUST come from the authoritative immutable Ledger.
    // Unit values derive only from the ODDS LOCKED AT SELECTION.
    if(event.units!==undefined&&Math.abs(numeric(event.units,'UNITS')-units)>0.00001)throw Error('UNITS_NOT_MATCHING_LOCKED_ODDS');
    next.pending--;next.settled++;next.netUnits=round(next.netUnits+units);next.stakedUnits=round(next.stakedUnits+1);
    const r=getDay(next,date);r.settled++;r.netUnits=round(r.netUnits+units);r.stakedUnits=round(r.stakedUnits+1);
    const field=state==='WIN'?'win':state==='LOSS'?'loss':state==='HALF WIN'?'halfWin':state==='HALF LOSS'?'halfLoss':'draw';
    next[field]++;r[field]++;
  }else throw Error('UNSUPPORTED_LEDGER_EVENT');
  let total=0;
  for(const r of next.daily){total=round(total+r.netUnits);r.cumulativeUnits=total;}
  next.lastSequence=seq;
  next.updatedAt=String(event.settledAt||event.pickedAt);
  return {snapshot:next,applied:true};
}
export function performanceView(snapshot,range='ALL',endDay=null){
  if(snapshot?.schema!==SCHEMA)throw Error('INVALID_PERFORMANCE_SCHEMA');
  const allowed=['7D','30D','90D','ALL'];
  if(!allowed.includes(range))throw Error('INVALID_PERFORMANCE_RANGE');
  const days=Number.parseInt(range,10);
  const end=endDay||snapshot.daily.at(-1)?.date||null;
  const start=range==='ALL'||!end?null:new Date(Date.parse(end+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
  const entries=snapshot.daily.filter(r=>(!start||r.date>=start)&&(!end||r.date<=end));
  const previous=snapshot.daily.filter(r=>start&&r.date<start).at(-1)?.cumulativeUnits??0;
  const win=entries.reduce((t,r)=>t+r.win+r.halfWin,0),loss=entries.reduce((t,r)=>t+r.loss+r.halfLoss,0);
  const draw=entries.reduce((t,r)=>t+r.draw,0);
  const settled=entries.reduce((t,r)=>t+r.settled,0);
  const staked=entries.reduce((t,r)=>t+r.stakedUnits,0);
  const net=round(entries.reduce((t,r)=>t+r.netUnits,0));
  const picks=entries.reduce((t,r)=>t+r.picks,0);
  const oddsSum=round(entries.reduce((t,r)=>t+r.oddsSum,0));
  const oddsCount=entries.reduce((t,r)=>t+r.oddsCount,0);
  const points=entries.map(r=>({date:r.date,netUnits:round(r.cumulativeUnits-previous),roi:r.stakedUnits?null:null,winRate:null}));
  let st=0,w=0,l=0,hi=0,maxDD=0;
  const series=entries.map((r,i)=>{
    st+=r.stakedUnits;w+=r.win+r.halfWin;l+=r.loss+r.halfLoss;
    const v=points[i].netUnits;
    hi=Math.max(hi,v,0);maxDD=Math.max(maxDD,hi-v);
    return {...points[i],roi:st>0?round(v/st*100):null,winRate:w+l>0?round(w/(w+l)*100):null};
  });
  return {range,start,end,picks,settled,win,draw,loss,netUnits:net,stakedUnits:staked,
    roi:staked>0?round(net/staked*100):null,winRate:win+loss>0?round(win/(win+loss)*100):null,
    avgOdds:oddsCount>0?round(oddsSum/oddsCount):null,settledDays:entries.filter(r=>r.settled>0).length,
    maxDrawdown:round(maxDD),pending:range==='ALL'?snapshot.pending:null,series};
}
