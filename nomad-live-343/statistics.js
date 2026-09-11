(()=>{
'use strict';
const API='/api/engine/statistics',POLL=45000;
let marketDefs={};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const show=v=>v===null||v===undefined||v===''?'—':String(v);
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
function numberText(v){const n=num(v);if(n===null)return'—';return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function signedLineText(v){const n=num(v);if(n===null)return'—';const t=numberText(n);return n>0?`+${t}`:t}
function marketKey(s){return String(s?.market||s?.providerMarket||'').toLowerCase()}
function isAsianMarket(s){const k=marketKey(s);return /(^|_)(ah|asian)(_|$)/.test(k)||k.includes('handicap')||k.includes('corner_asian')||k.includes('card_asian')||k.includes('cards_asian')}
function publicLineText(s){const n=num(s?.line);if(n===null)return'—';return isAsianMarket(s)?signedLineText(n):numberText(n)}
function label(s){return s?.marketLabel||marketDefs[s?.market]?.label||s?.market||'—'}
function dt(ms){try{const d=new Date(ms);const date=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit'}).format(d);const time=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:true}).format(d);return`${date} ${time}`}catch{return'—'}}
function resultTag(r){const cls=r==='WIN'||r==='HALF_WIN'?'win':r==='LOSS'||r==='HALF_LOSS'?'loss':'push';return`<span class="tag ${cls}">${esc(r||'—')}</span>`}
function resultCell(s){const audit=s?.previousResult&&s.previousResult!==s.result?`แก้จาก ${s.previousResult} · ${s.settlementRevision||'RULE FIX'}`:(s?.settlementRevision||'');return`${resultTag(s?.result)}${audit?`<span class="sub">${esc(audit)}</span>`:''}`}
function set(q,v){const el=document.querySelector(q);if(el)el.textContent=show(v)}
function score(v){if(typeof v==='string'&&v.trim())return v;if(Array.isArray(v))return`${show(v[0])}-${show(v[1])}`;if(v&&typeof v==='object')return`${show(v.home??v.h)}-${show(v.away??v.a)}`;return'—'}
function entryMinute(s){return s?.entryMinute??s?.minute}
function selectionLabel(s){const sel=String(s?.selection||'').toUpperCase();if(sel==='HOME')return s?.home?.name||'HOME';if(sel==='AWAY')return s?.away?.name||'AWAY';if(sel==='DRAW')return'DRAW';return show(s?.selection).toUpperCase()}
function lineCell(s){return`<span class="match-name">${esc(publicLineText(s))}</span>`}
function renderMarketSummary(j){const el=document.querySelector('[data-market-summary]');if(!el)return;const defs=j.markets||marketDefs,counts=j.byMarket||{};el.innerHTML=Object.entries(defs).map(([k,d])=>`<article class="metric"><span>${esc(d.label||k)}</span><strong>${counts[k]||0}</strong><small>${esc(d.provider||'Bet365')} · ${esc(d.period||'FT')}</small></article>`).join('')}
function render(j){marketDefs=j.markets||{};set('[data-total]',j.total);set('[data-win]',j.win);set('[data-loss]',j.loss);set('[data-win-rate]',j.winRate===null?'—':`${j.winRate}%`);renderMarketSummary(j);const rows=Array.isArray(j.rows)?j.rows:[];const tbody=document.querySelector('[data-stat-body]');if(tbody)tbody.innerHTML=rows.length?rows.map(s=>{const league=[s.league?.country,s.league?.name].filter(Boolean).join(' · '),m=entryMinute(s);return`<tr><td>${esc(dt(s.createdAt))}</td><td><span class="match-name">${esc(s.home?.name||'—')} - ${esc(s.away?.name||'—')}</span><span class="sub">${esc(league||'—')}</span></td><td class="live-minute-343">${esc(show(m))}${m==null?'':"'"}</td><td><span class="match-name">${esc(label(s))}</span><span class="sub">${esc(s.period||'—')} · ${esc(s.bookmaker||'Bet365')}</span></td><td>${esc(selectionLabel(s))}</td><td>${lineCell(s)}</td><td class="odds">${esc(show(s.odds))}</td><td>${esc(s.bookmaker||'Bet365')}</td><td>${esc(score(s.entryScore??s.scoreAt))}</td><td>${esc(score(s.finalScore))}</td><td>${resultCell(s)}</td></tr>`}).join(''):'<tr><td colspan="11" class="empty">ยังไม่มีสัญญาณที่จบการแข่งขันและตัดสินผลแล้ว</td></tr>';const st=document.querySelector('[data-stat-state]');if(st)st.innerHTML=`<span class="pill"><i class="dot live"></i>Results · ALL MARKETS · ${esc(j.settlementRevision||'—')}${j.unresolved?` · UNRESOLVED ${esc(j.unresolved)}`:''}${j.halfWin||j.halfLoss?` · HALF ${j.halfWin||0}/${j.halfLoss||0}`:''}</span>`}
async function load(){try{const r=await fetch(`${API}?_=${Date.now()}`,{cache:'no-store'}),j=await r.json();if(!r.ok||j?.ok!==true)throw new Error();render(j)}catch{const st=document.querySelector('[data-stat-state]');if(st)st.innerHTML='<span class="pill"><i class="dot warn"></i>ข้อมูลสถิติไม่พร้อม</span>'}}
load();setInterval(load,POLL);
})();
