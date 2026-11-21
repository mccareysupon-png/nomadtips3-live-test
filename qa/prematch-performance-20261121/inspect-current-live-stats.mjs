// Read-only audit of the ACTUAL deployed BALL46 statistics frontend and receiver.
// Never POST/PUT or request paid market providers. Does not log user identifiers.
import assert from 'node:assert/strict';
const base='https://ball46.com';
const paths=['/longterm-performance-343.js','/b46-statistics-fast-v1-20261116.js','/b46-statistics-card-20261116.js'];
const textOrError=async(path)=>{
 const c=new AbortController();const to=setTimeout(()=>c.abort(),16000);
 try{
  const res=await fetch(base+path+'?audit=20261121',{signal:c.signal,headers:{'user-agent':'BALL46-READ-ONLY-STATS-AUDIT','accept':'*/*'},redirect:'follow',cache:'no-store'});
  return {code:res.status,type:res.headers.get('content-type'),body:res.ok?await res.text():''};
 }finally{clearTimeout(to)}
};
for(const path of paths){
 try{
  const r=await textOrError(path),body=r.body;
  const needles=['/b46-receiver-v1/graph','/api/engine/statistics','/api/engine/board',
     'daily','cumulative','roi','maxDD','WIN RATE','b46TotalMarkup','function b46','function summarize','async function','fetch(','rows.sort','[...rows]','slice('];
  const hits=[];
  for(const needle of needles){
    let at=-1,n=0;
    while((at=body.indexOf(needle,at+1))>=0&&n++<5){
      hits.push({needle,pos:at,excerpt:body.slice(Math.max(0,at-220),Math.min(body.length,at+420)).replace(/\n/g,' ')});
    }
  }
  console.log('LIVE_STATS_ASSET '+JSON.stringify({path,status:r.code,contentType:r.type,bytes:body.length,sourceShaLike:body.slice(0,90),hits:hits.slice(0,60)}));
 }catch(e){console.log('LIVE_STATS_ASSET_ERROR '+JSON.stringify({path,error:String(e)}))}
}
for(const path of ['/b46-receiver-v1/graph','/api/engine/statistics']){
 try{
  const r=await textOrError(path),body=r.body;
  let parsed;try{parsed=JSON.parse(body)}catch{}
  const shape=x=>!x||typeof x!=='object'?typeof x:Array.isArray(x)?{kind:'array',count:x.length,sampleKeys:Object.keys(x[0]||{}).slice(0,20)}:{keys:Object.keys(x).slice(0,65),sub:Object.fromEntries(Object.entries(x).filter(([k,v])=>v&&typeof v==='object').slice(0,12).map(([k,v])=>[k,{keys:Array.isArray(v)?Object.keys(v[0]||{}).slice(0,30):Object.keys(v).slice(0,45),count:Array.isArray(v)?v.length:undefined}]))};
  console.log('LIVE_STATS_API '+JSON.stringify({path,status:r.code,type:r.type,bytes:body.length,shape:shape(parsed)}));
 }catch(e){console.log('LIVE_STATS_API_ERROR '+JSON.stringify({path,error:String(e)}))}
}
