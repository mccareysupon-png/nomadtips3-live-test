(()=>{
'use strict';
const VERSION='343-expanded-odds-complete-v3-single-owner';
const CANON=[
  ['bet365','Bet365'],['pinnacle','Pinnacle'],['williamhill','William Hill'],['ladbrokes','Ladbrokes'],['vcbet','VCBet'],
  ['1xbet','1xBet'],['bwin','Bwin'],['easybets','Easybets'],['interwetten','Interwetten'],['betfair','Betfair'],
  ['snai','SNAI'],['macauslot','Macau Slot'],['betsson','Betsson'],['betathome','Bet-at-home'],['18bet','18Bet'],
  ['10bet','10BET'],['12bet','12Bet'],['coral','Coral'],['crown','Crown']
];
const MARKET_DEFS=[
  {key:'1x2_half',label:'1X2 · 1H',rank:1,aliases:['1x2half','half1x2','1h1x2']},
  {key:'asian_handicap_half',label:'Asian Handicap · 1H',rank:2,aliases:['asianhandicaphalf','asianhalf','halfasianhandicap','1hasianhandicap']},
  {key:'goal_line_half',label:'Goal O/U · 1H',rank:3,aliases:['goallinehalf','halfgoalline','1hgoalline']},
  {key:'corner_line_half',label:'Corner O/U · 1H',rank:4,aliases:['cornerlinehalf','cornerhalf','halfcornerline','1hcornerline']},
  {key:'corner_asian_half',label:'Corner AH · 1H',rank:5,aliases:['cornerasianhalf','halfcornerasian','1hcornerasian']},
  {key:'1x2',label:'1X2',rank:10,aliases:['1x2']},
  {key:'asian_handicap',label:'Asian Handicap',rank:11,aliases:['asianhandicap','asian']},
  {key:'goal_line',label:'Goal O/U',rank:12,aliases:['goalline','goal']},
  {key:'corner_asian',label:'Corner AH',rank:13,aliases:['cornerasian']},
  {key:'corner_line',label:'Corner O/U',rank:14,aliases:['cornerline','corner']},
  {key:'card_asian',label:'Cards AH',rank:15,aliases:['cardasian','cardsasian']},
  {key:'card_line',label:'Cards O/U',rank:16,aliases:['cardline','cardsline','cards']},
  {key:'btts',label:'BTTS',rank:17,aliases:['btts','bothteamstoscore']}
];
const MARKET_ALIAS=new Map();for(const d of MARKET_DEFS)for(const a of d.aliases)MARKET_ALIAS.set(a,d);
const META_KEYS=new Set(['id','name','slug','key','market','marketname','bookmaker','bookmakerid','source','provider','updatedat','createdat','timestamp','status','active','meta','metadata','fixtureid']);
const CONTAINER_KEYS=new Set(['data','odds','markets','market','prices','price','bookmakers','values','value']);
const htmlCache=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const pretty=v=>String(v||'Market').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const structured=v=>plain(v)||Array.isArray(v);
function fixtureId(f){return String(f?.fixtureId??f?.id??'')}
function canonicalBook(raw){const n=norm(raw);if(!n)return'unknown';for(const [slug] of CANON){if(n===slug||n.includes(slug)||slug.includes(n))return slug}return n}
function bookLabel(slug,fallback){return CANON.find(([s])=>s===slug)?.[1]||String(fallback||slug||'Bookmaker')}
function rowBookName(row,key=''){return String((row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??key)||'Bookmaker')}
function rowBookSlug(row,key=''){return canonicalBook(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??key)}
function bookRoot(row){return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row?.data??row}
function mergeRich(a,b){
  if(a===null||a===undefined)return b;if(b===null||b===undefined)return a;
  if(Array.isArray(a)&&Array.isArray(b))return [...a,...b];
  if(plain(a)&&plain(b)){const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?mergeRich(out[k],v):v;return out}
  if(plain(a)&&!plain(b))return a;
  if(!plain(a)&&plain(b))return b;
  if(Array.isArray(a)&&!Array.isArray(b))return a;
  if(!Array.isArray(a)&&Array.isArray(b))return b;
  return b;
}
function providerBookMap(f){
  const root=f?.providerOdds,map=new Map();
  const push=(name,slug,data)=>{if(!structured(data))return;const s=canonicalBook(slug||name);if(s==='unknown')return;const prev=map.get(s);map.set(s,{slug:s,name:bookLabel(s,name),root:prev?mergeRich(prev.root,data):data,found:true})};
  const ingest=container=>{
    if(Array.isArray(container)){container.forEach((row,i)=>{if(plain(row))push(rowBookName(row,`Book ${i+1}`),rowBookSlug(row,`book${i+1}`),bookRoot(row))});return}
    if(!plain(container))return;
    if(container.name||container.slug||container.bookmaker){push(rowBookName(container),rowBookSlug(container),bookRoot(container));return}
    for(const [key,row] of Object.entries(container)){if(structured(row))push(rowBookName(row,key),rowBookSlug(row,key),bookRoot(row))}
  };
  if(plain(root)){
    [root.bookmakers,root?.data?.bookmakers,root?.odds?.bookmakers,root?.data?.odds?.bookmakers,root?.markets?.bookmakers,root?.data?.markets?.bookmakers].forEach(ingest);
    for(const [slug,name] of CANON){for(const host of [root,root.data,root.odds,root.markets,root?.data?.odds,root?.data?.markets])if(structured(host?.[slug]))push(name,slug,bookRoot(host[slug]))}
    if(structured(root.odds))push('Bet365','bet365',root.odds);
    if(structured(root.markets))push('Bet365','bet365',root.markets);
    if(structured(root.bet365))push('Bet365','bet365',bookRoot(root.bet365));
  }
  if(structured(f?.fullOdds))push('Bet365','bet365',f.fullOdds);
  return map;
}
function orderedBooks(f){const found=providerBookMap(f),out=CANON.map(([slug,name])=>found.get(slug)||{slug,name,root:null,found:false});const extras=[...found.values()].filter(b=>!CANON.some(([s])=>s===b.slug)).sort((a,b)=>a.name.localeCompare(b.name));return out.concat(extras)}
function stageKey(k){const n=norm(k);if(['opening','open'].includes(n))return'OPEN';if(['closing','close','current','latest'].includes(n))return'CLOSE';if(['prematch','pre'].includes(n))return'PRE';if(['inplay','live'].includes(n))return'LIVE';return null}
function isStageObject(v){return plain(v)&&Object.keys(v).some(k=>Boolean(stageKey(k)))}
function isPriceObject(v){if(!plain(v))return false;const ks=Object.keys(v).map(norm);return ks.some(k=>['home','homeodds','homeprice','pricehome','draw','drawodds','drawprice','pricedraw','away','awayodds','awayprice','priceaway','over','overodds','overprice','priceover','under','underodds','underprice','priceunder','line','hdp','handicap','total','yes','no'].includes(k))}
function marketMeta(path){
  const raw=String(path||'market'),parts=raw.split('.').filter(p=>p&&!/^\d+$/.test(p)&&!CONTAINER_KEYS.has(String(p).toLowerCase()));
  for(let i=parts.length-1;i>=0;i--){const d=MARKET_ALIAS.get(norm(parts[i]));if(d)return{key:d.key,label:d.label,rank:d.rank}}
  const label=pretty(parts.slice(-2).join(' · ')||raw);return{key:`other:${norm(label)||norm(raw)}`,label,rank:100};
}
function isKnownMarketPath(path){const parts=String(path).split('.');return parts.some(p=>MARKET_ALIAS.has(norm(p)))}
function addMarket(out,path,value){const m=marketMeta(path),prev=out.get(m.key);out.set(m.key,{...m,rawPath:path,value:prev?mergeRich(prev.value,value):value})}
function collectMarkets(root,prefix='',depth=0,out=new Map()){
  if(root===null||root===undefined||depth>8)return out;
  if(Array.isArray(root)){
    root.forEach((row,i)=>{
      if(!plain(row))return;
      const named=row.market??row.market_name??row.marketName??row.key??row.slug??row.name;
      if(named){const val=row.odds??row.prices??row.values??row.value??row;if(isStageObject(val)||isPriceObject(val)||structured(val)||num(val)!==null)addMarket(out,prefix?`${prefix}.${named}`:String(named),val);else collectMarkets(row,`${prefix}${prefix?'.':''}${i}`,depth+1,out);return}
      collectMarkets(row,`${prefix}${prefix?'.':''}${i}`,depth+1,out);
    });
    return out;
  }
  if(!plain(root))return out;
  const selfName=root.market??root.market_name??root.marketName;
  if(selfName&&(isStageObject(root)||isPriceObject(root))){addMarket(out,prefix?`${prefix}.${selfName}`:String(selfName),root);return out}
  for(const [key,val] of Object.entries(root)){
    const nk=norm(key);if(META_KEYS.has(nk)||key==='bookmakers'||val===null||val===undefined)continue;
    const path=prefix?`${prefix}.${key}`:key;
    if(isKnownMarketPath(path)&&(isStageObject(val)||isPriceObject(val)||!structured(val))){addMarket(out,path,val);continue}
    if(plain(val)&&isStageObject(val)){addMarket(out,path,val);continue}
    if(Array.isArray(val)||plain(val)){collectMarkets(val,path,depth+1,out);continue}
  }
  return out;
}
function stageLookup(market,stage){if(!plain(market))return null;for(const [k,v] of Object.entries(market))if(stageKey(k)===stage&&v!==null&&v!==undefined&&v!=='')return v;return null}
function stageValue(market,stage){if(market===null||market===undefined)return null;if(stage==='NOW')return isStageObject(market)?null:market;if(!plain(market))return null;return stageLookup(market,stage)}
function stagesFor(bookMaps,key){const stages=['OPEN','CLOSE','LIVE'];let hasPre=false,hasNow=false;for(const map of bookMaps){const m=map.get(key)?.value;if(m===null||m===undefined)continue;if(stageValue(m,'PRE')!==null)hasPre=true;if(stageValue(m,'NOW')!==null)hasNow=true}if(hasPre)stages.splice(2,0,'PRE');if(hasNow)stages.push('NOW');return stages}
function flattenValues(v,prefix='',depth=0,out=[]){
  if(depth>5||v===null||v===undefined)return out;
  if(Array.isArray(v)){v.forEach((x,i)=>flattenValues(x,`${prefix}${prefix?'.':''}${i}`,depth+1,out));return out}
  if(!plain(v)){const n=num(v);if(n!==null||typeof v==='string')out.push({path:prefix||'value',norm:norm(prefix.split('.').pop()||'value'),value:v});return out}
  for(const [k,x] of Object.entries(v)){const nk=norm(k);if(META_KEYS.has(nk)||/(^|\.)(timestamp|updated|created|time|id)$/i.test(prefix?`${prefix}.${k}`:k))continue;flattenValues(x,prefix?`${prefix}.${k}`:k,depth+1,out)}return out;
}
function fmt(v,odds=false){const n=num(v);if(n===null)return String(v??'—');if(odds)return n.toFixed(2);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function scalarHtml(v){return `<div class="complete-odd-values"><span><i>LINE</i><b>${esc(fmt(v,false))}</b></span></div>`}
function priceHtml(v){
  if(v===null||v===undefined||v==='')return'<span class="complete-odds-empty">—</span>';
  if(!structured(v))return scalarHtml(v);
  const leaves=flattenValues(v),used=new Set(),parts=[];
  const take=(label,aliases,odds=false)=>{const i=leaves.findIndex((x,j)=>!used.has(j)&&aliases.includes(x.norm));if(i<0)return;used.add(i);parts.push(`<span><i>${esc(label)}</i><b>${esc(fmt(leaves[i].value,odds))}</b></span>`)};
  take('L',['line','hdp','handicap','total']);
  take('H',['home','homeodds','homeprice','pricehome'],true);take('D',['draw','drawodds','drawprice','pricedraw'],true);take('A',['away','awayodds','awayprice','priceaway'],true);
  take('O',['over','overodds','overprice','priceover'],true);take('U',['under','underodds','underprice','priceunder'],true);take('YES',['yes'],true);take('NO',['no'],true);
  leaves.forEach((x,i)=>{if(used.has(i))return;parts.push(`<span><i>${esc(pretty(x.path.split('.').slice(-2).join(' ')))}</i><b>${esc(fmt(x.value,false))}</b></span>`)});
  return parts.length?`<div class="complete-odd-values">${parts.join('')}</div>`:'<span class="complete-odds-empty">—</span>';
}
function inspectFixture(f){const books=orderedBooks(f),maps=books.map(b=>b.root?collectMarkets(b.root):new Map());return{books,maps,found:books.filter(b=>b.found).map(b=>b.slug),markets:[...new Set(maps.flatMap(m=>[...m.keys()]))]}}
function render(f){
  const {books,maps,found,markets:seenMarkets}=inspectFixture(f),metaMap=new Map(MARKET_DEFS.map(d=>[d.key,{key:d.key,label:d.label,rank:d.rank,value:null}]));
  maps.forEach(m=>m.forEach((v,k)=>{const prev=metaMap.get(k);metaMap.set(k,prev?{...prev,...v,label:prev.label||v.label,rank:Math.min(prev.rank??100,v.rank??100)}:v)}));
  const markets=[...metaMap.values()].sort((a,b)=>a.rank-b.rank||a.label.localeCompare(b.label));
  const tabs=books.map((b,i)=>`<button type="button" class="complete-book-tab${i===0?' active':''}" data-complete-book-tab="${i}">${esc(b.name)}</button>`).join('');
  const head=books.map((b,i)=>`<th data-complete-book-col="${i}" class="${i===0?'active-book-col ':''}${b.found?'':'book-missing'}">${esc(b.name)}${b.found?'':' · —'}</th>`).join('');
  const rows=markets.map(m=>{const stages=stagesFor(maps,m.key);return stages.map((stage,si)=>`<tr>${si===0?`<th class="complete-market-name" rowspan="${stages.length}">${esc(m.label)}</th>`:''}<th class="complete-stage-name ${stage.toLowerCase()}">${esc(stage)}</th>${books.map((b,bi)=>{const val=stageValue(maps[bi].get(m.key)?.value,stage);return `<td data-complete-book-col="${bi}" class="complete-odds-cell ${bi===0?'active-book-col':''}">${priceHtml(val)}</td>`}).join('')}</tr>`).join('')}).join('');
  return `<div class="expand-card-head"><div><span>ODDS BOARD</span><b>${books.length} bookmaker columns · ${markets.length} market lines</b></div><small>Bulk Snapshot · one renderer · ${found.length} bookmakers with data · ${seenMarkets.length} markets observed</small></div><div class="complete-book-tabs">${tabs}</div><div class="complete-odds-wrap"><table class="complete-odds-table"><thead><tr><th>Market</th><th>Stage</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function bind(card){card.querySelectorAll('[data-complete-book-tab]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const i=btn.dataset.completeBookTab;card.querySelectorAll('[data-complete-book-tab]').forEach(x=>x.classList.toggle('active',x===btn));card.querySelectorAll('[data-complete-book-col]').forEach(x=>x.classList.toggle('active-book-col',x.dataset.completeBookCol===i))}))}
function renderInto(card,fixture){if(!card||!fixture||!card.isConnected)return;const id=fixtureId(fixture),html=render(fixture);card.innerHTML=html;card.dataset.completeOddsVersion=VERSION;bind(card);if(id)htmlCache.set(id,html)}
function restoreCached(shell){const id=String(shell?.dataset.expandedMatch||''),card=shell?.querySelector('.expand-odds-card');if(!id||!card)return false;const html=htmlCache.get(id);if(!html)return false;card.innerHTML=html;card.dataset.completeOddsVersion=`${VERSION}-cache`;bind(card);return true}
function scan(root=document){root.querySelectorAll?.('.match-expanded[data-expanded-match]').forEach(shell=>{const card=shell.querySelector('.expand-odds-card');if(!card)return;if(shell._nomadFixture){renderInto(card,shell._nomadFixture);return}if(card.querySelector('.expand-loading'))restoreCached(shell)})}
function init(){
  const board=document.querySelector('[data-board-sections]');if(!board)return;
  document.addEventListener('nomad343:fixture-ready',e=>{const shell=e.target?.closest?.('.match-expanded')||e.target;if(!shell?.matches?.('.match-expanded'))return;const fixture=e.detail?.fixture||shell._nomadFixture,card=shell.querySelector('.expand-odds-card');if(card&&fixture)renderInto(card,fixture)});
  new MutationObserver(()=>scan(board)).observe(board,{childList:true,subtree:true});scan(board);
  window.NOMAD343_COMPLETE_ODDS={version:VERSION,render,inspectFixture,reload:()=>{document.querySelectorAll('.match-expanded').forEach(shell=>{const fixture=shell._nomadFixture||window.NOMAD343_EXPANDED_MATCH?.getFixture?.(shell.dataset.expandedMatch),card=shell.querySelector('.expand-odds-card');if(card&&fixture)renderInto(card,fixture)})}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();