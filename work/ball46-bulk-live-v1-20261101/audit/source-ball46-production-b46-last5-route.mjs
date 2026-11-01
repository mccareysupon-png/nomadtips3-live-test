export async function historyRoute(request,env,readBoard){
 const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store',...headers}}),u=new URL(request.url);
 if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 if(!env.FORM_HISTORY_SERVICE)return json({ok:false,error:'HISTORY_NOT_CONNECTED'},503);
 if(u.pathname==='/api/form-last5/health')return env.FORM_HISTORY_SERVICE.fetch('https://history.internal/health');
 const id=u.searchParams.get('fixtureId');if(!/^\d{1,18}$/.test(id||''))return json({ok:false,error:'INVALID_FIXTURE'},400);
 try{
  const res=await readBoard(new Request(new URL('/api/engine/board',request.url),{method:'GET'}),{...env,FULL_MARKET:null});const board=await res.json();
  if(!res.ok||!board.ok||board.stale===true||!Array.isArray(board.fixtures))return json({ok:false,error:'BOARD_UNAVAILABLE'},503);
  const f=board.fixtures.find(f=>String(f.fixtureId)===id);if(!f)return json({ok:false,error:'FIXTURE_NOT_FOUND'},404);
  const home=String(f.home?.id||''),away=String(f.away?.id||''),kickoff=Date.parse(f.kickoffUtc||'');
  if(!/^\d{1,18}$/.test(home)||!/^\d{1,18}$/.test(away)||home===away||!Number.isFinite(kickoff)||kickoff<=0)return json({ok:false,error:'TEAM_METADATA_UNAVAILABLE'},422);
  const cutoff=kickoff,url=new URL('https://history.internal/last5');url.search=new URLSearchParams({fixtureId:id,home,away,cutoff:String(cutoff)});
  const r=await env.FORM_HISTORY_SERVICE.fetch(url.toString());return new Response(r.body,{status:r.status,headers:r.headers});
 }catch{return json({ok:false,error:'HISTORY_TEMPORARILY_UNAVAILABLE'},503);}
}
