const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const FSIGN='SW9D1eZo';
const HEADERS={
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  'accept':'*/*',
  'accept-language':'en-GB,en;q=0.9',
  'referer':'https://www.flashscore.com/',
  'origin':'https://www.flashscore.com',
  'x-fsign':FSIGN,
  'cache-control':'no-cache',
  'pragma':'no-cache'
};
const challengeRe=/(just a moment|captcha|verify you are human|access denied|cf-chl|challenge-platform|cloudflare ray id)/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function grab(url, headers=HEADERS){
  const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),12000);
  try{
    const r=await fetch(url,{headers,redirect:'follow',signal:ac.signal});
    const text=await r.text();
    return {url,finalUrl:r.url,status:r.status,ok:r.ok,contentType:r.headers.get('content-type')||'',bytes:text.length,text,error:null};
  }catch(e){return {url,finalUrl:null,status:null,ok:false,contentType:'',bytes:0,text:'',error:String(e?.message||e)};}
  finally{clearTimeout(timer)}
}

function shape(r){
  const t=r.text||'';
  const title=(t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||null;
  return {url:r.url,finalUrl:r.finalUrl,status:r.status,ok:r.ok,bytes:r.bytes,contentType:r.contentType,title,challenge:challengeRe.test(t),hasAA:/AA÷/.test(t),hasStats:/Shots on Goal|Ball Possession|Expected Goals|Corner Kicks|Shots off Goal/i.test(t),hasLineup:/lineup|formation|starting/i.test(t),hasH2H:/head.?to.?head|H2H/i.test(t),hasStandings:/standings|table/i.test(t),hasSquad:/squad|players/i.test(t),error:r.error};
}

function parseRecords(text=''){
  const out=[]; let cur=null;
  for(const raw of text.split('¬')){
    if(!raw) continue;
    const ix=raw.indexOf('÷');
    if(ix<0) continue;
    let key=raw.slice(0,ix), value=raw.slice(ix+1);
    const fresh=key.startsWith('~');
    if(fresh) key=key.slice(1);
    if(fresh || !cur){
      if(cur && Object.keys(cur).length) out.push(cur);
      cur={};
    }
    cur[key]=value;
  }
  if(cur && Object.keys(cur).length) out.push(cur);
  return out;
}

function eventsFromFeed(text=''){
  return parseRecords(text).filter(x=>x.AA).map(x=>({
    id:x.AA,status:x.AB??null,start:x.AD??null,home:x.AE??null,away:x.AF??null,
    homeScore:x.AG??null,awayScore:x.AH??null,homeId:x.AU??null,awayId:x.AV??null,
    minute:x.BA??null,period:x.BC??null,league:x.ZA??x.AC??null,
    homeSlug:x.WU??null,awaySlug:x.WV??null,
    fields:Object.fromEntries(Object.entries(x).filter(([k])=>['AA','AB','AC','AD','AE','AF','AG','AH','AU','AV','BA','BC','ZA','ZB','ZC','ZD','ZE','ZF','ZG','WU','WV'].includes(k)))
  }));
}

async function graphql(url){
  const r=await grab(url,{...HEADERS,'accept':'application/json,text/plain,*/*'});
  const s=shape(r);
  let json=null;
  try{json=JSON.parse(r.text);}catch{}
  return {...s,json:json?{keys:Object.keys(json),dataType:typeof json.data,hasData:!!json.data,errors:json.errors||null}:null};
}

async function probe(){
  const candidates=[
    'https://www.flashscore.com/x/feed/f_1_0_3_en-gb_1',
    'https://local-global.flashscore.ninja/2/x/feed/f_1_0_3_en_1',
    'https://local-global.flashscore.ninja/2/x/feed/f_1_0_3_en-gb_1'
  ];
  let feedRaw=null,feedUrl=null,events=[];
  const feedAttempts=[];
  for(const url of candidates){
    const r=await grab(url); const s=shape(r); const ev=r.ok?eventsFromFeed(r.text):[];
    feedAttempts.push({...s,events:ev.length});
    if(!feedRaw && r.ok && ev.length){feedRaw=r;feedUrl=url;events=ev;break;}
  }
  if(!feedRaw) return {checkedAt:new Date().toISOString(),feedAttempts,error:'no_working_feed'};

  const live=events.filter(e=>String(e.status)==='2'||Number.isFinite(Number(e.minute)));
  const sample=live[0]||events[0];
  const eventId=sample.id;
  const feedBase=feedUrl.includes('local-global.flashscore.ninja')?'https://local-global.flashscore.ninja/2/x/feed':'https://www.flashscore.com/x/feed';
  const endpoints={
    summary:`${feedBase}/df_sui_1_${eventId}`,
    stats:`${feedBase}/df_st_1_${eventId}`,
    h2h:`${feedBase}/df_hh_1_${eventId}`,
    general:`${feedBase}/dc_1_${eventId}`
  };
  const detail={};
  for(const [name,url] of Object.entries(endpoints)){
    const r=await grab(url); detail[name]={...shape(r),records:r.ok?parseRecords(r.text).length:0}; await sleep(250);
  }

  const gql={};
  gql.lineups=await graphql(`https://2.ds.lsapp.eu/pq_graphql?_hash=dlie2&eventId=${encodeURIComponent(eventId)}&projectId=2`); await sleep(250);
  gql.playerStats=await graphql(`https://2.ds.lsapp.eu/pq_graphql?_hash=epmsd&eventId=${encodeURIComponent(eventId)}&providerId=7`); await sleep(250);
  gql.oddsReference=await graphql(`https://2.ds.lsapp.eu/pq_graphql?_hash=ope&eventId=${encodeURIComponent(eventId)}&projectId=2&geoIpCode=TH&geoIpSubdivisionCode=TH10`); await sleep(250);

  const pages={};
  pages.match=shape(await grab(`https://www.flashscore.com/match/${eventId}/`));
  if(sample.homeSlug&&sample.homeId) pages.homeTeam=shape(await grab(`https://www.flashscore.com/team/${sample.homeSlug}/${sample.homeId}/`));
  if(sample.awaySlug&&sample.awayId) pages.awayTeam=shape(await grab(`https://www.flashscore.com/team/${sample.awaySlug}/${sample.awayId}/`));

  return {
    checkedAt:new Date().toISOString(),
    feed:{selected:feedUrl,attempts:feedAttempts,eventCount:events.length,liveCount:live.length,sample},
    idChain:{matchId:eventId,homeTeamId:sample.homeId,awayTeamId:sample.awayId,homeSlug:sample.homeSlug,awaySlug:sample.awaySlug},
    detail,gql,pages,
    note:'Odds endpoint is probed only for availability; it is not treated as a lock source.'
  };
}

export default {async fetch(request){
  const u=new URL(request.url);
  if(u.pathname!=='/probe') return new Response(JSON.stringify({ok:true,endpoint:'/probe'}),{headers:JSON_HEADERS});
  return new Response(JSON.stringify(await probe()),{headers:JSON_HEADERS});
}};
