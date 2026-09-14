(()=>{
'use strict';
const VERSION='343-full-odds-10book-stable-v1';
const API='/api/full-market/fixture-odds';
const CLIENT_CACHE_MS=120_000;
const cache=new Map();
const inflight=new Map();
let baseRender=null;
const now=()=>Date.now();
const fixtureId=card=>String(card?.dataset?.matchId||'').trim();
function fresh(id){const row=cache.get(id);return row&&now()-row.at<CLIENT_CACHE_MS?row:null}
function enrich(f,row){if(!f||!row)return f;return {...f,providerOdds:row.fullOdds,providerOddsUpdatedAt:row.fetchedAt??row.at}}
function install(){
  const api=window.NOMAD343_FULL_ODDS_BULK;
  if(!api||typeof api.renderCard!=='function'||api.__tenBookInstalled)return false;
  baseRender=api.renderCard.bind(api);
  api.renderCard=(card,f)=>{
    const id=fixtureId(card),row=fresh(id);
    return baseRender(card,row?enrich(f,row):f);
  };
  api.__tenBookInstalled=true;
  api.mode='BULK_PLUS_SHARED_10BOOK_BUNDLE';
  return true;
}
async function load10(card){
  if(!card||card.getAttribute('aria-expanded')!=='true')return;
  const id=fixtureId(card);if(!id)return;
  install();
  const hit=fresh(id);
  if(hit){const f=window.NOMAD343_LIVE?.getFixture?.(id);if(f&&baseRender)baseRender(card,enrich(f,hit));return}
  if(inflight.has(id))return inflight.get(id);
  const p=(async()=>{
    try{
      const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${now()}`,{cache:'no-store'});
      const j=await r.json().catch(()=>null);
      if(!r.ok||j?.ok!==true||!j?.fullOdds)return;
      const row={fullOdds:j.fullOdds,fetchedAt:j.fetchedAt??now(),at:now(),source:j.source??null,availableBookmakers:Array.isArray(j.availableBookmakers)?j.availableBookmakers:[]};
      cache.set(id,row);
      const current=document.querySelector(`.match-card[data-match-id="${CSS.escape(id)}"]`);
      if(current?.getAttribute('aria-expanded')==='true'){
        const f=window.NOMAD343_LIVE?.getFixture?.(id);
        if(f&&baseRender)baseRender(current,enrich(f,row));
      }
    }catch{}
    finally{inflight.delete(id)}
  })();
  inflight.set(id,p);
  return p;
}
function afterUserToggle(target){
  const row=target.closest?.('.match-row.scoreboard-default'),cue=target.closest?.('.expand-cue');
  if(!row&&!cue)return;
  const card=(row||cue).closest('.match-card[data-match-id]');
  queueMicrotask(()=>{if(card?.getAttribute('aria-expanded')==='true')load10(card)});
}
document.addEventListener('click',e=>afterUserToggle(e.target));
document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')afterUserToggle(e.target)});
install();
window.NOMAD343_FULL_ODDS_10BOOK={version:VERSION,load:load10,cacheSize:()=>cache.size,mode:'ONE_10BOOK_BUNDLE_PER_FIXTURE_SHARED_SERVER_CACHE'};
})();
