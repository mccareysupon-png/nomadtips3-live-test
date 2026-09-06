import {DEFAULT_CONFIG,normalizeConfig,schedule,evaluate} from './rules.js';
import {fetchNowgoal1xBetMarkets} from '../../../nomad-live-engine/src/nowgoal.js';
import {teamSimilarity} from '../../../nomad-live-engine/src/real-market.js';

const API='https://v3.football.api-sports.io';
const INTERNAL_HEADER='x-add-k-internal';
const INTERNAL_HOST='add-k-ah-detector.internal';

const cors=()=>({
  'content-type':'application/json;charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type,x-owner-key',
  'cache-control':'no-store'
});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors()});
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const pair=(home,away)=>({home:finite(home)?Number(home):null,away:finite(away)?Number(away):null});
const pairFrom=value=>Array.isArray(value)?pair(value[0],value[1]):pair(value?.home,value?.away);
const scoreFrom=value=>Array.isArray(value)?pair(value[0],value[1]):pair(value?.home,value?.away);

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function authorized(request,env){
  const verifier=String(env.OWNER_ADMIN_TOKEN||'');
  const key=request.headers.get('x-owner-key')||'';
  return Boolean(verifier&&key)&&(await sha256Hex(key))===verifier;
}

async function api(path,key){
  const response=await fetch(API+path,{headers:{'x-apisports-key':key},cache:'no-store'});
  const body=await response.json();
  if(!response.ok||(body.errors&&Object.keys(body.errors).length))throw new Error('API-Football: '+JSON.stringify(body.errors||response.status));
  return body.response||[];
}

async function totalCornerFeed(env){
  const response=await fetch(env.NOMAD_FEED_URL,{cache:'no-store'});
  if(!response.ok)throw new Error(`TotalCorner feed HTTP ${response.status}`);
  const body=await response.json();
  if(body?.ok===false)throw new Error(`TotalCorner feed: ${body.lastError||body.error||'ไม่พร้อม'}`);
  if(!Array.isArray(body?.matches))throw new Error('TotalCorner feed ไม่มีรายการ matches');
  return body;
}

function apiFootballStats(rows){
  for(const team of rows||[]){
    const map=Object.fromEntries((team.statistics||[]).map(item=>[String(item.type||'').toLowerCase(),item.value]));
    team._addK={
      sot:finite(map['shots on goal'])?Number(map['shots on goal']):null,
      shotOff:finite(map['shots off goal'])?Number(map['shots off goal']):null
    };
  }
  return rows||[];
}

function latestSnapshot(match){
  const snapshots=Array.isArray(match?.event?.snapshots)?match.event.snapshots:[];
  return snapshots.length?snapshots[snapshots.length-1]:null;
}

function totalCornerStats(match){
  const snapshot=latestSnapshot(match);
  return{
    attacks:pairFrom(snapshot?.attacks),
    dangerous:pairFrom(snapshot?.dangerous),
    corners:pairFrom(snapshot?.corner)
  };
}

function nearest(feed,fixture){
  let best=null;
  for(const match of feed.matches||[]){
    if(match?.freshness?.stale)continue;
    const home=teamSimilarity(fixture.teams.home.name,match.home);
    const away=teamSimilarity(fixture.teams.away.name,match.away);
    const average=(home+away)/2;
    if(home<0.72||away<0.72||average<0.78)continue;
    if(!best||average>best.average)best={match,average};
  }
  return best?.match||null;
}

function findApiStats(rows,teamName){
  let best=null;
  for(const row of rows||[]){
    const score=teamSimilarity(row.team?.name,teamName);
    if(score>=0.78&&(!best||score>best.score))best={score,data:row._addK||{}};
  }
  return best?.data||{};
}

function merged(fixture,rows,match){
  const home=findApiStats(rows,fixture.teams.home.name);
  const away=findApiStats(rows,fixture.teams.away.name);
  const tc=totalCornerStats(match);
  return{
    stats:{
      sot:pair(home.sot,away.sot),
      shotOff:pair(home.shotOff,away.shotOff),
      corners:tc.corners,
      attacks:tc.attacks,
      dangerous:tc.dangerous
    },
    market:null
  };
}

function nowgoalTargets(matches){
  return (matches||[]).filter(m=>m?.id&&m?.home&&m?.away).map(m=>({
    id:String(m.id),home:m.home,away:m.away,score:scoreFrom(m.score)
  }));
}

export class DetectorState{
  constructor(state,env){this.state=state;this.env=env}

