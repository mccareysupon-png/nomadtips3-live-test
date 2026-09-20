(()=>{
'use strict';
// BALL46_FULL_MARKET_SIDECAR_V2
// Default Card + Monitor read from CENTRAL FULL-MARKET CACHE only.
// Browser may read our own cache endpoint in batches; it can never trigger 5USD.
const VERSION='343-full-market-sidecar-v2-central-cache-batch-all-books';
const API='/api/full-market/board-cache';
const STYLE_ID='ball46-full-market-sidecar-v2-style';
const HOST='[data-board-sections]';
const ROW='.match-row[data-match-id]';
const SIDECAR_CLASS='b46-fm-sidecar';
const CACHE_READ_MS=30_000;
const BATCH_SIZE=16;
const cache=new Map();
const readAt=new Map();
let producer=null;
let requestInFlight=false;
let renderTimer=0;
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const scalar=v=>v!==null&&v!==undefined&&['string','number','boolean'].includes(typeof v);
const bookId=(row,i=0)=>String(row?.slug??row?.bookmaker?.slug??row?.id??row?.bookmaker?.id??row?.name??row?.bookmaker?.name??`provider-${i}`);
const bookName=(row,i=0)=>String(row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??row?.id??row?.bookmaker?.id??`Provider ${i+1}`);
const bookOdds=row=>row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row?.data??row;
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;
  s.textContent=`
.${SIDECAR_CLASS}{margin:-1px 0 7px;border:1px solid var(--line,#dfe6e3);border-top:0;border-radius:0 0 10px 10px;background:var(--panel-2,#fff);display:grid;grid-template-columns:190px minmax(0,1fr);min-width:0;overflow:hidden}
.${SIDECAR_CLASS} .fm-monitor{padding:7px 9px;border-right:1px solid var(--line,#dfe6e3);font-size:7px;line-height:1.35;display:flex;flex-direction:column;gap:3px;justify-content:center}.fm-monitor b{font-size:8px}.fm-good{color:#15945f}.fm-held{color:#b07a18}.fm-empty{color:var(--muted,#7b8782)}
.${SIDECAR_CLASS} .fm-books{display:flex;gap:6px;overflow-x:auto;padding:6px 7px;scrollbar-width:thin;min-width:0}
.${SIDECAR_CLASS} .fm-book{flex:0 0 220px;border:1px solid var(--line,#dfe6e3);border-radius:8px;background:var(--panel,#fff);padding:5px 6px;min-width:0;max-height:220px;overflow:auto}.fm-book>header{position:sticky;top:-5px;background:var(--panel,#fff);z-index:1;display:flex;align-items:center;justify-content:space-between;gap:5px;margin:-5px -6px 4px;padding:5px 6px;border-bottom:1px solid var(--line,#dfe6e3)}.fm-book>header b{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-book>header span{font-size:6px;color:var(--muted,#7b8782)}
.${SIDECAR_CLASS} .fm-market{padding:3px 0;border-top:1px dashed var(--line,#dfe6e3);font-size:6.5px;line-height:1.3}.fm-market:first-of-type{border-top:0}.fm-market strong{display:block;font-size:6.7px}.fm-market small{display:block;color:var(--muted,#7b8782);white-space:normal;overflow-wrap:anywhere}
@media(max-width:760px){.${SIDECAR_CLASS}{grid-template-columns:1fr}.${SIDECAR_CLASS} .fm-monitor{border-right:0;border-bottom:1px solid var(--line,#dfe6e3);flex-direction:row;flex-wrap:wrap;justify-content:flex-start}.${SIDECAR_CLASS} .fm-book{flex-basis:190px;max-height:190px}}
`;
  document.head.appendChild(s);
}
function uniqueObjects(arr){const out=[],seen=new Set();for(const x of arr){if(!plain(x))continue;const key=JSON.stringify([x?.slug,x?.id,x?.name,x?.bookmaker?.slug,x?.bookmaker?.id,x?.bookmaker?.name]);if(seen.has(key))continue;seen.add(key);out.push(x)}return out}
function bookmakerArrays(root){const out=[];const walk=(node,depth=0)=>{if(depth>5||!node)return;if(Array.isArray(node)){for(const x of node)walk(x,depth+1);return}if(!plain(node))return;for(const [k,v] of Object.entries(node)){if(norm(k)==='bookmakers'&&Array.isArray(v))out.push(...v);else if(depth<5&&(plain(v)||Array.isArray(v)))walk(v,depth+1)}};walk(root);return uniqueObjects(out)}
function keyedBookmakers(root){if(!plain(root))return[];const out=[],hosts=[root,root.data,root.odds,root.markets,root?.data?.odds,root?.data?.markets].filter(plain);for(const host of hosts){for(const [k,v] of Object.entries(host)){if(!plain(v))continue;const odds=v?.odds??v?.markets??v?.data?.odds??v?.data?.markets;const named=v?.slug??v?.name??v?.bookmaker?.slug??v?.bookmaker?.name;if(odds&&typeof odds==='object')out.push({slug:v?.slug??k,name:v?.name??v?.bookmaker?.name??k,...v});else if(named&&!['data','odds','markets','prices'].includes(norm(k)))out.push({slug:v?.slug??k,name:v?.name??k,...v})}}return uniqueObjects(out)}
function extractBooksFromRoot(root){
  if(!root||typeof root!=='object')return[];
  let rows=bookmakerArrays(root);if(!rows.length)rows=keyedBookmakers(root);
  if(!rows.length){const candidate=plain(root?.odds)?root.odds:plain(root?.markets)?root.markets:plain(root)?root:null;if(candidate)rows=[{slug:'provider',name:'Provider',odds:candidate}]}
  return rows.map((row,i)=>({id:bookId(row,i),name:bookName(row,i),odds:bookOdds(row)})).filter(x=>x.odds&&typeof x.odds==='object');
}
function flatten(node,prefix='',depth=0,out=[]){if(depth>8||node===null||node===undefined)return out;if(Array.isArray(node)){node.forEach((v,i)=>flatten(v,`${prefix}${prefix?'.':''}${i}`,depth+1,out));return out}if(!plain(node)){if(scalar(node))out.push([prefix||'value',node]);return out}for(const [k,v] of Object.entries(node))flatten(v,prefix?`${prefix}.${k}`:k,depth+1,out);return out}
function marketEntries(odds){if(!odds||typeof odds!=='object')return[];if(Array.isArray(odds))return odds.map((v,i)=>[String(v?.market??v?.market_name??v?.name??`market_${i+1}`),v]);return Object.entries(odds).filter(([k])=>!['id','name','slug','bookmaker','bookmaker_id','fixture_id','updated_at','timestamp'].includes(String(k).toLowerCase()))}
function valuesText(value){const leaves=flatten(value);return leaves.length?leaves.map(([p,v])=>`${p}=${String(v)}`).join(' · '):'no price'}
function countPrices(value){return flatten(value).filter(([,v])=>typeof v==='number'||(typeof v==='string'&&v.trim()!==''&&!Number.isNaN(Number(v)))).length}
function ageLabel(ms){if(!Number.isFinite(ms)||ms<0)return'—';if(ms<1000)return'<1s';if(ms<60000)return`${Math.round(ms/1000)}s`;return`${(ms/60000).toFixed(1)}m`}
function summarize(root,entry){const books=extractBooksFromRoot(root);let markets=0,prices=0;for(const b of books){const m=marketEntries(b.odds);markets+=m.length;for(const [,v] of m)prices+=countPrices(v)}return{books,bookCount:Number(entry?.bookmakerCount??books.length),marketCount:Number(entry?.marketCount??markets),prices:Number(entry?.numericValueCount??prices)}}
function bookHtml(book){const markets=marketEntries(book.odds);return `<section class="fm-book" data-book="${esc(book.id)}"><header><b>${esc(book.name)}</b><span>${markets.length} markets</span></header>${markets.length?markets.map(([k,v])=>`<div class="fm-market"><strong>${esc(k)}</strong><small>${esc(valuesText(v))}</small></div>`).join(''):'<div class="fm-market"><small>odds {}</small></div>'}</section>`}
function sourceFor(fixture,entry){if(entry?.fullOdds)return{root:entry.fullOdds,state:entry.held?'HELD':'CACHE',held:Boolean(entry.held),age:Number(entry.ageMs),entry};if(fixture?.providerOdds&&typeof fixture.providerOdds==='object')return{root:fixture.providerOdds,state:fixture?.providerOddsHeld?'BULK HELD':'BULK',held:Boolean(fixture?.providerOddsHeld),age:Date.now()-Number(fixture?.providerOddsFreshAt??fixture?.providerOddsUpdatedAt??0),entry:null};return{root:null,state:'WAIT',held:false,age:NaN,entry:null}}
function monitorLine(src,sum){const p=producer||{};const cls=src.held?'fm-held':src.root?'fm-good':'fm-empty';const cycle=p?.cycleId?String(p.cycleId):'—';const q=Number(p?.queued??0),calls=Number(p?.providerCalls??0);return `<div class="fm-monitor"><b class="${cls}">FULL MARKET · ${esc(src.state)}</b><span>${sum.bookCount} bookmakers · ${sum.marketCount} markets</span><span>${sum.prices} numeric values · age ${ageLabel(src.age)}</span><span>producer ${esc(cycle)} · queue ${q} · calls ${calls}</span><span>viewer→5USD +0 · shared cache read</span>${src.entry?.lastError?`<span class="fm-held">${esc(src.entry.lastError)}</span>`:''}</div>`}
function sidecarHtml(fixture,entry){const src=sourceFor(fixture,entry),sum=summarize(src.root,src.entry);return `${monitorLine(src,sum)}<div class="fm-books">${sum.books.length?sum.books.map(bookHtml).join(''):'<div class="fm-book"><header><b>No Full Market cache yet</b></header><div class="fm-market"><small>Waiting for central producer. Viewer does not call 5USD.</small></div></div>'}</div>`}
function renderExpanded(id,fixture,entry){if(!entry?.fullOdds)return;const expanded=document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;if(!expanded?.isConnected||!renderer?.update)return;const rich={...fixture,providerOdds:entry.fullOdds,providerOddsUpdatedAt:entry.fetchedAt??fixture?.providerOddsUpdatedAt??null,providerOddsFreshAt:entry.fetchedAt??fixture?.providerOddsFreshAt??null,providerOddsHeld:Boolean(entry.held),fullMarketSource:'CENTRAL_CACHE_READ_ONLY'};expanded._nomadRichFixture=rich;expanded.dataset.oddsRenderOwner='full-market-sidecar-cache';renderer.update(expanded,rich)}
function render(){const api=window.NOMAD343_DASHBOARD_V2;if(!api?.getFixture)return;document.querySelectorAll(ROW).forEach(row=>{const id=String(row.dataset.matchId||'');if(!id)return;const fixture=api.getFixture(id);if(!fixture)return;const entry=cache.get(id)||null;let side=document.querySelector(`.${SIDECAR_CLASS}[data-for-match="${CSS.escape(id)}"]`);const expanded=document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);if(!side){side=document.createElement('div');side.className=SIDECAR_CLASS;side.dataset.forMatch=id;(expanded?.isConnected?expanded:row).insertAdjacentElement('afterend',side)}else if(expanded?.isConnected&&side.previousElementSibling!==expanded){expanded.insertAdjacentElement('afterend',side)}const stamp=[entry?.fetchedAt,entry?.held,entry?.lastAttemptAt,fixture?.providerOddsFreshAt,JSON.stringify(producer||{}).length].join('|');if(side.dataset.stamp!==stamp){side.dataset.stamp=stamp;side.innerHTML=sidecarHtml(fixture,entry)}renderExpanded(id,fixture,entry)})}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,25)}
function visibleIds(){return [...new Set([...document.querySelectorAll(ROW)].map(row=>String(row.dataset.matchId||'').trim()).filter(Boolean))]}
async function fetchBatch(ids){const r=await fetch(API,{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds:ids})});const j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);if(Number(j.externalRequestsAdded||0)!==0||j.viewerRefreshEnabled!==false)throw new Error('FULL_MARKET_CACHE_ROUTE_NOT_READ_ONLY');producer=j.producer||producer;const entries=j.entries&&typeof j.entries==='object'?j.entries:{};const at=Date.now();for(const id of ids){readAt.set(id,at);if(entries[id]?.fullOdds)cache.set(id,entries[id])}return j}
async function refreshVisible(force=false){if(requestInFlight||document.visibilityState==='hidden')return;const now=Date.now(),ids=visibleIds();const wanted=ids.filter(id=>force||!readAt.has(id)||now-Number(readAt.get(id)||0)>=CACHE_READ_MS);if(!wanted.length){scheduleRender();return}requestInFlight=true;try{for(let i=0;i<wanted.length;i+=BATCH_SIZE)await fetchBatch(wanted.slice(i,i+BATCH_SIZE));}catch(err){console.warn('Full Market central cache read unavailable',err)}finally{requestInFlight=false;scheduleRender()}}
function scheduleRefresh(){scheduleRender();refreshVisible(false).catch(()=>{})}
function start(){installStyle();const host=document.querySelector(HOST);if(host)new MutationObserver(scheduleRefresh).observe(host,{childList:true,subtree:true});document.addEventListener('nomad343:fixture-ready',scheduleRefresh);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshVisible(true).catch(()=>{})});setTimeout(()=>refreshVisible(true).catch(()=>{}),250);setInterval(()=>refreshVisible(false).catch(()=>{}),CACHE_READ_MS);window.NOMAD343_FULL_MARKET_SIDECAR={version:VERSION,mode:'CENTRAL_CACHE_BATCH_READ_ONLY',cacheApi:API,viewerTriggeredProviderFetch:false,providerRequestsPerViewer:0,internalCacheRead:true,batchSize:BATCH_SIZE,bookmakerPolicy:'DISPLAY_ALL_RETURNED_BOOKMAKERS',marketPolicy:'DISPLAY_ALL_RETURNED_MARKETS',refresh:()=>refreshVisible(true),extractBooks:extractBooksFromRoot,current:id=>cache.get(String(id))||null}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
