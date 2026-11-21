// Source of truth audit: only read deployed JavaScript and the precomputed
// RECEIVER graph. Never POST, replay the 61MB legacy statistics endpoint,
// or access market-price providers.
const base='https://ball46.com';
async function get(path){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),16000);
 try{const r=await fetch(base+path,{cache:'no-store',headers:{accept:'*/*'},signal:ctl.signal});
   return {status:r.status,body:r.ok?await r.text():'',type:r.headers.get('content-type')};
 }finally{clearTimeout(t)}
}
const path='/longterm-performance-343.js';
try{
 const r=await get(path+'?ref=20261121-current-live-stats');
 const src=r.body;
 const needles=['function routeFilter()','function b46Query()','function b46Valid(','function b46Legacy()','function stats(rows)','function settlement(','function outcome(','function dailyUnitPoints(','function f46Points(','function render(force=false)','b46GraphData={...g.summary'];
 const cases=needles.map(needle=>{
  const at=src.indexOf(needle);
  return {needle,found:at>=0,excerpt:at>=0?src.slice(at,at+1750).replace(/\n/g,' '):''};
 });
 console.log('LIVE_STATS_ACTUAL_SOURCE '+JSON.stringify({status:r.status,bytes:src.length,cases}));
}catch(e){console.log('LIVE_STATS_SOURCE_ERROR '+JSON.stringify({error:String(e)}))}
for(const params of [
 {market:'all',variant:'all',filter:'all',range:'all'},
 {market:'all',variant:'',filter:'',range:'all'},
 {market:'all',variant:'all',filter:'settled',range:'all'}
]){
 const qs=new URLSearchParams(params).toString();
 try{
  const r=await get('/b46-receiver-v1/graph?'+qs);
  let data;try{data=JSON.parse(r.body)}catch{}
  const summary=data?.summary;
  const series=data?.series;
  const shape={status:r.status,query:qs,ok:data?.ok,source:data?.source,schema:data?.schema,sequence:data?.sequence,
    market:data?.market,variant:data?.variant,filter:data?.filter,range:data?.range,keys:Object.keys(data||{}).slice(0,30),
    summaryKeys:Object.keys(summary||{}).slice(0,60),summaryValues:summary&&Object.fromEntries(Object.entries(summary).filter(([k,v])=>typeof v==='number').slice(0,20)),
    countKeys:Object.keys(data?.counts||{}).slice(0,40),
    series:Object.fromEntries(Object.entries(series||{}).slice(0,5).map(([k,v])=>[k,{length:v.length,point:v[0],last:v.at(-1)}]))};
  console.log('LIVE_RECEIVER_GRAPH '+JSON.stringify(shape));
  if(data?.ok===true)break;
 }catch(e){console.log('LIVE_RECEIVER_GRAPH_ERROR '+JSON.stringify({query:qs,error:String(e)}))}
}