  async cfg(){
    const stored=await this.state.storage.get('config');
    if(stored)return normalizeConfig(stored);
    return normalizeConfig({...DEFAULT_CONFIG,enabled:String(this.env.PRODUCTION_ENABLED||'false')==='true'});
  }

  async smoke(){
    if(!this.env.API_FOOTBALL_KEY)throw new Error('ยังไม่ได้ตั้ง API_FOOTBALL_KEY');
    if(!this.env.OWNER_ADMIN_TOKEN)throw new Error('ยังไม่ได้ตั้ง OWNER_ADMIN_TOKEN');
    const [live,feed]=await Promise.all([
      api('/fixtures?live=all',this.env.API_FOOTBALL_KEY),
      totalCornerFeed(this.env)
    ]);
    const targets=nowgoalTargets(feed.matches).slice(0,8);
    if(!targets.length)throw new Error('ไม่มีคู่จาก TotalCorner สำหรับตรวจ NowGoal AH จริง');
    const nowgoal=await fetchNowgoal1xBetMarkets(
      targets,
      {requestTimeoutMs:9000,maximumPriceAgeSeconds:90},
      Date.now(),
      await this.state.storage.get('nowgoalUpdates')||{}
    );
    await this.state.storage.put('nowgoalUpdates',nowgoal.priceUpdates||{});
    if(nowgoal.status!=='READY'||Number(nowgoal.ready||0)<1)throw new Error(`NowGoal AH ยังไม่พร้อม: ${nowgoal.status||'UNKNOWN'} / ready ${nowgoal.ready||0}`);
    const result={
      ok:true,
      apiFootball:{ok:true,live:live.length},
      totalCorner:{ok:true,matches:feed.matches.length,source:feed.source?.name||'TotalCorner',updatedAt:feed.updatedAt||null},
      nowgoal:{ok:true,status:nowgoal.status,checked:nowgoal.checked||0,mapped:nowgoal.mapped||0,ready:nowgoal.ready||0,events:nowgoal.events||0},
      updatedAt:Date.now()
    };
    await this.state.storage.put('smoke',result);
    return result;
  }

  async cycle(){
    const config=await this.cfg();
    if(!config.enabled)return{ok:true,skipped:'disabled',schedule:schedule(config)};
    if(!this.env.API_FOOTBALL_KEY)throw new Error('ยังไม่ได้ตั้ง API_FOOTBALL_KEY');

    const [live,feed]=await Promise.all([
      api('/fixtures?live=all',this.env.API_FOOTBALL_KEY),
      totalCornerFeed(this.env)
    ]);
    const jobs=[];
    const times=schedule(config);

    for(const fixture of live){
      const id=String(fixture.fixture.id);
      const minute=Number(fixture.fixture.status?.elapsed);
      if(!Number.isFinite(minute)||minute<config.minuteFrom||minute>config.minuteTo)continue;
      const key='match:'+id;
      const record=await this.state.storage.get(key)||{fixtureId:id,completed:[],locked:false};
      if(record.locked||record.completed.length>=4)continue;
      const index=times.findIndex((time,i)=>minute>=time&&!record.completed.includes(i));
      if(index<0)continue;
      const match=nearest(feed,fixture);
      if(match)jobs.push({fixture,id,minute,key,record,index,match});
    }

    let nowgoal={status:'NOT_NEEDED',checked:0,mapped:0,ready:0,events:0,results:[],priceUpdates:{}};
    let markets=new Map();
    if(jobs.length){
      nowgoal=await fetchNowgoal1xBetMarkets(
        nowgoalTargets(jobs.map(job=>job.match)),
        {requestTimeoutMs:9000,maximumPriceAgeSeconds:config.sourceMaxAgeSeconds},
        Date.now(),
        await this.state.storage.get('nowgoalUpdates')||{}
      );
      markets=new Map((nowgoal.results||[]).map(item=>[String(item.matchId),item.market]));
      await this.state.storage.put('nowgoalUpdates',nowgoal.priceUpdates||{});
    }

    let checked=0,locked=0,errors=0;
    const cycleErrors=[];
    for(const job of jobs){
      try{
        const rows=apiFootballStats(await api('/fixtures/statistics?fixture='+job.id,this.env.API_FOOTBALL_KEY));
        const base=merged(job.fixture,rows,job.match);
        base.market=markets.get(String(job.match.id))||null;

        job.record.completed.push(job.index);
        job.record.lastMinute=job.minute;
        job.record.updatedAt=Date.now();
        job.record.snapshots=[...(job.record.snapshots||[]),{index:job.index,minute:job.minute,data:base}].slice(-4);

        for(const side of(config.side==='BOTH'?['HOME','AWAY']:[config.side])){
          const result=evaluate({side,...base},config);
          if(result.passed){
            const signal={
              id:job.id+':'+side,
              fixtureId:job.id,
              side,
              league:job.fixture.league?.name,
              home:job.fixture.teams.home.name,
              away:job.fixture.teams.away.name,
              minute:job.minute,
              score:pair(job.fixture.goals.home,job.fixture.goals.away),
              ...result,
              stats:base.stats,
              market:base.market,
              lockedAt:Date.now()
            };
            await this.state.storage.put('signal:'+signal.id,signal);
            job.record.locked=true;
            locked++;
            break;
          }
        }
        await this.state.storage.put(job.key,job.record);
        checked++;
      }catch(error){
        errors++;
        cycleErrors.push({fixtureId:job.id,error:String(error?.message||error)});
      }
    }

    const status={
      updatedAt:Date.now(),enabled:true,live:live.length,totalCornerMatches:feed.matches.length,
      eligible:jobs.length,checked,locked,errors,schedule:times,
      nowgoal:{status:nowgoal.status,checked:nowgoal.checked||0,mapped:nowgoal.mapped||0,ready:nowgoal.ready||0,events:nowgoal.events||0},
      cycleErrors:cycleErrors.slice(0,10)
    };
    await this.state.storage.put('status',status);
    return{ok:true,...status};
  }

