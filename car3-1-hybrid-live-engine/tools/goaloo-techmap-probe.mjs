#!/usr/bin/env node

const matchId=String(process.argv[2]||'2930884').replace(/\D/g,'');
const BASE='https://m.goaloo.com';
const UA='NOMADTIPS3-CAR3.1-Research/1.4 (+public Goaloo tech map probe)';
async function get(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'*/*','accept-language':'en-US,en;q=.9'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return{url:r.url,body:await r.text(),type:r.headers.get('content-type')||''};}
const abs=(v,base)=>{try{return new URL(v,base).href}catch{return''}};
const uniq=a=>[...new Set(a.filter(Boolean))];
function snippets(text,term,span=650){const out=[];let at=0;const lower=text.toLowerCase(),needle=term.toLowerCase();while((at=lower.indexOf(needle,at))>=0){out.push(text.slice(Math.max(0,at-span),Math.min(text.length,at+needle.length+span)).replace(/\s+/g,' '));at+=needle.length;if(out.length>=4)break;}return out;}
function extractTT(text,id){const re=new RegExp(`tT_f\\[${id}\\]\\s*=\\s*(\\[[^;]+\\])\\s*;`);const m=text.match(re);return m?.[1]||null;}

const page=await get(`${BASE}/football/match/live-${matchId}`);
const scriptUrls=uniq([...page.body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>abs(m[1],page.url))).filter(u=>{try{return new URL(u).hostname.endsWith('goaloo.com')}catch{return false}}).slice(0,60);
const terms=['T_Mul_TechKind','Dangerous Attacks','Dangerous Attack','Attacks','Shots on Goal','Shots On Goal','Shots','Possession','Corner Kicks'];
const hits=[];
for(const term of terms){for(const s of snippets(page.body,term)){hits.push({source:'page-inline',term,snippet:s});}}
for(const url of scriptUrls){let body='';try{body=(await get(url)).body}catch{continue}for(const term of terms){const s=snippets(body,term);if(s.length)hits.push({source:url,term,snippets:s});}}
const detail=await get(`${BASE}/gf/data/detailIn.js?t=${Date.now()}`).catch(()=>null);
const detailAlt=await get(`https://live10.goaloo28.com/gf/data/detailIn.js?t=${Date.now()}`).catch(()=>null);
console.log(JSON.stringify({
  ok:true,
  matchId,
  fetchedAt:new Date().toISOString(),
  page:page.url,
  scriptCount:scriptUrls.length,
  scriptUrls,
  hits,
  detailIn:[detail,detailAlt].filter(Boolean).map(x=>({url:x.url,bytes:x.body.length,tT_f:extractTT(x.body,matchId)})),
  note:'Public Goaloo HTML/JS/detailIn inspection only. Mapping is reported only when exposed by public client resources; no authenticated or token-gated endpoint is used.'
},null,2));
