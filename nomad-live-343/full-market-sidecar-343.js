(()=>{
'use strict';
// BALL46_FULL_MARKET_SIDECAR_V1
// Read-only display branch: HUB/board snapshot -> providerOdds -> Default Card + Monitor.
// ZERO network. ZERO Engine/Signal/Prediction writes. ZERO bookmaker whitelist.
const VERSION='343-full-market-sidecar-v1-cache-only-all-provider-books';
const STYLE_ID='ball46-full-market-sidecar-v1-style';
const HOST='[data-board-sections]';
const ROW='.match-row[data-match-id]';
const SIDECAR_CLASS='b46-fm-sidecar';
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scalar=v=>v!==null&&v!==undefined&&['string','number','boolean'].includes(typeof v);
const bookId=(row,i=0)=>String(row?.slug??row?.bookmaker?.slug??row?.id??row?.bookmaker?.id??row?.name??row?.bookmaker?.name??`provider-${i}`);
const bookName=(row,i=0)=>String(row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??row?.id??row?.bookmaker?.id??`Provider ${i+1}`);
const bookOdds=row=>row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row?.data??row;
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;
  s.textContent=`
.${SIDECAR_CLASS}{margin:-1px 0 7px;border:1px solid var(--line,#dfe6e3);border-top:0;border-radius:0 0 10px 10px;background:var(--panel-2,#fff);display:grid;grid-template-columns:170px minmax(0,1fr);min-width:0;overflow:hidden}
.${SIDECAR_CLASS} .fm-monitor{padding:7px 9px;border-right:1px solid var(--line,#dfe6e3);font-size:7px;line-height:1.35;display:flex;flex-direction:column;gap:3px;justify-content:center}
.${SIDECAR_CLASS} .fm-monitor b{font-size:8px}.fm-good{color:#15945f}.fm-held{color:#b07a18}.fm-empty{color:var(--muted,#7b8782)}
.${SIDECAR_CLASS} .fm-books{display:flex;gap:6px;overflow-x:auto;padding:6px 7px;scrollbar-width:thin;min-width:0}
.${SIDECAR_CLASS} .fm-book{flex:0 0 210px;border:1px solid var(--line,#dfe6e3);border-radius:8px;background:var(--panel,#fff);padding:5px 6px;min-width:0}
.${SIDECAR_CLASS} .fm-book>header{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:4px}.fm-book>header b{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-book>header span{font-size:6px;color:var(--muted,#7b8782)}
.${SIDECAR_CLASS} .fm-market{padding:3px 0;border-top:1px dashed var(--line,#dfe6e3);font-size:6.5px;line-height:1.3}.fm-market:first-of-type{border-top:0}.fm-market strong{display:block;font-size:6.7px}.fm-market small{display:block;color:var(--muted,#7b8782);white-space:normal;overflow-wrap:anywhere}
@media(max-width:760px){.${SIDECAR_CLASS}{grid-template-columns:1fr}.${SIDECAR_CLASS} .fm-monitor{border-right:0;border-bottom:1px solid var(--line,#dfe6e3);flex-direction:row;flex-wrap:wrap;justify-content:flex-start}.${SIDECAR_CLASS} .fm-book{flex-basis:180px}}
`;
  document.head.appendChild(s);
}
function uniqueObjects(arr){const out=[],seen=new Set();for(const x of arr){if(!plain(x))continue;const key=JSON.stringify([x?.slug,x?.id,x?.name,x?.bookmaker?.slug,x?.bookmaker?.id,x?.bookmaker?.name,Object.keys(x||{}).slice(0,8)]);if(seen.has(key))continue;seen.add(key);out.push(x)}return out}
function bookmakerArrays(root){
  const out=[];
  const walk=(node,depth=0)=>{if(depth>5||!node)return;if(Array.isArray(node)){for(const x of node)walk(x,depth+1);return}if(!plain(node))return;for(const [k,v] of Object.entries(node)){if(norm(k)==='bookmakers'&&Array.isArray(v))out.push(...v);else if(depth<5&&(plain(v)||Array.isArray(v)))walk(v,depth+1)}};
  walk(root);return uniqueObjects(out);
}
function keyedBookmakers(root){
  if(!plain(root))return[];const out=[];
  const hosts=[root,root.data,root.odds,root.markets,root?.data?.odds,root?.data?.markets].filter(plain);
  for(const host of hosts){for(const [k,v] of Object.entries(host)){if(!plain(v))continue;const odds=v?.odds??v?.markets??v?.data?.odds??v?.data?.markets;const named=v?.slug??v?.name??v?.bookmaker?.slug??v?.bookmaker?.name;if(odds&&plain(odds))out.push({slug:v?.slug??k,name:v?.name??v?.bookmaker?.name??k,...v});else if(named&&!['data','odds','markets','prices'].includes(norm(k)))out.push({slug:v?.slug??k,name:v?.name??k,...v})}}
  return uniqueObjects(out);
}
function extractBooks(fixture){
  const root=fixture?.providerOdds;if(!root||typeof root!=='object')return[];
  let rows=bookmakerArrays(root);if(!rows.length)rows=keyedBookmakers(root);
  if(!rows.length){
    // Unknown bookmaker identity: preserve the payload without inventing Bet365.
    const candidate=plain(root?.odds)?root.odds:plain(root?.markets)?root.markets:plain(root)?root:null;
    if(candidate)rows=[{slug:'provider',name:'Provider',odds:candidate}];
  }
  return rows.map((row,i)=>({id:bookId(row,i),name:bookName(row,i),odds:bookOdds(row)})).filter(x=>x.odds&&typeof x.odds==='object');
}
function flatten(node,prefix='',depth=0,out=[]){
  if(depth>6||node===null||node===undefined)return out;
  if(Array.isArray(node)){node.forEach((v,i)=>flatten(v,`${prefix}${prefix?'.':''}${i}`,depth+1,out));return out}
  if(!plain(node)){if(scalar(node))out.push([prefix||'value',node]);return out}
  for(const [k,v] of Object.entries(node))flatten(v,prefix?`${prefix}.${k}`:k,depth+1,out);
  return out;
}
function marketEntries(odds){
  if(!odds||typeof odds!=='object')return[];
  if(Array.isArray(odds))return odds.map((v,i)=>[String(v?.market??v?.market_name??v?.name??`market_${i+1}`),v]);
  return Object.entries(odds).filter(([k])=>!['id','name','slug','bookmaker','bookmaker_id','fixture_id','updated_at','timestamp'].includes(String(k).toLowerCase()));
}
function valuesText(value){
  const leaves=flatten(value);if(!leaves.length)return'no price';
  return leaves.slice(0,30).map(([p,v])=>`${p}=${String(v)}`).join(' · ')+(leaves.length>30?` · +${leaves.length-30} more`:'');
}
function countPrices(value){return flatten(value).filter(([,v])=>typeof v==='number'||(typeof v==='string'&&v.trim()!==''&&!Number.isNaN(Number(v)))).length}
function ageLabel(ms){if(!Number.isFinite(ms)||ms<0)return'—';if(ms<1000)return'<1s';if(ms<60000)return`${Math.round(ms/1000)}s`;return`${(ms/60000).toFixed(1)}m`}
function summarize(fixture,books){
  let markets=0,prices=0;for(const b of books){const m=marketEntries(b.odds);markets+=m.length;for(const [,v] of m)prices+=countPrices(v)}
  const fresh=Number(fixture?.providerOddsFreshAt??fixture?.providerOddsUpdatedAt??0);const age=fresh?Date.now()-fresh:NaN;
  return{books:books.length,markets,prices,age,held:Boolean(fixture?.providerOddsHeld),freshAt:fresh||null};
}
function bookHtml(book){const markets=marketEntries(book.odds);return `<section class="fm-book" data-book="${esc(book.id)}"><header><b>${esc(book.name)}</b><span>${markets.length} markets</span></header>${markets.length?markets.map(([k,v])=>`<div class="fm-market"><strong>${esc(k)}</strong><small>${esc(valuesText(v))}</small></div>`).join(''):'<div class="fm-market"><small>odds {}</small></div>'}</section>`}
function sidecarHtml(fixture){const books=extractBooks(fixture),s=summarize(fixture,books),state=s.held?'HELD':'CACHE',cls=s.held?'fm-held':books.length?'fm-good':'fm-empty';return `<div class="fm-monitor"><b class="${cls}">FULL MARKET · ${state}</b><span>${s.books} bookmakers · ${s.markets} markets</span><span>${s.prices} numeric values · age ${ageLabel(s.age)}</span><span>viewer API +0</span></div><div class="fm-books">${books.length?books.map(bookHtml).join(''):'<div class="fm-book"><header><b>No bookmaker odds in current snapshot</b></header><div class="fm-market"><small>Waiting for next HUB snapshot. No viewer fetch is made.</small></div></div>'}</div>`}
let applying=false,timer=0;
function apply(){
  if(applying)return;applying=true;
  try{
    const api=window.NOMAD343_DASHBOARD_V2;if(!api?.getFixture)return;
    document.querySelectorAll(ROW).forEach(row=>{
      const id=String(row.dataset.matchId||'');if(!id)return;const fixture=api.getFixture(id);if(!fixture)return;
      let side=row.nextElementSibling;if(!side?.classList?.contains(SIDECAR_CLASS)){side=document.createElement('div');side.className=SIDECAR_CLASS;side.dataset.forMatch=id;row.insertAdjacentElement('afterend',side)}
      let payloadSize=0;try{payloadSize=JSON.stringify(fixture?.providerOdds||{}).length}catch{}
      const stamp=[fixture?.providerOddsUpdatedAt,fixture?.providerOddsFreshAt,fixture?.providerOddsHeld,payloadSize].join('|');
      if(side.dataset.stamp===stamp)return;side.dataset.stamp=stamp;side.innerHTML=sidecarHtml(fixture);
    });
  }finally{applying=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(apply,30)}
function start(){
  installStyle();const host=document.querySelector(HOST);if(host)new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
  schedule();setInterval(schedule,1000);
  window.NOMAD343_FULL_MARKET_SIDECAR={version:VERSION,mode:'CACHE_ONLY_ZERO_NETWORK',viewerRequestsAdded:0,providerRequestsAdded:0,bookmakerPolicy:'DISPLAY_ALL_PRESENT_IN_PROVIDER_ODDS',marketPolicy:'DISPLAY_ALL_PRESENT_MARKETS',refresh:schedule,extractBooks,summarize};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
