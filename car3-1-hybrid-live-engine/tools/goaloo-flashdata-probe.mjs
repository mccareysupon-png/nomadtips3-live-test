#!/usr/bin/env node

const requested=String(process.argv[2]||'2930884').trim();
const UA='NOMADTIPS3-CAR3.1-Research/1.3 (+public Goaloo flashdata probe)';
const BASE='https://m.goaloo.com';
const INDEX='https://live10.goaloo28.com/gf/data/bf_us.js';
const red=v=>String(v??'').replace(/([?&](?:accessKey|access_key|token|key)=)[^&#"']+/gi,'$1[REDACTED]');
async function get(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'*/*','accept-language':'en-US,en;q=.8'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return{url:r.url,body:await r.text(),type:r.headers.get('content-type')||''};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function parseLiveIds(src){const out=[];const re=/A\[\d+\]\s*=\s*\[([^\n;]+)\]\s*;/g;for(const m of src.matchAll(re)){const row=m[1].split(',').map(x=>x.trim().replace(/^['"]|['"]$/g,''));const id=String(row[0]||'').replace(/[^\d]/g,''),state=Number(row[8]);if(id&&Number.isFinite(state)&&state>0)out.push(id);}return [...new Set(out)];}
function hasAnimation(html){return /(?:var|let|const)\s+hasAnimation\s*=\s*(?:1|true)\b/i.test(html);}
function sample(body,max=5000){return red(String(body||'').slice(0,max));}
function analyze(body){const s=String(body||'');const nums=(s.match(/-?\d+(?:\.\d+)?/g)||[]).slice(0,120).map(Number);const punct={caret:(s.match(/\^/g)||[]).length,pipe:(s.match(/\|/g)||[]).length,dollar:(s.match(/\$/g)||[]).length,comma:(s.match(/,/g)||[]).length,semi:(s.match(/;/g)||[]).length,tilde:(s.match(/~/g)||[]).length};return{bytes:s.length,empty:!s.trim(),startsJson:/^\s*[\[{]/.test(s),punct,numbers:nums};}
async function probe(id){const page=await get(`${BASE}/football/match/live-${id}`);const anim=hasAnimation(page.body);let full=null,change1=null,change2=null;if(anim){const t=Date.now();full=await get(`${BASE}/flashdata/get?id=${id}&t=${t}`).catch(e=>({error:String(e?.message||e),body:''}));await sleep(1700);change1=await get(`${BASE}/flashdata/get?chid=${id}&t=${Date.now()}`).catch(e=>({error:String(e?.message||e),body:''}));await sleep(1700);change2=await get(`${BASE}/flashdata/get?chid=${id}&t=${Date.now()}`).catch(e=>({error:String(e?.message||e),body:''}));}return{id,hasAnimation:anim,title:(page.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||'',full:full?{url:red(full.url||''),error:full.error||null,...analyze(full.body),sample:sample(full.body)}:null,change1:change1?{url:red(change1.url||''),error:change1.error||null,...analyze(change1.body),sample:sample(change1.body)}:null,change2:change2?{url:red(change2.url||''),error:change2.error||null,...analyze(change2.body),sample:sample(change2.body)}:null};}

const ids=[requested];
try{const idx=await get(`${INDEX}?t=${Date.now()}`);for(const id of parseLiveIds(idx.body)){if(!ids.includes(id))ids.push(id);if(ids.length>=12)break;}}catch{}
const reports=[];for(const id of ids){try{const r=await probe(id);reports.push(r);if(id!==requested&&r.hasAnimation&&r.full?.bytes>0&&reports.filter(x=>x.id!==requested&&x.hasAnimation).length>=2)break;}catch(e){reports.push({id,error:String(e?.message||e)});}}
console.log(JSON.stringify({ok:true,fetchedAt:new Date().toISOString(),requestedMatchId:requested,reports,note:'Public HTTP Goaloo page and /flashdata/get inspection only; no websocket or token endpoint used.'},null,2));
