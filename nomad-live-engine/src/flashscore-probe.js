const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const FSIGN='SW9D1eZo';
const HEADERS={
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  'accept':'*/*','accept-language':'en-GB,en;q=0.9','referer':'https://www.flashscore.com/',
  'origin':'https://www.flashscore.com','x-fsign':FSIGN,'cache-control':'no-cache','pragma':'no-cache'
};
const challengeRe=/(just a moment|captcha|verify you are human|access denied|cf-chl|challenge-platform|cloudflare ray id)/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function grab(url,headers=HEADERS){
  const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),12000);
  try{const r=await fetch(url,{headers,redirect:'follow',signal:ac.signal});const text=await r.text();return{url,finalUrl:r.url,status:r.status,ok:r.ok,contentType:r.headers.get('content-type')||'',bytes:text.length,text,error:null};}
  catch(e){return{url,finalUrl:null,status:null,ok:false,contentType:'',bytes:0,text:'',error:String(e?.message||e)}}finally{clearTimeout(timer)}
}
function shape(r){
  const t=r.text||''; const title=(t.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||null;
  return{url:r.url,finalUrl:r.finalUrl,status:r.status,ok:r.ok,bytes:r.bytes,contentType:r.contentType,title,challenge:challengeRe.test(t),hasAA:/AA÷/.test(t),hasStats:/Shots on Goal|Ball Possession|Expected Goals|Corner Kicks|Shots off Goal/i.test(t),hasLineup:/lineup|formation|starting/i.test(t),hasH2H:/head.?to.?head|H2H/i.test(t),hasStandings:/standings|table/i.test(t),hasSquad:/squad|players/i.test(t),error:r.error};
}
function parseRecords(text=''){
  const out=[];let cur=null;for(const raw of text.split('¬')){if(!raw)continue;const ix=raw.indexOf('÷');if(ix<0)continue;let key=raw.slice(0,ix),value=raw.slice(ix+1);const fresh=key.startsWith('~');if(fresh)key=key.slice(1);if(fresh||!cur){if(cur&&Object.keys(cur).length)out.push(cur);cur={};}cur[key]=value;}if(cur&&Object.keys(cur).length)out.push(cur);return out;
}
function eventsFromFeed(text=''){
  return parseRecords(text).filter(x=>x.AA).map(x=>({id:x.AA,status:x.AB??null,start:x.AD??null,home:x.AE??null,away:x.AF??null,homeScore:x.AG??null,awayScore:x.AH??null,minute:x.BA??null,period:x.BC??null,homeSlug:x.WU??null,awaySlug:x.WV??null,rawFields:x}));
}
function statLabels(text=''){
  const vals=[];for(const r of parseRecords(text)){for(const v of Object.values(r)){const s=String(v||'').trim();if(/[A-Za-z]/.test(s)&&s.length>=3&&s.length<=80)vals.push(s);}}
  return [...new Set(vals)].filter(s=>/shot|possession|corner|attack|danger|goal attempt|expected|foul|pass|save|offside|card|tackle|free kick|throw/i.test(s)).slice(0,120);
}
function configIds(text=''){
  const patterns={tournamentId:[/tournament[_-]?id["'\s:=]+([A-Za-z0-9_-]+)/ig,/tournamentId["'\s:=]+([A-Za-z0-9_-]+)/ig],seasonId:[/season[_-]?id["'\s:=]+([A-Za-z0-9_-]+)/ig,/seasonId["'\s:=]+([A-Za-z0-9_-]+)/ig]};
  const out={tournamentId:[],seasonId:[]};for(const[k,res]of Object.entries(patterns)){for(const re of res){let m;while((m=re.exec(text))&&out[k].length<12)out[k].push(m[1]);}out[k]=[...new Set(out[k])];}return out;
}
function hashes(text=''){
  const out=[];const res=[/_hash(?:=|%3D)([A-Za-z0-9_-]{2,24})/g,/_hash["']?\s*[:=]\s*["']([A-Za-z0-9_-]{2,24})/g];for(const re of res){let m;while((m=re.exec(text))&&out.length<40)out.push(m[1]);}return[...new Set(out)];
}
function canonicalTeams(url='',sample={}){
  const m=String(url).match(/\/match\/football\/([^/?]+)-([A-Za-z0-9]+)\/([^/?]+)-([A-Za-z0-9]+)\//i);if(!m)return{};
  const parts=[{slug:m[1],id:m[2]},{slug:m[3],id:m[4]}];const bySlug=s=>parts.find(p=>s&&(p.slug===s||p.slug.includes(s)||s.includes(p.slug)));
  return{parts,home:bySlug(sample.homeSlug)||null,away:bySlug(sample.awaySlug)||null};
}
function interestingJson(json){
  const found=[];const seen=new Set();function walk(v,depth=0){if(depth>7||found.length>=30||v==null)return;if(Array.isArray(v)){for(const x of v.slice(0,30))walk(x,depth+1);return;}if(typeof v!=='object')return;const keys=Object.keys(v);if(keys.some(k=>/team|participant|player|formation|lineup|tournament|season|event|stand/i.test(k))){const small={};for(const k of keys){const val=v[k];if((typeof val==='string'||typeof val==='number'||typeof val==='boolean')&&String(val).length<100)small[k]=val;}const sig=JSON.stringify(small);if(Object.keys(small).length&& !seen.has(sig)){seen.add(sig);found.push(small);}}for(const x of Object.values(v))walk(x,depth+1);}walk(json);return found;
}
async function graphql(url){const r=await grab(url,{...HEADERS,'accept':'application/json,text/plain,*/*'});const s=shape(r);let json=null;try{json=JSON.parse(r.text)}catch{}return{...s,json:json?{keys:Object.keys(json),hasData:!!json.data,errors:json.errors||null,candidates:interestingJson(json).slice(0,15)}:null};}
async function probe(){
  const candidates=['https://www.flashscore.com/x/feed/f_1_0_3_en-gb_1','https://local-global.flashscore.ninja/2/x/feed/f_1_0_3_en_1','https://local-global.flashscore.ninja/2/x/feed/f_1_0_3_en-gb_1'];
  let feedRaw=null,feedUrl=null,events=[];const feedAttempts=[];for(const url of candidates){const r=await grab(url),ev=r.ok?eventsFromFeed(r.text):[];feedAttempts.push({...shape(r),events:ev.length});if(!feedRaw&&r.ok&&ev.length){feedRaw=r;feedUrl=url;events=ev;break;}}
  if(!feedRaw)return{checkedAt:new Date().toISOString(),feedAttempts,error:'no_working_feed'};
  const live=events.filter(e=>String(e.status)==='2'||(e.minute!=null&&String(e.minute).trim()!==''&&Number.isFinite(Number(e.minute))));
  const sample=live[0]||events.find(e=>String(e.status)==='3')||events[0],eventId=sample.id,feedBase=feedUrl.includes('local-global.flashscore.ninja')?'https://local-global.flashscore.ninja/2/x/feed':'https://www.flashscore.com/x/feed';
  const rawSampleFields=Object.fromEntries(Object.entries(sample.rawFields).filter(([,v])=>String(v).length<=120));
  const detail={};
  for(const[name,url]of Object.entries({summary:`${feedBase}/df_sui_1_${eventId}`,stats:`${feedBase}/df_st_1_${eventId}`,h2h:`${feedBase}/df_hh_1_${eventId}`,general:`${feedBase}/dc_1_${eventId}`})){const r=await grab(url);detail[name]={...shape(r),records:r.ok?parseRecords(r.text).length:0};if(name==='stats')detail[name].labels=statLabels(r.text);await sleep(250);}
  const gql={};gql.lineups=await graphql(`https://2.ds.lsapp.eu/pq_graphql?_hash=dlie2&eventId=${encodeURIComponent(eventId)}&projectId=2`);await sleep(250);gql.playerStats=await graphql(`https://2.ds.lsapp.eu/pq_graphql?_hash=epmsd&eventId=${encodeURIComponent(eventId)}&providerId=7`);await sleep(250);
  const oddsCandidates=[`https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce&eventId=${encodeURIComponent(eventId)}&projectId=2&geoIpCode=TH&geoIpSubdivisionCode=TH10`,`https://2.ds.lsapp.eu/pq_graphql?_hash=ope&eventId=${encodeURIComponent(eventId)}&projectId=2&geoIpCode=TH&geoIpSubdivisionCode=TH10`];gql.oddsReference=[];for(const u of oddsCandidates){gql.oddsReference.push(await graphql(u));await sleep(250);}
  const matchRaw=await grab(`https://www.flashscore.com/match/${eventId}/`),matchShape={...shape(matchRaw),configIds:configIds(matchRaw.text),hashes:hashes(matchRaw.text)};const teams=canonicalTeams(matchRaw.finalUrl,sample);const pages={match:matchShape};
  for(const side of ['home','away']){const p=teams[side];if(!p)continue;const r=await grab(`https://www.flashscore.com/team/${p.slug}/${p.id}/`);pages[side+'Team']={...shape(r),hashes:hashes(r.text),configIds:configIds(r.text)};await sleep(250);}
  return{checkedAt:new Date().toISOString(),feed:{selected:feedUrl,attempts:feedAttempts,eventCount:events.length,liveCount:live.length,statusCounts:Object.fromEntries([...new Set(events.map(e=>String(e.status)))].map(s=>[s,events.filter(e=>String(e.status)===s).length])),sample:{id:sample.id,status:sample.status,start:sample.start,home:sample.home,away:sample.away,homeScore:sample.homeScore,awayScore:sample.awayScore,minute:sample.minute,period:sample.period,homeSlug:sample.homeSlug,awaySlug:sample.awaySlug,rawFields:rawSampleFields}},idChain:{matchId:eventId,canonical:matchRaw.finalUrl,teams},detail,gql,pages,note:'Odds is availability/reference only; not a lock source.'};
}
export default{async fetch(request){const u=new URL(request.url);if(u.pathname!=='/probe')return new Response(JSON.stringify({ok:true,endpoint:'/probe'}),{headers:JSON_HEADERS});return new Response(JSON.stringify(await probe()),{headers:JSON_HEADERS});}};
