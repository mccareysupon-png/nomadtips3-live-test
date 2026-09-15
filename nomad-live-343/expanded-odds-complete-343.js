(()=>{
'use strict';
const VERSION='343-expanded-odds-complete-v1';
const BOARD_API='/api/engine/board';
const CACHE_MS=15_000;
const CANON=[
  ['bet365','Bet365'],['pinnacle','Pinnacle'],['crown','Crown'],['1xbet','1xBet'],['12bet','12Bet'],
  ['interwetten','Interwetten'],['macauslot','Macau Slot'],['18bet','18Bet'],['vcbet','VCBet'],['easybets','Easybets']
];
const META_KEYS=new Set(['id','name','slug','bookmaker','bookmakerid','bookmaker_id','source','provider','updatedat','updated_at','createdat','created_at','timestamp','status','active','meta','metadata']);
const GENERIC_PATH=new Set(['data','odds','markets','market','prices','price']);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const pretty=v=>String(v||'Market').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
let boardCache={at:0,data:null,promise:null};

async function fetchJson(url){const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP_${r.status}`);return j}
async function getBoard(){const now=Date.now();if(boardCache.data&&now-boardCache.at<CACHE_MS)return boardCache.data;if(boardCache.promise)return boardCache.promise;boardCache.promise=fetchJson(BOARD_API).then(j=>{boardCache={at:Date.now(),data:j,promise:null};return j}).catch(e=>{boardCache.promise=null;throw e});return boardCache.promise}
function canonicalBook(raw){const n=norm(raw);if(!n)return'unknown';for(const [slug] of CANON){if(n===slug||n.includes(slug)||slug.includes(n))return slug}return n}
function bookLabel(slug,fallback){return CANON.find(([s])=>s===slug)?.[1]||String(fallback||slug||'Bookmaker')}
function rowBookName(row,key=''){return String((row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??key)||'Bookmaker')}
function rowBookSlug(row,key=''){return canonicalBook(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??key)}
function bookRoot(row){return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row?.data??row}
function mergeObj(a,b){if(!plain(a))return b;if(!plain(b))return a;const out={...a};for(const [k,v] of Object.entries(b)){out[k]=plain(out[k])&&plain(v)?mergeObj(out[k],v):v}return out}
function providerBookMap(f){
  const root=f?.providerOdds,map=new Map();if(!plain(root))return map;
  const push=(name,slug,data)=>{if(!plain(data))return;const s=canonicalBook(slug||name);if(s==='unknown')return;const prev=map.get(s);map.set(s,{slug:s,name:bookLabel(s,name),root:prev?mergeObj(prev.root,data):data,found:true})};
  const ingest=container=>{
    if(Array.isArray(container)){container.forEach((row,i)=>push(rowBookName(row,`Book ${i+1}`),rowBookSlug(row,`book${i+1}`),bookRoot(row)));return}
    if(!plain(container))return;
    if(container.name||container.slug||container.bookmaker||container.odds||container.markets){push(rowBookName(container),rowBookSlug(container),bookRoot(container));return}
    for(const [key,row] of Object.entries(container)){if(plain(row))push(rowBookName(row,key),rowBookSlug(row,key),bookRoot(row))}
  };
  [root.bookmakers,root?.data?.bookmakers,root?.odds?.bookmakers,root?.data?.odds?.bookmakers,root?.markets?.bookmakers,root?.data?.markets?.bookmakers].forEach(ingest);
  for(const [slug,name] of CANON){for(const host of [root,root.data,root.odds,root.markets,root?.data?.odds,root?.data?.markets]){if(plain(host?.[slug]))push(name,slug,bookRoot(host[slug]))}}
  const direct=root?.odds??root?.markets??root?.data?.odds??root?.data?.markets;
  if(!map.size&&plain(direct))push('Bet365','bet365',direct);
  return map;
}
function orderedBooks(f){
  const found=providerBookMap(f),out=CANON.map(([slug,name])=>found.get(slug)||{slug,name,root:null,found:false});
  const extras=[...found.values()].filter(b=>!CANON.some(([s])=>s===b.slug)).sort((a,b)=>a.name.localeCompare(b.name));
  return out.concat(extras);
}
function isStageObject(v){if(!plain(v))return false;const ks=Object.keys(v).map(norm);return ks.some(k=>['opening','open','closing','close','prematch','pre','inplay','live'].includes(k))}
function isPriceObject(v){if(!plain(v))return false;const ks=Object.keys(v).map(norm);return ks.some(k=>['home','homeodds','draw','drawodds','away','awayodds','over','overodds','under','underodds','line','hdp','handicap','total','yes','no'].includes(k))}
function marketMeta(path){
  const n=norm(path);
  const rules=[
    [/1x2half|half1x2|1h1x2/,'1x2_half','1X2 · 1H',1],[/asianhandicaphalf|halfasianhandicap|1hasianhandicap/,'asian_handicap_half','Asian Handicap · 1H',2],
    [/goallinehalf|halfgoalline|1hgoalline/,'goal_line_half','Goal O/U · 1H',3],[/cornerlinehalf|halfcornerline|1hcornerline/,'corner_line_half','Corner O/U · 1H',4],
    [/cornerasianhalf|halfcornerasian|1hcornerasian/,'corner_asian_half','Corner AH · 1H',5],[/1x2/,'1x2','1X2',10],
    [/asianhandicap/,'asian_handicap','Asian Handicap',11],[/goalline/,'goal_line','Goal O/U',12],[/cornerasian/,'corner_asian','Corner AH',13],
    [/cornerline/,'corner_line','Corner O/U',14],[/cardasian|cardsasian/,'card_asian','Cards AH',15],[/cardline|cardsline/,'card_line','Cards O/U',16],[/btts|bothteamstoscore/,'btts','BTTS',17]
  ];
  for(const [re,key,label,rank] of rules)if(re.test(n))return{key,label,rank};
  const parts=String(path).split('.').filter(p=>!GENERIC_PATH.has(String(p).toLowerCase()));const raw=parts.slice(-2).join(' · ')||path;
  return{key:`other:${norm(raw)||norm(path)}`,label:pretty(raw),rank:100};
}
function collectMarkets(root,prefix='',depth=0,out=new Map()){
  if(!plain(root)||depth>6)return out;
  for(const [key,val] of Object.entries(root)){
    if(META_KEYS.has(String(key).toLowerCase())||META_KEYS.has(norm(key))||val===null||val===undefined)continue;
    const path=prefix?`${prefix}.${key}`:key;
    if(plain(val)&&(isStageObject(val)||isPriceObject(val))){const m=marketMeta(path),prev=out.get(m.key);out.set(m.key,{...m,rawPath:path,value:prev?mergeObj(prev.value,val):val});continue}
    if(plain(val))collectMarkets(val,path,depth+1,out);
  }
  return out;
}
function stageLookup(market,aliases){if(!plain(market))return null;for(const [k,v] of Object.entries(market)){if(aliases.includes(norm(k))&&plain(v))return v}return null}
function stageValue(market,stage){
  if(!plain(market))return null;
  if(stage==='OPEN')return stageLookup(market,['opening','open']);
  if(stage==='CLOSE')return stageLookup(market,['closing','close']);
  if(stage==='PRE')return stageLookup(market,['prematch','pre']);
  if(stage==='LIVE')return stageLookup(market,['inplay','live']);
  if(stage==='NOW')return isStageObject(market)?null:market;
  return null;
}
function stagesFor(bookMaps,key){
  const stages=['OPEN','CLOSE','LIVE'];let hasPre=false,hasNow=false;
  for(const map of bookMaps){const m=map.get(key)?.value;if(!m)continue;if(stageValue(m,'PRE'))hasPre=true;if(stageValue(m,'NOW'))hasNow=true}
  if(hasPre)stages.splice(2,0,'PRE');if(hasNow)stages.push('NOW');return stages;
}
function flattenNumeric(v,prefix='',depth=0,out=[]){if(depth>3||!plain(v))return out;for(const [k,x] of Object.entries(v)){const path=prefix?`${prefix}.${k}`:k,n=num(x);if(n!==null){if(!/(^|\.)(id|timestamp|updated|created|time)$/i.test(path))out.push({path,key:k,norm:norm(k),value:n})}else if(plain(x))flattenNumeric(x,path,depth+1,out)}return out}
function fmt(v,odds=false){const n=num(v);if(n===null)return'—';if(odds)return n.toFixed(2);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function priceHtml(v){
  if(!plain(v))return'<span class="complete-odds-empty">—</span>';
  const leaves=flattenNumeric(v),used=new Set(),parts=[];
  const take=(label,aliases,odds=false)=>{const i=leaves.findIndex((x,j)=>!used.has(j)&&aliases.includes(x.norm));if(i<0)return;used.add(i);parts.push(`<span><i>${esc(label)}</i><b>${esc(fmt(leaves[i].value,odds))}</b></span>`)};
  take('L',['line','hdp','handicap','total']);take('H',['home','homeodds'],true);take('D',['draw','drawodds'],true);take('A',['away','awayodds'],true);take('O',['over','overodds'],true);take('U',['under','underodds'],true);take('YES',['yes'],true);take('NO',['no'],true);
  leaves.forEach((x,i)=>{if(used.has(i))return;parts.push(`<span><i>${esc(pretty(x.path.split('.').slice(-2).join(' ')))}</i><b>${esc(fmt(x.value,false))}</b></span>`)});
  return parts.length?`<div class="complete-odd-values">${parts.join('')}</div>`:'<span class="complete-odds-empty">—</span>';
}
function render(f){
  const books=orderedBooks(f),maps=books.map(b=>b.root?collectMarkets(b.root):new Map()),metaMap=new Map();
  maps.forEach(m=>m.forEach((v,k)=>{if(!metaMap.has(k))metaMap.set(k,v)}));
  const markets=[...metaMap.values()].sort((a,b)=>a.rank-b.rank||a.label.localeCompare(b.label));
  const foundCount=books.filter(b=>b.found).length;
  const tabs=books.map((b,i)=>`<button type="button" class="complete-book-tab${i===0?' active':''}" data-complete-book-tab="${i}">${esc(b.name)}</button>`).join('');
  const head=books.map((b,i)=>`<th data-complete-book-col="${i}" class="${i===0?'active-book-col ':''}${b.found?'':'book-missing'}">${esc(b.name)}${b.found?'':' · —'}</th>`).join('');
  if(!markets.length)return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>${foundCount} bookmakers found</b></div><small>Bulk Snapshot · missing = —</small></div><div class="expand-empty">ยังไม่มี market data ใน providerOdds ของคู่นี้</div>`;
  const rows=markets.map(m=>{const stages=stagesFor(maps,m.key);return stages.map((stage,si)=>`<tr>${si===0?`<th class="complete-market-name" rowspan="${stages.length}">${esc(m.label)}</th>`:''}<th class="complete-stage-name ${stage.toLowerCase()}">${esc(stage)}</th>${books.map((b,bi)=>{const val=stageValue(maps[bi].get(m.key)?.value,stage);return `<td data-complete-book-col="${bi}" class="complete-odds-cell ${bi===0?'active-book-col':''}">${priceHtml(val)}</td>`}).join('')}</tr>`).join('')}).join('');
  return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>${books.length} bookmaker columns · ${markets.length} markets</b></div><small>OPEN · CLOSE · LIVE · Bulk Snapshot · ${foundCount} with data</small></div><div class="complete-book-tabs">${tabs}</div><div class="complete-odds-wrap"><table class="complete-odds-table"><thead><tr><th>Market</th><th>Stage</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bind(card){card.querySelectorAll('[data-complete-book-tab]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const i=btn.dataset.completeBookTab;card.querySelectorAll('[data-complete-book-tab]').forEach(x=>x.classList.toggle('active',x===btn));card.querySelectorAll('[data-complete-book-col]').forEach(x=>x.classList.toggle('active-book-col',x.dataset.completeBookCol===i))}))}
async function hydrate(card){
  if(!card||card.dataset.completeOddsVersion===VERSION||card.dataset.completeOddsBusy==='1'||card.querySelector('.expand-loading'))return;
  const shell=card.closest('.match-expanded'),id=String(shell?.dataset.expandedMatch||'');if(!id)return;card.dataset.completeOddsBusy='1';
  try{const board=await getBoard(),fixture=(Array.isArray(board?.fixtures)?board.fixtures:[]).find(f=>String(f?.fixtureId??f?.id??'')===id);if(!card.isConnected)return;card.innerHTML=fixture?render(fixture):'<div class="expand-empty">Fixture not found in current Bulk Snapshot</div>';card.dataset.completeOddsVersion=VERSION;bind(card)}catch(e){if(card.isConnected)card.innerHTML=`<div class="expand-empty">Complete Odds unavailable · ${esc(e?.message||'DATA_ERROR')}</div>`}finally{delete card.dataset.completeOddsBusy}
}
function scan(root=document){root.querySelectorAll?.('.expand-odds-card').forEach(card=>{if(!card.querySelector('.expand-loading'))hydrate(card)})}
function init(){const board=$('[data-board-sections]');if(!board)return;new MutationObserver(()=>scan(board)).observe(board,{childList:true,subtree:true});scan(board);window.NOMAD343_COMPLETE_ODDS={version:VERSION,reload:()=>{boardCache={at:0,data:null,promise:null};document.querySelectorAll('.expand-odds-card').forEach(c=>{delete c.dataset.completeOddsVersion;hydrate(c)})}}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
