(()=>{
'use strict';
const VERSION='343-expanded-match-v1-bulk-snapshot';
const BOARD_API='/api/engine/board';
const HISTORY_API='/api/engine/history';
const BOARD_CACHE_MS=15000;
const HISTORY_CACHE_MS=20000;
const BOOK_PRIORITY=['bet365','pinnacle','crown','1xbet','12bet','interwetten','macauslot','18bet','vcbet','easybets'];
const BOOK_LABELS={bet365:'Bet365',pinnacle:'Pinnacle',crown:'Crown','1xbet':'1xBet','12bet':'12Bet',interwetten:'Interwetten',macauslot:'Macau Slot','18bet':'18Bet',vcbet:'VCBet',easybets:'Easybets'};
const SKIP_KEYS=new Set(['id','name','slug','bookmaker','bookmaker_id','bookmakerid','source','provider','updated_at','updatedat','created_at','createdat','timestamp','status','active','meta','metadata']);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const pretty=v=>String(v||'Market').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
let expandedId=null;
let boardCache={at:0,data:null,promise:null};
const historyCache=new Map();
let mountSeq=0;
let mountTimer=0;

async function fetchJson(url){
  const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP_${r.status}`);
  return j;
}
async function getBoard(){
  const now=Date.now();
  if(boardCache.data&&now-boardCache.at<BOARD_CACHE_MS)return boardCache.data;
  if(boardCache.promise)return boardCache.promise;
  boardCache.promise=fetchJson(BOARD_API).then(j=>{boardCache={at:Date.now(),data:j,promise:null};return j}).catch(e=>{boardCache.promise=null;throw e});
  return boardCache.promise;
}
async function getHistory(id){
  const now=Date.now(),hit=historyCache.get(id);
  if(hit?.data&&now-hit.at<HISTORY_CACHE_MS)return hit.data;
  if(hit?.promise)return hit.promise;
  const promise=fetchJson(`${HISTORY_API}?fixtureId=${encodeURIComponent(id)}&window=10`).then(j=>{historyCache.set(id,{at:Date.now(),data:j,promise:null});return j}).catch(e=>{historyCache.delete(id);throw e});
  historyCache.set(id,{at:now,data:null,promise});
  return promise;
}
function fixtureId(f){return String(f?.fixtureId??f?.id??'')}
function findFixture(board,id){return (Array.isArray(board?.fixtures)?board.fixtures:[]).find(f=>fixtureId(f)===String(id))||null}
function currentMinute(f,history){
  const fm=num(f?.minute),pts=Array.isArray(history?.pressure)?history.pressure:[],hm=pts.reduce((m,p)=>Math.max(m,num(p?.minute)??0),0);
  return Math.max(1,Math.round(Math.max(fm??0,hm)));
}
function flowPoints(history,current){
  const src=Array.isArray(history?.pressure)?history.pressure:[];
  const out=[];
  for(const p of src){
    const minute=num(p?.minute),home=num(p?.home),away=num(p?.away);
    if(minute===null||home===null||away===null||minute<0||minute>current+3)continue;
    const row={minute,home:clamp(home,1,100),away:clamp(away,1,100)};
    const last=out[out.length-1];
    if(last&&Math.abs(last.minute-minute)<.001)out[out.length-1]=row;else out.push(row);
  }
  return out.sort((a,b)=>a.minute-b.minute);
}
function pathLine(points,key,w,h,pad,current){
  return points.map((p,i)=>`${i?'L':'M'} ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ');
}
function areaLine(points,key,w,h,pad,current){
  if(!points.length)return'';
  const base=yFor(1,h,pad),body=points.map(p=>`L ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ');
  const first=xFor(points[0].minute,w,pad,current),last=xFor(points[points.length-1].minute,w,pad,current);
  return `M ${first.toFixed(1)} ${base.toFixed(1)} ${body} L ${last.toFixed(1)} ${base.toFixed(1)} Z`;
}
function xFor(minute,w,pad,current){return pad.left+(clamp(minute,0,current)/Math.max(1,current))*(w-pad.left-pad.right)}
function yFor(value,h,pad){const v=clamp(value,1,100);return pad.top+((100-v)/99)*(h-pad.top-pad.bottom)}
function flowGrid(w,h,pad,current){
  const ys=[100,75,50,25,1].map(v=>{const y=yFor(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="expand-flow-grid${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" text-anchor="end" class="expand-flow-axis">${v}%</text>`}).join('');
  const step=current<=30?5:current<=60?10:15,marks=[0];for(let m=step;m<current;m+=step)marks.push(m);if(!marks.includes(current))marks.push(current);
  const xs=marks.map(m=>{const x=xFor(m,w,pad,current);return `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="expand-flow-grid v"/><text x="${x}" y="${h-7}" text-anchor="middle" class="expand-flow-axis">${m}'</text>`}).join('');
  return ys+xs;
}
function renderFlow(f,history){
  const current=currentMinute(f,history),points=flowPoints(history,current),home=esc(f?.home?.name||'HOME'),away=esc(f?.away?.name||'AWAY');
  if(!points.length)return `<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'</b></div><small>1–100% · Engine history</small></div><div class="expand-empty">กำลังสะสม Event Flow ของคู่นี้</div>`;
  const w=1000,h=232,pad={left:42,right:18,top:14,bottom:30},last=points[points.length-1],hx=xFor(last.minute,w,pad,current),hy=yFor(last.home,h,pad),ay=yFor(last.away,h,pad),safe=norm(fixtureId(f))||'flow';
  return `<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'</b></div><small>Attack pressure · 1–100%</small></div><div class="expand-flow-legend"><span class="home"><i></i>${home} <b>${Math.round(last.home)}%</b></span><span class="away"><i></i>${away} <b>${Math.round(last.away)}%</b></span><small>${points.length} points · missing early history stays blank</small></div><div class="expand-flow-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Event flow from minute zero to current minute"><defs><linearGradient id="eh-${safe}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#31b878" stop-opacity=".22"/><stop offset="100%" stop-color="#31b878" stop-opacity="0"/></linearGradient><linearGradient id="ea-${safe}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e2c94c" stop-opacity=".20"/><stop offset="100%" stop-color="#e2c94c" stop-opacity="0"/></linearGradient></defs>${flowGrid(w,h,pad,current)}<path d="${areaLine(points,'home',w,h,pad,current)}" fill="url(#eh-${safe})" class="expand-flow-area"/><path d="${areaLine(points,'away',w,h,pad,current)}" fill="url(#ea-${safe})" class="expand-flow-area"/><path d="${pathLine(points,'home',w,h,pad,current)}" class="expand-flow-line home"/><path d="${pathLine(points,'away',w,h,pad,current)}" class="expand-flow-line away"/><circle cx="${hx}" cy="${hy}" r="2.4" class="expand-flow-end home"/><circle cx="${hx}" cy="${ay}" r="2.4" class="expand-flow-end away"/></svg></div>`;
}
function bookName(row,index){return String(row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??`Book ${index+1}`)}
function bookSlug(row,index){return norm(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??`book${index+1}`)}
function bookRoot(row){return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row?.data??row}
function isStageObject(v){if(!v||typeof v!=='object'||Array.isArray(v))return false;const ks=Object.keys(v).map(norm);return ks.some(k=>['opening','open','closing','close','inplay','live'].includes(k))}
function isPriceObject(v){if(!v||typeof v!=='object'||Array.isArray(v))return false;const ks=Object.keys(v).map(norm);return ks.some(k=>['home','draw','away','over','under','line','hdp','handicap','total','yes','no'].includes(k))}
function collectMarkets(root,prefix='',depth=0,out=new Map()){
  if(!root||typeof root!=='object'||Array.isArray(root)||depth>4)return out;
  for(const [key,val] of Object.entries(root)){
    const nk=norm(key);if(SKIP_KEYS.has(nk)||val===null||val===undefined)continue;
    const path=prefix?`${prefix}.${key}`:key;
    if(val&&typeof val==='object'&&!Array.isArray(val)&&(isStageObject(val)||isPriceObject(val))){out.set(path,val);continue}
    if(val&&typeof val==='object'&&!Array.isArray(val))collectMarkets(val,path,depth+1,out);
  }
  return out;
}
function providerBooks(f){
  const root=f?.providerOdds;if(!root||typeof root!=='object')return[];
  const rows=[];
  const push=(name,slug,data)=>{if(!data||typeof data!=='object')return;const s=norm(slug||name);if(rows.some(x=>x.slug===s))return;rows.push({name:String(name||BOOK_LABELS[s]||s||'Bookmaker'),slug:s,root:data})};
  const arr=[root?.bookmakers,root?.data?.bookmakers].find(Array.isArray)||[];
  arr.forEach((row,i)=>push(bookName(row,i),bookSlug(row,i),bookRoot(row)));
  for(const slug of BOOK_PRIORITY){const direct=root?.[slug]??root?.data?.[slug];if(direct)push(BOOK_LABELS[slug],slug,bookRoot(direct))}
  const directRoot=root?.odds??root?.markets??root?.data?.odds??root?.data?.markets;
  if(!rows.length&&directRoot)push('Bet365','bet365',directRoot);
  if(!rows.length&&(isStageObject(root)||collectMarkets(root).size))push('Bet365','bet365',root);
  return rows.sort((a,b)=>{const ai=BOOK_PRIORITY.indexOf(a.slug),bi=BOOK_PRIORITY.indexOf(b.slug);return (ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name)});
}
function marketRank(key){const k=norm(key);const order=['1x2','asianhandicaphalf','asianhandicap','goallinehalf','goalline','cornerlinehalf','cornerasian','cornerline','cardasian','cardline','btts'];for(let i=0;i<order.length;i++)if(k.includes(order[i]))return i;return 100}
function stageRows(market){
  const rows=[['OPEN',market?.opening??market?.open],['CLOSE',market?.closing??market?.close],['LIVE',market?.inplay??market?.in_play??market?.live]].filter(([,v])=>v&&typeof v==='object');
  return rows.length?rows:[['NOW',market]];
}
function fmtNum(v){const n=num(v);return n===null?'—':Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function priceText(v){
  if(!v||typeof v!=='object')return'—';
  const line=num(v.line??v.hdp??v.handicap??v.total),h=num(v.home??v.home_odds??v.homeOdds),d=num(v.draw??v.draw_odds??v.drawOdds),a=num(v.away??v.away_odds??v.awayOdds),o=num(v.over??v.over_odds??v.overOdds),u=num(v.under??v.under_odds??v.underOdds),yes=num(v.yes),no=num(v.no);
  if(h!==null||d!==null||a!==null){const parts=[];if(line!==null)parts.push(`L ${fmtNum(line)}`);if(h!==null)parts.push(`H ${h.toFixed(2)}`);if(d!==null)parts.push(`D ${d.toFixed(2)}`);if(a!==null)parts.push(`A ${a.toFixed(2)}`);return parts.join(' · ')}
  if(o!==null||u!==null){const parts=[];if(line!==null)parts.push(`L ${fmtNum(line)}`);if(o!==null)parts.push(`O ${o.toFixed(2)}`);if(u!==null)parts.push(`U ${u.toFixed(2)}`);return parts.join(' · ')}
  if(yes!==null||no!==null)return [`YES ${yes===null?'—':yes.toFixed(2)}`,`NO ${no===null?'—':no.toFixed(2)}`].join(' · ');
  if(line!==null)return`Line ${fmtNum(line)}`;
  const generic=Object.entries(v).filter(([,x])=>num(x)!==null).slice(0,4).map(([k,x])=>`${pretty(k)} ${fmtNum(x)}`);
  return generic.length?generic.join(' · '):'—';
}
function marketCell(market,index,active){
  const cls=`${active?'active-book-col ':''}expand-odds-cell`;
  if(!market)return `<td data-book-col="${index}" class="${cls}"><span class="expand-odds-missing">—</span></td>`;
  return `<td data-book-col="${index}" class="${cls}">${stageRows(market).map(([stage,v])=>`<div class="expand-odd-stage ${stage.toLowerCase()}"><span>${stage}</span><b>${esc(priceText(v))}</b></div>`).join('')}</td>`;
}
function renderOdds(f){
  const books=providerBooks(f);
  if(!books.length)return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>All bookmakers · All markets</b></div><small>Bulk Snapshot</small></div><div class="expand-empty">ไม่มี providerOdds ใน Bulk Snapshot ของคู่นี้</div>`;
  const maps=books.map(b=>collectMarkets(b.root)),keys=[...new Set(maps.flatMap(m=>[...m.keys()]))].sort((a,b)=>marketRank(a)-marketRank(b)||a.localeCompare(b));
  if(!keys.length)return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>${books.length} bookmakers</b></div><small>Bulk Snapshot</small></div><div class="expand-empty">พบ bookmaker แต่ยังไม่มี market object ที่อ่านได้</div>`;
  const tabs=books.map((b,i)=>`<button type="button" class="expand-book-tab${i===0?' active':''}" data-expand-book-tab="${i}">${esc(b.name)}</button>`).join('');
  const head=books.map((b,i)=>`<th data-book-col="${i}" class="${i===0?'active-book-col':''}">${esc(b.name)}</th>`).join('');
  const body=keys.map(key=>`<tr><th class="expand-market-name">${esc(pretty(key.split('.').slice(-2).join(' · ')))}</th>${books.map((b,i)=>marketCell(maps[i].get(key),i,i===0)).join('')}</tr>`).join('');
  return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>${books.length} bookmakers · ${keys.length} markets</b></div><small>Bulk Snapshot · 0 provider requests on click</small></div><div class="expand-book-tabs">${tabs}</div><div class="expand-odds-wrap"><table class="expand-odds-table"><thead><tr><th>Market</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function shell(id){
  const el=document.createElement('section');el.className='match-expanded';el.dataset.expandedMatch=id;el.innerHTML=`<div class="match-expanded-inner"><section class="expand-card expand-flow-card"><div class="expand-loading">Loading Event Flow…</div></section><section class="expand-card expand-odds-card"><div class="expand-loading">Loading all bookmakers and markets…</div></section></div>`;return el;
}
function bindBookTabs(root){
  root.querySelectorAll('[data-expand-book-tab]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const i=btn.dataset.expandBookTab;root.querySelectorAll('[data-expand-book-tab]').forEach(x=>x.classList.toggle('active',x===btn));root.querySelectorAll('[data-book-col]').forEach(x=>x.classList.toggle('active-book-col',x.dataset.bookCol===i))}))
}
async function mountExpanded(id){
  const row=document.querySelector(`.match-row[data-match-id="${CSS.escape(String(id))}"]`);if(!row||expandedId!==id)return;
  document.querySelectorAll('.match-expanded').forEach(x=>x.remove());
  const seq=++mountSeq,el=shell(id);row.insertAdjacentElement('afterend',el);row.setAttribute('aria-expanded','true');
  const [boardRes,histRes]=await Promise.allSettled([getBoard(),getHistory(id)]);if(seq!==mountSeq||expandedId!==id||!el.isConnected)return;
  const flow=el.querySelector('.expand-flow-card'),odds=el.querySelector('.expand-odds-card');
  const board=boardRes.status==='fulfilled'?boardRes.value:null,fixture=board?findFixture(board,id):null;
  if(flow)flow.innerHTML=fixture&&histRes.status==='fulfilled'?renderFlow(fixture,histRes.value):`<div class="expand-card-head"><div><span>EVENT FLOW</span><b>Unavailable</b></div></div><div class="expand-empty">${esc(histRes.status==='rejected'?histRes.reason?.message:'Fixture not found')}</div>`;
  if(odds)odds.innerHTML=fixture?renderOdds(fixture):`<div class="expand-card-head"><div><span>ODDS BOARD</span><b>Unavailable</b></div></div><div class="expand-empty">${esc(boardRes.status==='rejected'?boardRes.reason?.message:'Fixture not found')}</div>`;
  bindBookTabs(el);
}
function scheduleMount(){clearTimeout(mountTimer);mountTimer=setTimeout(()=>{if(expandedId&&!document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(String(expandedId))}"]`))mountExpanded(expandedId)},30)}
function closeExpanded(){expandedId=null;mountSeq++;document.querySelectorAll('.match-expanded').forEach(x=>x.remove());document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'))}
function init(){
  const board=$('[data-board-sections]');if(!board)return;
  document.addEventListener('click',e=>{const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;const id=String(row.dataset.matchId||'');if(!id)return;const closing=expandedId===id;if(closing){closeExpanded();return}expandedId=id;setTimeout(()=>mountExpanded(id),0)},true);
  new MutationObserver(()=>{if(expandedId)scheduleMount()}).observe(board,{childList:true,subtree:true});
  window.NOMAD343_EXPANDED_MATCH={version:VERSION,close:closeExpanded,reload:()=>expandedId&&mountExpanded(expandedId)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
