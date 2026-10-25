#!/usr/bin/env node

const matchId=String(process.argv[2]||'2930884').trim();
if(!/^\d+$/.test(matchId))process.exit(2);
const UA='NOMADTIPS3-CAR3.1-Research/1.1 (+public Goaloo event protocol probe)';
const pageUrl=`https://m.goaloo.com/football/match/live-${matchId}`;
const red=v=>String(v??'').replace(/([?&](?:accessKey|access_key|token|key)=)[^&#"']+/gi,'$1[REDACTED]');
async function text(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'text/html,application/javascript,text/javascript,*/*;q=.8','accept-language':'en-US,en;q=.8'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return{url:r.url,body:await r.text(),type:r.headers.get('content-type')||''};}
function scripts(html,base){const out=[];for(const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)){try{out.push(new URL(m[2],base).toString())}catch{}}return[...new Set(out)];}
function scalar(html,name){const re=new RegExp(`(?:var|let|const)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*=\\s*([^;\\n]+)`,'i');const m=html.match(re);return m?m[1].trim().slice(0,1000):null;}
function snippets(body,terms){const lines=String(body||'').split(/\r?\n/),out=[];for(let i=0;i<lines.length;i++){if(terms.some(t=>lines[i].toLowerCase().includes(t))){out.push({line:i+1,text:red(lines[i].trim().slice(0,1200))});if(out.length>=40)break;}}return out;}

const root=await text(pageUrl);
const allScripts=scripts(root.body,root.url);
const interesting=allScripts.filter(u=>/(eventdetail|websocket|animation|detail|live)/i.test(u));
const vars={
  websocket:scalar(root.body,'_websocket'),
  wsUrl:red(scalar(root.body,'_wsUrl')),
  scheduleID:scalar(root.body,'scheduleID')||scalar(root.body,'_scheduleId'),
  hasAnimation:scalar(root.body,'hasAnimation'),
  showEvents:scalar(root.body,'_showEvents'),
  mstate:scalar(root.body,'_mstate'),
  homeID:scalar(root.body,'_homeID'),
  guestID:scalar(root.body,'_guestID'),
  detailData:scalar(root.body,'_detailData'),
  playerEventList:scalar(root.body,'_playerEventList')
};
const inspected=[];
for(const url of interesting.slice(0,12)){
  try{const r=await text(url);inspected.push({url:red(r.url),contentType:r.type,bytes:r.body.length,snippets:snippets(r.body,['websocket','onmessage','message','scheduleid','detaildata','event','animation','wsurl','socket'])});}
  catch(e){inspected.push({url:red(url),error:String(e?.message||e)});}
}
const inline=snippets(root.body,['var _wsurl','var _websocket','hasanimation','_detaildata','_playereventlist','new websocket','onmessage','websocket','showanimation','eventdetail']);
console.log(JSON.stringify({ok:true,matchId,sourcePage:root.url,fetchedAt:new Date().toISOString(),vars,interestingScripts:interesting.map(red),inline,inspected,note:'Public page/script inspection only; no auth bypass, no access-key use, no websocket connection opened.'},null,2));
