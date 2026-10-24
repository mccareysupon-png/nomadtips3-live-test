const COOKIE='__Secure-b46-prediction-v6',OUTCOMES=['1','X','2'];
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','vary':'Cookie',...extra}});
let boardCache={at:0,data:null,promise:null};
async function fixture(env,id,readBoard,force=false){const now=Date.now();if(force||!boardCache.data||now-boardCache.at>5000){if(!boardCache.promise)boardCache.promise=(async()=>{if(typeof readBoard!=='function')throw Error('BOARD_UNAVAILABLE');const response=await readBoard();if(!response.ok)throw Error('BOARD_UNAVAILABLE');const data=await response.json();if(!data.ok||data.stale===true||!Array.isArray(data.fixtures))throw Error('BOARD_UNAVAILABLE');boardCache={at:Date.now(),data,promise:null};})().catch(e=>{boardCache.promise=null;throw e;});await boardCache.promise;}return boardCache.data.fixtures.find(f=>String(f.fixtureId)===id)||null;}
async function smallJson(request){const reader=request.body?.getReader();if(!reader)throw Error('INVALID_JSON');let size=0,chunks=[];for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();throw Error('TOO_LARGE');}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const value of chunks){bytes.set(value,at);at+=value.byteLength;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('INVALID_JSON');}}
export async function predictionVoteRoute(request,env,readBoard){try{
 const url=new URL(request.url),host=url.hostname,production=['ball46.com','www.ball46.com'].includes(host),preview=/^[a-f0-9]{8}-ball46-production\.mccarey-supon\.workers\.dev$/.test(host);
 if(!production&&!preview)return json({ok:false,error:'HOST_NOT_ALLOWED'},403);
 if(!env.PREDICTION_VOTES_SERVICE||!env.HUB)return json({ok:false,error:'VOTE_STORAGE_UNAVAILABLE'},503);
 if(url.pathname==='/api/prediction-vote/health'){if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);const r=await env.PREDICTION_VOTES_SERVICE.fetch('https://votes.internal/health');return json(await r.json(),r.status);}
 let id='',choice='';
 if(request.method==='GET')id=url.searchParams.get('fixtureId')||'';
 else if(request.method==='POST'){
  const origin=request.headers.get('origin');if(!origin||new URL(origin).origin!==url.origin)return json({ok:false,error:'BAD_ORIGIN'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return json({ok:false,error:'BAD_CONTENT_TYPE'},415);
  const data=await smallJson(request);if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['fixtureId','choice'].includes(k)))return json({ok:false,error:'INVALID_VOTE'},400);
  id=String(data.fixtureId??'');choice=data.choice;if(!OUTCOMES.includes(choice))return json({ok:false,error:'INVALID_CHOICE'},400);
 }else return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{'allow':'GET, POST'});
 if(!/^\d{4,18}$/.test(id))return json({ok:false,error:'INVALID_FIXTURE'},400);
 const f=await fixture(env,id,readBoard,request.method==='POST');if(!f)return json({ok:false,error:'FIXTURE_NOT_FOUND'},404);
 const status=String(f.boardState||'').toLowerCase(),canVote=['scheduled','live','halftime','ht','in_play','inplay'].includes(status);
 if(request.method==='POST'&&!canVote)return json({ok:false,error:'VOTING_CLOSED'},409);
 const rawIp=request.headers.get('cf-connecting-ip');if(!rawIp)return json({ok:false,error:'CLIENT_UNAVAILABLE'},503);
 const ip=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new Date().toISOString().slice(0,10)+':ball46-vote-v6:'+rawIp)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const response=await env.PREDICTION_VOTES_SERVICE.fetch('https://votes.internal/vote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scope:production?'production':'preview',method:request.method,fixtureId:id,choice,token,ip})}),data=await response.json(),extra={};
 if(response.headers.has('retry-after'))extra['retry-after']=response.headers.get('retry-after');
 if(data.sessionToken)extra['set-cookie']=COOKIE+'='+data.sessionToken+'; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax'+(production?'; Domain=ball46.com':'');
 delete data.sessionToken;return json({...data,canVote},response.status,extra);
 }catch(error){if(['TOO_LARGE','INVALID_JSON'].includes(error.message))return json({ok:false,error:error.message},error.message==='TOO_LARGE'?413:400);return json({ok:false,error:'VOTE_TEMPORARILY_UNAVAILABLE'},503);}}
