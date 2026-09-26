const finite=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value));
const num=value=>finite(value)?Number(value):null;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

export const FIVEUSD_EVENT_FLOW_VERSION='341-5usd-flow-v1-343-parity';
export const FIVEUSD_EVENT_FLOW_RATE_WINDOW_MINUTES=5;
export const FIVEUSD_EVENT_FLOW_EMA_ALPHA=.48;
export const FIVEUSD_EVENT_FLOW_MIN_AVAILABLE_WEIGHT=40;
export const FIVEUSD_EVENT_FLOW_WEIGHTS=Object.freeze({
  dangerousAttacks:30,
  shotsOnTarget:25,
  attacks:20,
  shotsOffTarget:10,
  corners:10,
  possession:5,
});
export const FIVEUSD_EVENT_FLOW_CAPS_5=Object.freeze({
  dangerousAttacks:8,
  shotsOnTarget:2,
  attacks:14,
  shotsOffTarget:3,
  corners:2,
});

function pairFromStat(stats,key,aliases=[]){
  const source=[key,...aliases].map(name=>stats?.[name]).find(value=>value&&typeof value==='object')||null;
  return source?{home:num(source.home),away:num(source.away)}:{home:null,away:null};
}

export function flowSnapshotFromFixture(fixture,observedAt=Date.now()){
  if(!fixture?.fixtureId||!finite(fixture?.minute)) return null;
  const stats=fixture?.stats||{};
  return {
    fixtureId:String(fixture.fixtureId),
    at:Number(observedAt),
    minute:Number(fixture.minute),
    attacks:pairFromStat(stats,'attacks'),
    dangerousAttacks:pairFromStat(stats,'dangerousAttack',['dangerousAttacks']),
    shotsOnTarget:pairFromStat(stats,'shotsOn',['shotsOnTarget']),
    shotsOffTarget:pairFromStat(stats,'shotsOff',['shotsOffTarget']),
    corners:pairFromStat(stats,'corners'),
    possession:pairFromStat(stats,'possession'),
  };
}

export function appendFiveUsdEventFlowHistory(history=[],fixture,observedAt=Date.now(),limit=130){
  const snapshot=flowSnapshotFromFixture(fixture,observedAt);
  if(!snapshot) return Array.isArray(history)?clone(history):[];
  const minute=Number(snapshot.minute);
  const rows=(Array.isArray(history)?history:[])
    .filter(row=>finite(row?.minute)&&Number(row.minute)!==minute)
    .concat(snapshot)
    .sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.at)-Number(b.at));
  return rows.slice(-Math.max(10,Math.min(180,Number(limit)||130)));
}

export function cleanFiveUsdEventFlowHistory(rows=[]){
  const sorted=(Array.isArray(rows)?rows:[])
    .filter(row=>finite(row?.at)&&finite(row?.minute))
    .slice()
    .sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.at)-Number(b.at));
  const byMinute=new Map();
  for(const row of sorted) byMinute.set(Number(row.minute),row);
  return [...byMinute.values()].sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.at)-Number(b.at));
}

function sideValue(row,key,side){return num(row?.[key]?.[side]);}

function metricIntensity(cur,prev,key,side,elapsedMinutes){
  const current=sideValue(cur,key,side),previous=sideValue(prev,key,side);
  if(current===null||previous===null||current<previous) return null;
  const cap5=Number(FIVEUSD_EVENT_FLOW_CAPS_5[key]||1);
  const cap=Math.max(cap5*.1,cap5*(Math.max(.5,elapsedMinutes)/FIVEUSD_EVENT_FLOW_RATE_WINDOW_MINUTES));
  return clamp((current-previous)/cap,0,1);
}

function possessionIntensity(cur,side){
  const possession=sideValue(cur,'possession',side);
  if(possession===null) return null;
  return clamp((possession-35)/30,0,1);
}

export function rawFiveUsdMomentum(cur,prev,side){
  if(!cur||!prev) return null;
  const elapsed=Math.max(.5,(Number(cur.at)-Number(prev.at))/60_000);
  const metrics=[
    ['dangerousAttacks',metricIntensity(cur,prev,'dangerousAttacks',side,elapsed)],
    ['shotsOnTarget',metricIntensity(cur,prev,'shotsOnTarget',side,elapsed)],
    ['attacks',metricIntensity(cur,prev,'attacks',side,elapsed)],
    ['shotsOffTarget',metricIntensity(cur,prev,'shotsOffTarget',side,elapsed)],
    ['corners',metricIntensity(cur,prev,'corners',side,elapsed)],
    ['possession',possessionIntensity(cur,side)],
  ];
  let weighted=0,available=0;
  for(const [key,intensity] of metrics){
    if(intensity===null) continue;
    const weight=FIVEUSD_EVENT_FLOW_WEIGHTS[key]||0;
    weighted+=intensity*weight;
    available+=weight;
  }
  if(available<FIVEUSD_EVENT_FLOW_MIN_AVAILABLE_WEIGHT) return null;
  return clamp(weighted/available*100,1,100);
}

export function buildFiveUsdEventFlowSeries(rows=[]){
  const src=cleanFiveUsdEventFlowHistory(rows),out=[];
  let homeSmooth=null,awaySmooth=null;
  for(let index=0;index<src.length;index++){
    const cur=src[index],prev=index>0?src[index-1]:null;
    const homeRaw=rawFiveUsdMomentum(cur,prev,'home');
    const awayRaw=rawFiveUsdMomentum(cur,prev,'away');
    if(homeRaw!==null) homeSmooth=homeSmooth===null?homeRaw:(homeRaw*FIVEUSD_EVENT_FLOW_EMA_ALPHA+homeSmooth*(1-FIVEUSD_EVENT_FLOW_EMA_ALPHA));
    if(awayRaw!==null) awaySmooth=awaySmooth===null?awayRaw:(awayRaw*FIVEUSD_EVENT_FLOW_EMA_ALPHA+awaySmooth*(1-FIVEUSD_EVENT_FLOW_EMA_ALPHA));
    out.push({
      at:Number(cur.at),
      minute:Number(cur.minute),
      home:homeSmooth===null?null:Math.round(clamp(homeSmooth,1,100)*10)/10,
      away:awaySmooth===null?null:Math.round(clamp(awaySmooth,1,100)*10)/10,
      homeRaw:homeRaw===null?null:Math.round(homeRaw*10)/10,
      awayRaw:awayRaw===null?null:Math.round(awayRaw*10)/10,
    });
  }
  return out;
}

export function buildFiveUsdEventFlow(fixtures=[],historyByFixture={},observedAt=Date.now(),{historyLimit=130}={}){
  const nextHistory={...clone(historyByFixture||{})};
  const flowByFixture={};
  for(const fixture of Array.isArray(fixtures)?fixtures:[]){
    if(!fixture?.fixtureId||fixture?.boardState!=='live') continue;
    const id=String(fixture.fixtureId);
    const history=appendFiveUsdEventFlowHistory(nextHistory[id]||[],fixture,observedAt,historyLimit);
    nextHistory[id]=history;
    const series=buildFiveUsdEventFlowSeries(history);
    flowByFixture[id]={
      fixtureId:id,
      version:FIVEUSD_EVENT_FLOW_VERSION,
      updatedAt:observedAt,
      axis:{x:'MATCH_MINUTE',yMin:0,yMax:100},
      independentSides:true,
      historyPoints:history.length,
      series:series.filter(point=>point.home!==null&&point.away!==null),
      latest:series.filter(point=>point.home!==null&&point.away!==null).at(-1)||null,
    };
  }
  return {updatedAt:observedAt,history:nextHistory,flows:flowByFixture};
}
