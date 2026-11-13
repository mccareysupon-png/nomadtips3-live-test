// Test integration contract only; no public route is installed by importing it.
export function summaryReader(shadow,{allowTestPreview=false,now=()=>Date.now(),maxAgeMs=90000}={}){
 return async request=>{
  if(request.method!=='GET')return Response.json({ok:false,error:'READ_ONLY'},{status:405});
  if(!allowTestPreview)return Response.json({ok:false,error:'NOT_ACTIVATED'},{status:503});
  const u=new URL(request.url),market=u.searchParams.get('market');
  if(market!==null&&!/^[a-z0-9_]{1,100}$/.test(market))return Response.json({ok:false,error:'INVALID_MARKET'},{status:400});
  const snapshot=await shadow.read(market?'market/'+market:'all');
  if(!snapshot.countsVerified)return Response.json({ok:false,error:'INCOMPLETE_SUMMARY'},{status:503});
  const asOf=Number(snapshot.source.asOf);
  if(!Number.isFinite(asOf)||asOf<=0||asOf>now()+60000)return Response.json({ok:false,error:'INVALID_SOURCE_TIME'},{status:503});
  return Response.json({ok:true,mode:'TEST_PREVIEW',generation:snapshot.source.generation,asOf,stale:now()-asOf>maxAgeMs,market:market||'all',summary:snapshot.summary},{headers:{'cache-control':'no-store'}});
 };
}
