#!/usr/bin/env node

const matchId=String(process.argv[2]||'2930884').trim();
const UA='NOMADTIPS3-CAR3.1-Research/1.2 (+public Goaloo protocol extraction)';
const ROOT=`https://m.goaloo.com/football/match/live-${matchId}`;
const red=s=>String(s??'').replace(/([?&](?:accessKey|access_key|token|key)=)[^&#"']+/gi,'$1[REDACTED]');
async function get(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'*/*','accept-language':'en-US,en;q=.8'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return{url:r.url,body:await r.text(),type:r.headers.get('content-type')||''};}
function srcs(html,base){const out=[];for(const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)){try{out.push(new URL(m[2],base).toString())}catch{}}return[...new Set(out)];}
function around(text,needle,radius=700,max=12){const low=text.toLowerCase(),q=needle.toLowerCase(),out=[];let at=0;while(out.length<max&&(at=low.indexOf(q,at))>=0){out.push(red(text.slice(Math.max(0,at-radius),Math.min(text.length,at+q.length+radius))));at+=q.length;}return out;}
function uniq(arr){return [...new Set(arr)];}

const root=await get(ROOT);
const scripts=srcs(root.body,root.url);
const wsScript=scripts.find(x=>/websocketjs/i.test(x));
const flashScript=scripts.find(x=>/flashlive/i.test(x));
const eventScript=scripts.find(x=>/eventdetail/i.test(x));
const targets=[];
for(const [name,url] of [['websocketjs',wsScript],['flashlive',flashScript],['eventdetail',eventScript]]){
  if(!url)continue;
  const r=await get(url);
  const needles=name==='websocketjs'
    ? ['new WebSocket','_wsUrl','onmessage','onopen','send(','pako.inflate','inflate(','ungzip','scheduleId','_scheduleId','message.data','binaryType','WebSocket(']
    : name==='flashlive'
      ? ['arrEventMsg','dangerousAttack','control','attack','eventMsg','flashMsg','scheduleId','_scheduleId','socket','websocket']
      : ['_detailData','ajaxGet','eventText','processDetail','playerEvent','scheduleId','_scheduleId','getFlash','type='];
  const hits={};
  for(const n of needles){const v=around(r.body,n);if(v.length)hits[n]=v;}
  targets.push({name,url:red(r.url),bytes:r.body.length,hits});
}

const detailCandidates=uniq([
  'https://m.goaloo.com/gf/data/detailIn.js',
  'https://live10.goaloo28.com/gf/data/detailIn.js',
  'https://live10.goaloo28.com/gf/data/detail.js'
]);
const detail=[];
for(const url of detailCandidates){
  try{
    const r=await get(`${url}?t=${Date.now()}`);
    detail.push({url:red(r.url),bytes:r.body.length,matchIdHits:around(r.body,matchId,500,8),rqHits:around(r.body,'rq[',350,4),head:red(r.body.slice(0,1800))});
  }catch(e){detail.push({url,error:String(e?.message||e)});}
}

console.log(JSON.stringify({ok:true,matchId,fetchedAt:new Date().toISOString(),root:root.url,targets,detail,note:'Static public-resource inspection only. No websocket connection, no auth bypass, no token use.'},null,2));
