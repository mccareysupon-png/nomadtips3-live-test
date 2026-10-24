const MATCH=/^[0-9]{4,18}$/;
const VOTER=/^[a-f0-9]{8}-[a-f0-9-]{27,}$/;
const CHOICES=['1','X','2'],PREFIX='v1:';
const json=(obj,status=200)=>Response.json(obj,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function stats(kv,id,voter=''){
 const prefix=PREFIX+id+':',counts=[0,0,0];let myPick=null,cursor,seen=0;
 do{const d=await kv.list({prefix,limit:1000,...(cursor?{cursor}:{})});
 for(const key of d.keys||[]){const parts=key.name.slice(prefix.length).split(':'),c=parts.at(-1);
  if(!CHOICES.includes(c))continue;counts[CHOICES.indexOf(c)]++;
  if(voter&&parts.slice(0,-1).join(':')===voter)myPick=c;}
 seen+=d.keys?.length||0;cursor=d.list_complete?null:d.cursor;
 }while(cursor&&seen<10000);
 return{ok:true,fixtureId:id,counts,total:counts.reduce((a,b)=>a+b,0),myPick,limited:!!cursor};
}
async function isLive(env,id){
 const r=await env.HUB.fetch('https://hub.internal/snapshot');if(!r.ok)return false;
 const j=await r.json();if(!j.ok||j.stale===true)return false;
 const f=(j.fixtures||[]).find(x=>String(x.fixtureId)===id);
 return !!f&&['live','halftime','ht','in_play','inplay'].includes(String(f.boardState||'').toLowerCase());
}
export async function voteRoute(req,env){
 try{
  if(!env.PREDICTION_VOTES_KV)return json({ok:false,error:'VOTE_STORAGE_UNAVAILABLE'},503);
  const url=new URL(req.url);let id='',voter='',choice='';
  if(req.method==='GET'){id=url.searchParams.get('fixtureId')||'';voter=url.searchParams.get('voterId')||'';}
  else if(req.method==='POST'){
   const origin=req.headers.get('Origin');if(origin&&new URL(origin).host!==url.host)return json({ok:false,error:'BAD_ORIGIN'},403);
   if(!String(req.headers.get('content-type')||'').includes('application/json'))return json({ok:false,error:'BAD_CONTENT_TYPE'},415);
   if(Number(req.headers.get('content-length')||0)>1024)return json({ok:false,error:'TOO_LARGE'},413);
   const raw=await req.text();if(raw.length>1024)return json({ok:false,error:'TOO_LARGE'},413);
   let b;try{b=JSON.parse(raw)}catch{return json({ok:false,error:'INVALID_JSON'},400)}
   id=String(b.fixtureId||'');voter=String(b.voterId||'').toLowerCase();choice=String(b.choice||'');
  }else return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  if(!MATCH.test(id)||voter&&!VOTER.test(voter))return json({ok:false,error:'INVALID_ID'},400);
  if(req.method==='POST'){
   if(!voter||!CHOICES.includes(choice))return json({ok:false,error:'INVALID_VOTE'},400);
   if(!(await isLive(env,id)))return json({ok:false,error:'MATCH_NOT_LIVE'},409);
   const prefix=PREFIX+id+':'+voter+':';
   await Promise.all(CHOICES.filter(c=>c!==choice).map(c=>env.PREDICTION_VOTES_KV.delete(prefix+c)));
   await env.PREDICTION_VOTES_KV.put(prefix+choice,'1',{expirationTtl:86400*30});
  }
  return json(await stats(env.PREDICTION_VOTES_KV,id,voter));
 }catch{return json({ok:false,error:'VOTE_TEMPORARILY_UNAVAILABLE'},503)}
}
