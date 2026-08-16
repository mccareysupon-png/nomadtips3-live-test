const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const FLASHDATA='https://m.goaloo.com/flashdata/get';
const POLL_MS=1500;

const EVENT_TYPES={
  20:'DANGEROUS ATTACK',
  21:'ATTACK',
  22:'POSSESSION',
  23:'GOAL',
  24:'YELLOW CARD',
  25:'RED CARD',
  26:'DANGEROUS FREE KICK',
  27:'PENALTY',
  28:'SHOT ON TARGET',
  29:'SHOT OFF TARGET',
  30:'SUBSTITUTION',
  31:'OFFSIDE',
  32:'FREE KICK',
  33:'THROW IN',
  34:'CORNER',
  35:'PENALTY GOAL',
  36:'PENALTY MISSED',
  37:'FOUL',
  38:'GOAL DISALLOWED',
  39:'DANGEROUS FREE KICK',
  40:'STOPPAGE',
  41:'SHOT BLOCKED',
  42:'INJURY TIME',
  43:'VAR CHECKING',
  44:'VAR RED CARD',
  45:'VAR GOAL DISALLOWED',
  46:'VAR PENALTY'
};

const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clamp01=v=>{const n=num(v);return n===null?null:Math.max(0,Math.min(1,n));};
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...HEADERS,'cache-control':cache}});
const rows=s=>String(s||'').split('^').map(x=>x.trim()).filter(Boolean);

function pointRow(raw){
  const p=String(raw||'').split(',');
  const pointId=num(p[0]),teamId=String(p[1]||''),x=clamp01(p[2]),y=clamp01(p[3]),eventId=String(p[4]||'');
  if(pointId===null||!teamId||x===null||y===null||!eventId)return null;
  return{pointId,teamId,x,y,eventId,playerNumber:String(p[5]||''),playerName:String(p[6]||'')};
}

function graphRow(raw,meta,pointsByEvent){
  const p=String(raw||'').split(','),id=num(p[0]),teamId=String(p[1]||''),code=num(p[2]);
  if(id===null||!teamId||code===null)return null;
  const eventId=String(p[9]||''),eventPoints=eventId?(pointsByEvent.get(eventId)||[]):[];
  const team=teamId===String(meta.homeTeamId)?'HOME':teamId===String(meta.awayTeamId)?'AWAY':'UNKNOWN';
  return{
    id,
    teamId,
    team,
    code,
    type:EVENT_TYPES[code]||`EVENT ${code}`,
    location:num(p[3]),
    state:num(p[4]),
    minute:num(p[5]),
    injuryMinute:num(p[6])||0,
    eventId,
    playerNumber:String(p[10]||''),
    playerName:String(p[11]||''),
    points:eventPoints.map(x=>({id:x.pointId,x:x.x,y:x.y})),
    x:eventPoints.length?eventPoints[eventPoints.length-1].x:null,
    y:eventPoints.length?eventPoints[eventPoints.length-1].y:null,
    coordinateSource:eventPoints.length?'SOURCE_XY':'EVENT_ONLY'
  };
}

function chooseChunk(source,matchId){
  return String(source||'').split('$$').map(x=>x.trim()).find(chunk=>chunk.split('!')[0]?.split('^')[0]===String(matchId))||'';
}

export function parseFlashData(source,{matchId,homeTeamId=null,awayTeamId=null}={}){
  const chunk=chooseChunk(source,matchId);
  if(!chunk)return{ok:false,matchId:String(matchId||''),reason:'MATCH_NOT_FOUND_IN_FLASHDATA',events:[],points:[]};
  const parts=chunk.split('!'),header=String(parts[0]||'').split('^'),isFull=parts.length>=6;
  const meta={
    matchId:String(header[0]||matchId||''),
    homeTeamId:isFull?String(header[4]||''):String(homeTeamId||''),
    awayTeamId:isFull?String(header[5]||''):String(awayTeamId||''),
    homeScore:num(isFull?header[6]:header[1]),
    awayScore:num(isFull?header[7]:header[2]),
    state:num(isFull?header[8]:header[3]),
    sourceMode:isFull?'FULL':'CHANGE'
  };
  const graphSection=parts[isFull?3:1]||'',pointSection=parts[isFull?5:3]||'';
  const points=rows(pointSection).map(pointRow).filter(Boolean);
  const pointsByEvent=new Map();
  for(const point of points){if(!pointsByEvent.has(point.eventId))pointsByEvent.set(point.eventId,[]);pointsByEvent.get(point.eventId).push(point);}
  for(const list of pointsByEvent.values())list.sort((a,b)=>a.pointId-b.pointId);
  const events=rows(graphSection).map(raw=>graphRow(raw,meta,pointsByEvent)).filter(Boolean).sort((a,b)=>a.id-b.id);
  return{ok:true,...meta,events,points};
}