  async fetch(request){
    if(request.method==='OPTIONS')return new Response('',{status:204,headers:cors()});
    const url=new URL(request.url);
    const internal=request.headers.get(INTERNAL_HEADER)||'';
    const internalCron=internal==='cron';
    const internalWeb=internal==='web';

    if(url.pathname==='/config'){
      if(request.method==='POST'){
        if(!internalWeb&&!(await authorized(request,this.env)))return json({ok:false,error:'รหัสเจ้าของไม่ถูกต้อง'},401);
        try{
          const config=normalizeConfig(await request.json());
          await this.state.storage.put('config',config);
          return json({ok:true,config,schedule:schedule(config)});
        }catch(error){return json({ok:false,error:error.message},400)}
      }
      const config=await this.cfg();
      return json({ok:true,config,schedule:schedule(config)});
    }

    if(url.pathname==='/signals'){
      const list=[];
      for(const[,value] of await this.state.storage.list({prefix:'signal:'}))list.push(value);
      return json({ok:true,signals:list.sort((a,b)=>b.lockedAt-a.lockedAt)});
    }

    if(url.pathname==='/status')return json({ok:true,status:await this.state.storage.get('status')||null,smoke:await this.state.storage.get('smoke')||null});

    if(url.pathname==='/smoke'&&request.method==='POST'){
      if(!(await authorized(request,this.env)))return json({ok:false,error:'รหัสเจ้าของไม่ถูกต้อง'},401);
      try{return json(await this.smoke())}catch(error){
        await this.state.storage.put('smoke',{ok:false,error:String(error?.message||error),updatedAt:Date.now()});
        return json({ok:false,error:error.message},500);
      }
    }

    if(url.pathname==='/cycle'&&request.method==='POST'){
      if(!internalCron&&!(await authorized(request,this.env)))return json({ok:false,error:'รหัสเจ้าของไม่ถูกต้อง'},401);
      try{return json(await this.cycle())}catch(error){
        await this.state.storage.put('status',{ok:false,error:String(error?.message||error),updatedAt:Date.now()});
        return json({ok:false,error:error.message},500);
      }
    }

    return json({ok:true,service:'ADD K AH Detector',version:'1.3.0',language:'th',defaultEnabled:false});
  }
}

export default{
  fetch(request,env){
    const url=new URL(request.url);
    const headers=new Headers(request.headers);
    if(url.hostname!==INTERNAL_HOST)headers.delete(INTERNAL_HEADER);
    const clean=new Request(request,{headers});
    return env.DETECTOR.get(env.DETECTOR.idFromName('main')).fetch(clean);
  },
  scheduled(_,env,ctx){
    ctx.waitUntil(env.DETECTOR.get(env.DETECTOR.idFromName('main')).fetch('https://internal/cycle',{method:'POST',headers:{[INTERNAL_HEADER]:'cron'}}));
  }
};
