(()=>{
'use strict';

const CACHE_MS=30_000;
const cache=new Map();
let scanQueued=false;

function finite(v){
  if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function norm(v){return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function fmt(v){const n=finite(v);return n===null?'—':n.toFixed(2)}

function marketEndpoint(){
  const host=String(location.hostname||'').toLowerCase();
  const base=host==='www.nomadtips3.com'||host==='nomadtips3.com'?location.origin:'https://www.nomadtips3.com';
  return `${base}/nomad-live-342-market/1x2`;
}

function currentResults(){return Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[]}

function resultForCard(card){
  const teams=card.querySelectorAll('.teams-line strong');
  if(teams.length<2)return null;
  const home=norm(teams[0]?.textContent),away=norm(teams[teams.length-1]?.textContent);
  if(!home||!away)return null;
  return currentResults().find(r=>norm(r?.m?.home)===home&&norm(r?.m?.away)===away)||null;
}

function ensureHost(card){
  const details=card.querySelector('.event-details');
  if(!details)return null;
  let host=details.querySelector(':scope > .nomad-market-1x2');
  if(host)return host;
  host=document.createElement('section');
  host.className='nomad-market-1x2';
  host.setAttribute('aria-label','Live 1X2 odds');
  const graph=details.querySelector(':scope > .attack-chart, :scope > .attack-empty');
  if(graph)graph.insertAdjacentElement('afterend',host);else details.prepend(host);
  return host;
}

function loading(host){
  host.innerHTML='<div class="nomad-market-1x2-head"><span>LIVE 1X2</span><small>BET365 · MARKET DATA</small></div><div class="nomad-market-1x2-state">Loading live 1X2…</div>';
}

function unavailable(host){
  host.innerHTML='<div class="nomad-market-1x2-head"><span>LIVE 1X2</span><small>BET365 · MARKET DATA</small></div><div class="nomad-market-1x2-state">1X2 data unavailable</div>';
}

function ready(host,data){
  host.innerHTML=`<div class="nomad-market-1x2-head"><span>LIVE 1X2</span><small>BET365 · MARKET DATA</small></div><div class="nomad-market-1x2-grid"><div class="nomad-market-1x2-cell nomad-market-1x2-home"><span>1</span><strong>${esc(fmt(data.home))}</strong><small>HOME</small></div><div class="nomad-market-1x2-cell"><span>X</span><strong>${esc(fmt(data.draw))}</strong><small>DRAW</small></div><div class="nomad-market-1x2-cell nomad-market-1x2-away"><span>2</span><strong>${esc(fmt(data.away))}</strong><small>AWAY</small></div></div>`;
}

async function loadMarket(match){
  const id=String(match?.id??'').trim();
  if(!id)return null;
  const now=Date.now(),cached=cache.get(id);
  if(cached&&now-cached.at<CACHE_MS)return cached.promise;
  const url=new URL(marketEndpoint());
  url.searchParams.set('id',id);
  url.searchParams.set('home',String(match?.home??''));
  url.searchParams.set('away',String(match?.away??''));
  const promise=fetch(url.toString(),{method:'GET',cache:'no-store',headers:{accept:'application/json'}})
    .then(async response=>{
      if(!response.ok)return null;
      const data=await response.json();
      if(data?.status!=='READY')return null;
      if([data.home,data.draw,data.away].some(v=>finite(v)===null))return null;
      return data;
    })
    .catch(()=>null);
  cache.set(id,{at:now,promise});
  return promise;
}

async function hydrate(card){
  if(!card.classList.contains('expanded'))return;
  const result=resultForCard(card),match=result?.m;
  if(!match?.id)return;
  const host=ensureHost(card);
  if(!host)return;
  const identity=String(match.id);
  if(host.dataset.matchId===identity&&host.dataset.marketReady==='1')return;
  host.dataset.matchId=identity;
  host.dataset.marketReady='0';
  loading(host);
  const data=await loadMarket(match);
  if(!card.isConnected||!card.classList.contains('expanded'))return;
  if(host.dataset.matchId!==identity)return;
  if(data){ready(host,data);host.dataset.marketReady='1'}else{unavailable(host);host.dataset.marketReady='0'}
}

function scan(){
  scanQueued=false;
  document.querySelectorAll('#matchList > .event-compact.expanded').forEach(card=>hydrate(card));
}
function queueScan(){
  if(scanQueued)return;
  scanQueued=true;
  requestAnimationFrame(scan);
}

function start(){
  const list=document.getElementById('matchList');
  if(!list)return;
  new MutationObserver(queueScan).observe(list,{childList:true});
  list.addEventListener('click',()=>setTimeout(queueScan,0));
  list.addEventListener('keyup',event=>{if(event.key==='Enter'||event.key===' ')setTimeout(queueScan,0)});
  queueScan();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
