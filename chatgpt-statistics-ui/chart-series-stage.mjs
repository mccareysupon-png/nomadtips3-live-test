// BALL46 STAGING ONLY. All-market / all-time graph is derived from a verified
// complete Ledger with the exact CURRENT longterm-performance-343.js logic.
// This is not a source of truth for settlement, odds, or payout calculations.
export const GRAPH_SCHEMA=1;
const RESULTS=new Set(['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS']);
const dateMs=v=>{
  const n=num(v);
  if(n!==null)return n<1e12?n*1000:n;
  const p=Date.parse(String(v||''));
  return Number.isFinite(p)?p:0;
};
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||
  !Number.isFinite(Number(v))?null:Number(v);
const outcome=r=>String(r?.result||r?.settlement||r?.outcome||'').trim().toUpperCase();
const isSettled=r=>(!r.status||String(r.status).toUpperCase()==='SETTLED')&&RESULTS.has(outcome(r));
const bangkokDayKey=ms=>{
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms))}
  catch{return new Date(ms).toISOString().slice(0,10)}
};
function settlement(r){
  const o=outcome(r),odds=num(r?.odds);
  if(o==='PUSH'||o==='VOID')return {profit:0,stake:1,priced:true};
  if(o==='LOSS')return {profit:-1,stake:1,priced:true};
  if(o==='HALF_LOSS')return {profit:-.5,stake:1,priced:true};
  if(o==='WIN'){
    if(odds===null||odds<=1)return {profit:null,stake:0,priced:false};
    return {profit:odds-1,stake:1,priced:true};
  }
  if(o==='HALF_WIN'){
    if(odds===null||odds<=1)return {profit:null,stake:0,priced:false};
    return {profit:(odds-1)/2,stake:1,priced:true};
  }
  return {profit:null,stake:0,priced:false};
}
// Fail closed if the active Production chart formula was changed without
// updating and independently validating this STAGING projection.
export function verifyChartSourceContract(source){
  if(typeof source!=='string'||source.length<10000)throw Error('CHART_SOURCE_MISSING');
  for(const anchor of [
    "function settlement(r){const o=outcome(r),odds=num(r);",
    "return{profit:(odds-1)/2,stake:1,priced:true}",
    "maxDD=Math.max(maxDD,peak-net)",
    "const wl=wins+losses;ratePoints.push(",
    "function dailyUnitPoints(points){/* B46_DAILY_OHLC_CHART_V8_20261012 */",
    "function f46Points(s){const raw=getPoints(s)",
    "const days=new Map();for(const p of raw)days.set(bangkokDayKey(p.date)",
    "function filteredRows(){const f=routeFilter();let rows=rowsCache.slice();"
  ])if(!source.includes(anchor))throw Error('CHART_SOURCE_DRIFT_'+anchor.slice(0,45));
  return true;
}
export function buildVerifiedGraph(rows, snapshotSavedAt){
  if(!Array.isArray(rows)||!Number.isFinite(snapshotSavedAt)||snapshotSavedAt<=0)
    throw Error('GRAPH_SOURCE_NOT_VERIFIED');
  const settled=rows.filter(isSettled);
  // Stable sorting preserves the native renderer's tie-breaking order.
  settled.sort((a,b)=>dateMs(a?.settledAt??a?.createdAt)-dateMs(b?.settledAt??b?.createdAt));
  let winCredits=0,wins=0,losses=0,pushes=0,net=0,stake=0,priced=0,
    oddsSum=0,oddsN=0,peak=0,maxDD=0,trough=0,bestRun=0;
  const unitPoints=[],roiPoints=[],ratePoints=[];
  for(const r of settled){
    const o=outcome(r);
    winCredits+=o==='WIN'?1:o==='HALF_WIN'?.5:0;
    if(o==='WIN'||o==='HALF_WIN')wins++;
    else if(o==='LOSS'||o==='HALF_LOSS')losses++;
    else if(o==='PUSH'||o==='VOID')pushes++;
    const odd=num(r?.odds);
    if(odd!==null&&odd>1){oddsSum+=odd;oddsN++}
    const s=settlement(r),date=dateMs(r?.settledAt??r?.createdAt);
    if(s.priced){
      priced++;stake+=s.stake;net+=s.profit;peak=Math.max(peak,net);
      maxDD=Math.max(maxDD,peak-net);trough=Math.min(trough,net);
      bestRun=Math.max(bestRun,net-trough);
      unitPoints.push({value:net,profit:s.profit,date});
      roiPoints.push({value:stake?net/stake*100:0,date});
    }
    const wl=wins+losses;
    ratePoints.push({value:wl?winCredits/wl*100:0,date});
  }
  const unitDays=[];
  let day=null;
  for(const p of unitPoints){
    const close=Number(p.value),profit=Number.isFinite(p.profit)?Number(p.profit):0,
      open=close-profit,key=bangkokDayKey(p.date);
    if(!day||day.dayKey!==key){
      if(day)unitDays.push({date:day.lastDate,value:day.close});
      day={dayKey:key,open,high:Math.max(open,close),low:Math.min(open,close),
        close,lastDate:p.date};
    }else{
      day.high=Math.max(day.high,close);
      day.low=Math.min(day.low,close);
      day.close=close;
      day.lastDate=p.date;
    }
  }
  if(day)unitDays.push({date:day.lastDate,value:day.close});
  const compressDays=points=>{
    const days=new Map();
    for(const p of points)days.set(bangkokDayKey(p.date),{date:p.date,value:p.value});
    return [...days.values()];
  };
  const series={units:unitDays,roi:compressDays(roiPoints),rate:compressDays(ratePoints)};
  const summary={rows:settled.length,wins,losses,pushes,priced,net,stake,
    roi:stake?net/stake*100:null,avgOdds:oddsN?oddsSum/oddsN:null,
    maxDD,peak,bestRun};
  const result={schema:GRAPH_SCHEMA,ok:true,market:'all',variant:'all',
    filter:'all',range:'all',asOf:snapshotSavedAt,
    source:'VERIFIED_FULL_LEDGER_ONLY',summary,series};
  const body=JSON.stringify(result);
  if(Buffer.byteLength(body,'utf8')>512*1024)throw Error('GRAPH_INDEX_TOO_LARGE');
  for(const key of Object.keys(series)){
    const list=series[key];
    if(list.some(p=>!Number.isFinite(p.date)||!Number.isFinite(p.value)||
       p.date<0))throw Error('GRAPH_NONFINITE_'+key);
    for(let i=1;i<list.length;i++){
      if(list[i].date<list[i-1].date)throw Error('GRAPH_DATE_ORDER_'+key);
    }
  }
  return {result,body,bytes:Buffer.byteLength(body,'utf8')};
}
