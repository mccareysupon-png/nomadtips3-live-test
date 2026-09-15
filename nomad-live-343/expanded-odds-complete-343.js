(()=>{
'use strict';
const VERSION='343-expanded-odds-complete-v2-all-markets';
const BOARD_API='/api/engine/board';
const CACHE_MS=15_000;
const CANON=[
  ['bet365','Bet365'],['pinnacle','Pinnacle'],['crown','Crown'],['1xbet','1xBet'],['12bet','12Bet'],
  ['interwetten','Interwetten'],['macauslot','Macau Slot'],['18bet','18Bet'],['vcbet','VCBet'],['easybets','Easybets']
];
const MARKET_DEFS=[
  {key:'1x2_half',label:'1X2 · 1H',rank:1,tests:[/1x2half/,/half1x2/,/1h1x2/]},
  {key:'asian_handicap_half',label:'Asian Handicap · 1H',rank:2,tests:[/asianhandicaphalf/,/asianhalf/,/halfasianhandicap/,/1hasianhandicap/]},
  {key:'goal_line_half',label:'Goal O/U · 1H',rank:3,tests:[/goallinehalf/,/hal fgoalline/.source?/$^/:/$^/,/halfgoalline/,/1hgoalline/]},
  {key:'corner_line_half',label:'Corner O/U · 1H',rank:4,tests:[/cornerlinehalf/,/cornerhalf/,/halfcornerline/,/1hcornerline/]},
  {key:'corner_asian_half',label:'Corner AH · 1H',rank:5,tests:[/cornerasianhalf/,/halfcornerasian/,/1hcornerasian/]},
  {key:'1x2',label:'1X2',rank:10,tests:[/(^|[^a-z0-9])1x2([^a-z0-9]|$)/,/1x2/]},
  {key:'asian_handicap',label:'Asian Handicap',rank:11,tests:[/asianhandicap/,/(^|[^a-z])asian([^a-z]|$)/]},
  {key:'goal_line',label:'Goal O/U',rank:12,tests:[/goalline/]},
  {key:'corner_asian',label:'Corner AH',rank:13,tests:[/cornerasian/]},
  {key:'corner_line',label:'Corner O/U',rank:14,tests:[/cornerline/,/(^|[^a-z])corner([^a-z]|$)/]},
  {key:'card_asian',label:'Cards AH',rank:15,tests:[/cardasian/,/cardsasian/]},
  {key:'card_line',label:'Cards O/U',rank:16,tests:[/cardline/,/cardsline/,/(^|[^a-z])cards([^a-z]|$)/]},
  {key:'btts',label:'BTTS',rank:17,tests:[/btts/,/bothteamstoscore/]}
];
const META_KEYS=new Set(['id','name','slug','key','market','marketname','market_name','bookmaker','bookmakerid','bookmaker_id','source','provider','updatedat','updated_at','createdat','created_at','timestamp','status','active','meta','metadata']);
const CONTAINER_KEYS=new Set(['data','odds','markets','market','prices','price','bookmakers']);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const pretty=v=>String(v||'Market').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const structured=v=>plain(v)||Array.isArray(v);
let boardCache={at:0,data:null,promise:null};

async function fetchJson(url){const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP_${r.status}`);return j}
async function getBoard(){const now=Date.now();if(boardCache.data&&now-boardCache.at<CACHE_MS)return boardCache.data;if(boardCache.promise)return boardCache.promise;boardCache.promise=fetchJson(BOARD_API).then(j=>{boardCache={at:Date.now(),data:j,promise:null};return j}).catch(e=>{boardCache.promise=null;throw e});return boardCache.promise}
function canonicalBook(raw){const n=norm(raw);if(!n)return'unknown';for(const [slug] of CANON){if(n===slug||n.includes(slug)||slug.includes(n))return slug}return n}
function bookLabel(slug,fallback){return CANON.find(([s])=>s===slug)?.[1]||String(fallback||slug||'Bookmaker')}
function rowBookName(row,key=''){return String((row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??key)||'Bookmaker')}
function rowBookSlug(row,key=''){return canonicalBook(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??key)}
function bookRoot(row){return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row?.data??row}
function mergeObj(a,b){if(a===null||a===undefined)return b;if(b===null||b===undefined)return a;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(b)&&b.length?b:a;if(!plain(a)||!plain(b))return b;const out={...a};for(const [k,v] of Object.entries(b)){out[k]=plain(out[k])&&plain(v)?mergeObj(out[k],v):(v??out[k])}return out}
function providerBookMap(f){
  const root=f?.providerOdds,map=new Map();if(!plain(root))return map;
  const push=(name,slug,data)=>{if(!structured(data))return;const s=canonicalBook(slug||name);if(s==='unknown')return;const prev=map.get(s);map.set(s,{slug:s,name:bookLabel(s,name),root:prev?mergeObj(prev.root,data):data,found:true})};
  const ingest=container=>{
    if(Array.isArray(container)){container.forEach((row,i)=>{if(plain(row))push(rowBookName(row,`Book ${i+1}`),rowBookSlug(row,`book${i+1}`),bookRoot(row))});return}
    if(!plain(container))return;
    if(container.name||container.slug||container.bookmaker){push(rowBookName(container),rowBookSlug(container),bookRoot(container));return}
    for(const [key,row] of Object.entries(container)){if(plain(row))push(rowBookName(row,key),rowBookSlug(row,key),bookRoot(row))}
  };
  [root.bookmakers,root?.data?.bookmakers,root?.odds?.bookmakers,root?.data?.odds?.bookmakers,root?.markets?.bookmakers,root?.data?.markets?.bookmakers].forEach(ingest);
  for(const [slug,name] of CANON){for(const host of [root,root.data,root.odds,root.markets,root?.data?.odds,root?.data?.markets]){if(structured(host?.[slug]))push(name,slug,bookRoot(host[slug]))}}
  if(structured(root.bet365))push('Bet365','bet365',bookRoot(root.bet365));
  if(structured(root.odds))push('Bet365','bet365',root.odds);
  if(structured(root.markets))push('Bet365','bet365',root.markets);
  return map;
}
function orderedBooks(f){const found=providerBookMap(f),out=CANON.map(([slug,name])=>found.get(slug)||{slug,name,root:null,found:false});const extras=[...found.values()].filter(b=>!CANON.some(([s])=>s===b.slug)).sort((a,b)=>a.name.localeCompare(b.name));return out.concat(extras)}
function stageKey(k){const n=norm(k);if(['opening','open'].includes(n))return'OPEN';if(['closing','close'].includes(n))return'CLOSE';if(['prematch','pre'].includes(n))return'PRE';if(['inplay','live'].includes(n))return'LIVE';return null}
function isStageObject(v){return plain(v)&&Object.keys(v).some(k=>Boolean(stageKey(k)))}
function isPriceObject(v){if(!plain(v))return false;const ks=Object.keys(v).map(norm);return ks.some(k=>['home','homeodds','homeprice','draw','drawodds','drawprice','away','awayodds','awayprice','over','overodds','overprice','under','underodds','underprice','line','hdp','handicap','total','yes','no'].includes(k))}
function marketMeta(path){const raw=String(path||'market'),n=norm(raw);for(const d of MARKET_DEFS){if(d.tests.some(re=>re.test(n)))return{key:d.key,label:d.label,rank:d.rank}}const parts=raw.split('.').filter(p=>!CONTAINER_KEYS.has(String(p).toLowerCase()));const label=pretty(parts.slice(-2).join(' · ')||raw);return{key:`other:${norm(label)||n}`,label,rank:100}}
function knownMarketKey(key){const n=norm(key);return MARKET_DEFS.some(d=>d.tests.some(re=>re.test(n)))}
function addMarket(out,path,value){const m=marketMeta(path),prev=out.get(m.key);out.set(m.key,{...m,rawPath:path,value:prev?mergeObj(prev.value,value):value})}
function collectMarkets(root,prefix='',depth=0,out=new Map()){
  if(root===null||root===undefined||depth>7)return out;
  if(Array.isArray(root)){
    root.forEach((row,i)=>{
      if(!plain(row))return;
      const named=row.market??row.market_name??row.marketName??row.key??row.slug??row.name;
      if(named&&(isStageObject(row)||isPriceObject(row)||row.odds!==undefined||row.prices!==undefined)){addMarket(out,prefix?`${prefix}.${named}`:String(named),row.odds??row.prices??row);return}
      collectMarkets(row,`${prefix}${prefix?'.':''}${i}`,depth+1,out);
    });
    return out;
  }
  if(!plain(root))return out;
  const selfName=root.market??root.market_name??root.marketName;
  if(selfName&&(isStageObject(root)||isPriceObject(root))){addMarket(out,prefix?`${prefix}.${selfName}`:String(selfName),root);return out}
  for(const [key,val] of Object.entries(root)){
    const nk=norm(key);if(META_KEYS.has(String(key).toLowerCase())||META_KEYS.has(nk)||key==='bookmakers'||val===null||val===undefined)continue;
    const path=prefix?`${prefix}.${key}`:key;
    if(plain(val)&&(isStageObject(val)||isPriceObject(val))){addMarket(out,path,val);continue}
    if(Array.isArray(val)){collectMarkets(val,path,depth+1,out);continue}
    if(plain(val)){collectMarkets(val,path,depth+1,out);continue}
    if(knownMarketKey(path)&&(num(val)!==null||typeof val==='string'))addMarket(out,path,val);
  }
  return out;
}
function stageLookup(market,stage){if(!plain(market))return null;for(const [k,v] of Object.entries(market)){if(stageKey(k)===stage&&v!==null&&v!==undefined&&v!=='')return v}return null}
function stageValue(market,stage){if(market===null||market===undefined)return null;if(stage==='NOW')return isStageObject(market)?null:market;if(!plain(market))return null;return stageLookup(market,stage)}
function stagesFor(bookMaps,key){const stages=['OPEN','CLOSE','LIVE'];let hasPre=false,hasNow=false;for(const map of bookMaps){const m=map.get(key)?.value;if(m===null||m===undefined)continue;if(stageValue(m,'PRE')!==null)hasPre=true;if(stageValue(m,'NOW')!==null)hasNow=true}if(hasPre)stages.splice(2,0,'PRE');if(hasNow)stages.push('NOW');return stages}
function flattenValues(v,prefix='',depth=0,out=[]){if(depth>4||v===null||v===undefined)return out;if(Array.isArray(v)){v.forEach((x,i)=>flattenValues(x,`${prefix}${prefix?'.':''}${i}`,depth+1,out));return out}if(!plain(v)){const n=num(v);if(n!==null||typeof v==='string')out.push({path:prefix||'value',norm:norm(prefix.split('.').pop()||'value'),value:v,numeric:n});return out}for(const [k,x] of Object.entries(v)){const path=prefix?`${prefix}.${k}`:k;if(/(^|\.)(id|timestamp|updated|created|time)$/i.test(path))continue;flattenValues(x,path,depth+1,out)}return out}
function fmt(v,odds=false){const n=num(v);if(n===null)return String(v??'—');if(odds)return n.toFixed(2);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function scalarHtml(v){const n=num(v);const text=n!==null?fmt(n,false):String(v??'—');return `<div class="complete-odd-values"><span><i>LINE</i><b>${esc(text)}</b></span></div>`}
function priceHtml(v){
  if(v===null||v===undefined||v==='')return'<span class="complete-odds-empty">—</span>';
  if(!structured(v))return scalarHtml(v);
  const leaves=flattenValues(v),used=new Set(),parts=[];
  const take=(label,aliases,odds=false)=>{const i=leaves.findIndex((x,j)=>!used.has(j)&&aliases.includes(x.norm));if(i<0)return;used.add(i);parts.push(`<span><i>${esc(label)}</i><b>${esc(fmt(leaves[i].value,odds))}</b></span>`)};
  take('L',['line','hdp','handicap','total']);take('H',['home','homeodds','homeprice'],true);take('D',['draw','drawodds','drawprice'],true);take('A',['away','awayodds','awayprice'],true);take('O',['over','overodds','overprice'],true);take('U',['under','underodds','underprice'],true);take('YES',['yes'],true);take('NO',['no'],true);
  leaves.forEach((x,i)=>{if(used.has(i))return;parts.push(`<span><i>${esc(pretty(x.path.split('.').slice(-2).join(' ')))}</i><b>${esc(fmt(x.value,false))}</b></span>`)});
  return parts.length?`<div class="complete-odd-values">${parts.join('')}</div>`:'<span class="complete-odds-empty">—</span>';
}
function render(f){
  const books=orderedBooks(f),maps=books.map(b=>b.root?collectMarkets(b.root):new Map()),metaMap=new Map(MARKET_DEFS.map(d=>[d.key,{key:d.key,label:d.label,rank:d.rank,value:null}]));
  maps.forEach(m=>m.forEach((v,k)=>{const prev=metaMap.get(k);metaMap.set(k,prev?{...prev,...v,label:prev.label||v.label,rank:Math.min(prev.rank??100,v.rank??100)}:v)}));
  const markets=[...metaMap.values()].sort((a,b)=>a.rank-b.rank||a.label.localeCompare(b.label));
  const foundCount=books.filter(b=>b.found).length;
  const tabs=books.map((b,i)=>`<button type="button" class="complete-book-tab${i===0?' active':''}" data-complete-book-tab="${i}">${esc(b.name)}</button>`).join('');
  const head=books.map((b,i)=>`<th data-complete-book-col="${i}" class="${i===0?'active-book-col ':''}${b.found?'':'book-missing'}">${esc(b.name)}${b.found?'':' · —'}</th>`).join('');
  const rows=markets.map(m=>{const stages=stagesFor(maps,m.key);return stages.map((stage,si)=>`<tr>${si===0?`<th class="complete-market-name" rowspan="${stages.length}">${esc(m.label)}</th>`:''}<th class="complete-stage-name ${stage.toLowerCase()}">${esc(stage)}</th>${books.map((b,bi)=>{const val=stageValue(maps[bi].get(m.key)?.value,stage);return `<td data-complete-book-col="${bi}" class="complete-odds-cell ${bi===0?'active-book-col':''}">${priceHtml(val)}</td>`}).join('')}</tr>`).join('')}).join('');
  return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>${books.length} bookmaker columns · ${markets.length} market lines</b></div><small>OPEN · CLOSE · LIVE · Bulk Snapshot · ${foundCount} bookmakers with data</small></div><div class="complete-book-tabs">${tabs}</div><div class="complete-odds-wrap"><table class="complete-odds-table"><thead><tr><th>Market</th><th>Stage</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bind(card){card.querySelectorAll('[data-complete-book-tab]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const i=btn.dataset.completeBookTab;card.querySelectorAll('[data-complete-book-tab]').forEach(x=>x.classList.toggle('active',x===btn));card.querySelectorAll('[data-complete-book-col]').forEach(x=>x.classList.toggle('active-book-col',x.dataset.completeBookCol===i))}))}
async function hydrate(card){if(!card||card.dataset.completeOddsVersion===VERSION||card.dataset.completeOddsBusy==='1'||card.querySelector('.expand-loading'))return;const shell=card.closest('.match-expanded'),id=String(shell?.dataset.expandedMatch||'');if(!id)return;card.dataset.completeOddsBusy='1';try{const board=await getBoard(),fixture=(Array.isArray(board?.fixtures)?board.fixtures:[]).find(f=>String(f?.fixtureId??f?.id??'')===id);if(!card.isConnected)return;card.innerHTML=fixture?render(fixture):'<div class="expand-empty">Fixture not found in current Bulk Snapshot</div>';card.dataset.completeOddsVersion=VERSION;bind(card)}catch(e){if(card.isConnected)card.innerHTML=`<div class="expand-empty">Complete Odds unavailable · ${esc(e?.message||'DATA_ERROR')}</div>`}finally{delete card.dataset.completeOddsBusy}}
function scan(root=document){root.querySelectorAll?.('.expand-odds-card').forEach(card=>{if(!card.querySelector('.expand-loading'))hydrate(card)})}
function init(){const board=$('[data-board-sections]');if(!board)return;new MutationObserver(()=>scan(board)).observe(board,{childList:true,subtree:true});scan(board);window.NOMAD343_COMPLETE_ODDS={version:VERSION,reload:()=>{boardCache={at:0,data:null,promise:null};document.querySelectorAll('.expand-odds-card').forEach(c=>{delete c.dataset.completeOddsVersion;hydrate(c)})},render}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