export function mergeAnimationFrames(full,change){
  const meta={
    matchId:String(change?.matchId||full?.matchId||''),
    homeTeamId:String(full?.homeTeamId||change?.homeTeamId||''),
    awayTeamId:String(full?.awayTeamId||change?.awayTeamId||''),
    homeScore:change?.homeScore??full?.homeScore??null,
    awayScore:change?.awayScore??full?.awayScore??null,
    state:change?.state??full?.state??null
  };
  const map=new Map();
  for(const event of [...(full?.events||[]),...(change?.events||[])])map.set(String(event.id),event);
  const events=[...map.values()].sort((a,b)=>a.id-b.id).slice(-24);
  return{...meta,events,current:events.at(-1)||null};
}

async function fetchFlash(matchId,mode){
  const now=Date.now(),full=mode==='full',bucket=Math.floor(now/(full?30000:POLL_MS));
  const qs=full?`id=${encodeURIComponent(matchId)}`:`chid=${encodeURIComponent(matchId)}`;
  const url=`${FLASHDATA}?${qs}&t=${bucket}`;
  const response=await fetch(url,{headers:{'user-agent':'NOMADTIPS3-CAR3.1-Animation/3.0 (+public live activity monitor)','accept':'text/plain,*/*','accept-language':'en-US,en;q=.8'},cf:{cacheTtl:full?30:2,cacheEverything:true}});
  if(!response.ok)throw new Error(`FLASHDATA_${mode.toUpperCase()}_HTTP_${response.status}`);
  return response.text();
}

async function currentLiveMatch(request,env,worker,matchId){
  const u=new URL(request.url);u.pathname='/live';u.search='';
  const response=await worker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload)return null;
  return(payload.matches||[]).find(m=>String(m.sourceMatchId)===String(matchId))||null;
}

export async function handleAnimationRequest(request,env,worker){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  const url=new URL(request.url),matchId=String(url.searchParams.get('id')||'').trim();
  if(!/^\d+$/.test(matchId))return json({ok:false,reason:'INVALID_MATCH_ID'},400);

  const match=await currentLiveMatch(request,env,worker,matchId).catch(()=>null);
  if(!match)return json({ok:false,matchId,reason:'MATCH_NOT_IN_CURRENT_CAR31_LIVE_FEED'},404);

  const fullResult=await fetchFlash(matchId,'full').then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)}));
  if(!fullResult.ok)return json({ok:false,matchId,reason:'ANIMATION_SOURCE_UNAVAILABLE',sourceError:fullResult.error,fallback:'CAR31_ACTIVITY'},200,'public, max-age=1');

  const full=parseFlashData(fullResult.value,{matchId});
  if(!full.ok||!full.homeTeamId||!full.awayTeamId)return json({ok:false,matchId,reason:'ANIMATION_SOURCE_PARSE_INCOMPLETE',fallback:'CAR31_ACTIVITY'},200,'public, max-age=1');

  const changeResult=await fetchFlash(matchId,'change').then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)}));
  const change=changeResult.ok?parseFlashData(changeResult.value,{matchId,homeTeamId:full.homeTeamId,awayTeamId:full.awayTeamId}):null;
  const frame=mergeAnimationFrames(full,change?.ok?change:null),generatedAt=new Date().toISOString();

  return json({
    ok:true,
    matchId,
    generatedAt,
    pollMs:POLL_MS,
    source:'NOMADTIPS3 · PUBLIC LIVE ACTIVITY',
    sourceTransport:'GOALOO_PUBLIC_FLASHDATA_HTTP',
    sourceCoordinateSystem:'NORMALIZED_0_1',
    sourceMode:change?.ok?'CHANGE+FULL_METADATA':'FULL_FALLBACK',
    match:{home:match.home,away:match.away,minute:match.minute,status:match.status,homeTeamId:frame.homeTeamId,awayTeamId:frame.awayTeamId,score:{home:frame.homeScore,away:frame.awayScore}},
    events:frame.events,
    current:frame.current,
    fallback:frame.current?'NONE':'CAR31_ACTIVITY'
  },200,'public, max-age=1');
}

export{EVENT_TYPES,POLL_MS};
