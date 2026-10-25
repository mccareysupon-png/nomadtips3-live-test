(()=>{'use strict';
const VERSION='341-5usd-referee-price-flow-ui-v1';
const REFRESH_MS=3_000;
const RECENT_CHANGE_MS=15_000;
const cache=new Map();
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const engineBase=()=>window.NOMAD_RUNTIME?.fiveUsdBase||window.NOMAD_RUNTIME?.engineBase||null;
const endpoint=id=>`${engineBase()}/fiveusd-referee-flow?fixtureId=${encodeURIComponent(id)}&_=${Date.now()}`;

function line(v){
  const n=num(v);if(n===null)return 'N/A';
  if(n===0)return '0';
  return `${n>0?'+':''}${Number.isInteger(n)?n:n.toFixed(2).replace(/0$/,'')}`;
}
function odds(v){const n=num(v);return n===null?'N/A':n.toFixed(2);}
function shortTime(ms){
  const n=num(ms);if(n===null)return '—';
  const sec=Math.max(0,Math.round((Date.now()-n)/1000));
  return sec<60?`${sec}s`:sec<3600?`${Math.floor(sec/60)}m`:`${Math.floor(sec/3600)}h`;
}

async function fetchFlow(fixtureId,{force=false}={}){
  const id=String(fixtureId||'').trim(),base=engineBase();
  if(!id)throw new Error('FIXTURE_ID_REQUIRED');
  if(!base)throw new Error('ENGINE_BASE_UNAVAILABLE');
  const at=Date.now(),hit=cache.get(id);
  if(!force&&hit&&at-hit.at<2500)return hit.data;
  const response=await fetch(endpoint(id),{cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok!==true)throw new Error(data?.error||`HTTP_${response.status}`);
  cache.set(id,{at,data});return data;
}

function moveFor(history){
  const rows=Array.isArray(history)?history:[];
  if(rows.length<2)return {label:'—',kind:'flat'};
  const a=rows.at(-2),b=rows.at(-1);
  const la=num(a?.homeAhLine),lb=num(b?.homeAhLine);
  if(la!==null&&lb!==null&&la!==lb)return {label:`LINE ${lb>la?'↗':'↘'}`,kind:lb>la?'up':'down'};
  const ha=num(a?.homeOdds),hb=num(b?.homeOdds);
  if(ha!==null&&hb!==null&&ha!==hb)return {label:`H ${hb>ha?'↑':'↓'}`,kind:hb>ha?'up':'down'};
  const aa=num(a?.awayOdds),ab=num(b?.awayOdds);
  if(aa!==null&&ab!==null&&aa!==ab)return {label:`A ${ab>aa?'↑':'↓'}`,kind:ab>aa?'up':'down'};
  return {label:'—',kind:'flat'};
}

function trail(history){
  const rows=(Array.isArray(history)?history:[]).slice(-4);
  if(!rows.length)return '<span class="nomad-ref-flow-na">รอราคา</span>';
  return rows.map(row=>`<span class="nomad-ref-flow-point"><b>${line(row.homeAhLine)}</b><i>${odds(row.homeOdds)}/${odds(row.awayOdds)}</i></span>`).join('<em>→</em>');
}

function rowHtml(row){
  const current=row?.current||{},history=Array.isArray(row?.history)?row.history:[];
  const move=moveFor(history);
  const changedAt=num(current.lastChangedAt);
  const recent=history.length>1&&changedAt!==null&&Date.now()-changedAt<=RECENT_CHANGE_MS;
  const ready=current.ready===true;
  return `<div class="nomad-ref-flow-row${recent?' is-changing':''}${ready?'':' is-na'}" data-source="${String(row?.sourceId||'')}">
    <div class="nomad-ref-flow-book"><span>${String(row?.bookmaker||'BOOK')}</span><small>#${Number(row?.position)||'—'}</small></div>
    <div class="nomad-ref-flow-line">${ready?line(current.homeAhLine):'N/A'}</div>
    <div class="nomad-ref-flow-price"><small>H</small>${ready?odds(current.homeOdds):'N/A'}</div>
    <div class="nomad-ref-flow-price"><small>A</small>${ready?odds(current.awayOdds):'N/A'}</div>
    <div class="nomad-ref-flow-move ${move.kind}">${move.label}</div>
    <div class="nomad-ref-flow-trail">${trail(history)}</div>
    <div class="nomad-ref-flow-age">${ready?shortTime(current.observedAt):'—'}</div>
  </div>`;
}

function render(el,payload){
  const flow=payload?.flow||{},rows=Array.isArray(flow.rows)?flow.rows:[];
  const summary=payload?.summary||{};
  el.innerHTML=`<div class="nomad-ref-flow-head"><div><b>10 BOOK · AH PRICE FLOW</b><small>ราคาไหลของกรรมการแต่ละเจ้า · 5USD storage</small></div><span>${Number(summary.ready)||0}/10 READY</span></div>
  <div class="nomad-ref-flow-labels"><span>BOOK</span><span>AH</span><span>HOME</span><span>AWAY</span><span>MOVE</span><span>PRICE FLOW</span><span>AGE</span></div>
  <div class="nomad-ref-flow-body">${rows.map(rowHtml).join('')}</div>
  <div class="nomad-ref-flow-foot"><span>${Number(summary.changes)||0} price changes captured</span><span>เปลี่ยนจริงค่อยบันทึก · ไม่มีราคา = N/A · ไม่เพิ่ม 5USD request</span></div>`;
}

function placeCard(row,card){
  const detail=row?.querySelector('.match-detail');if(!detail||!card)return;
  const eventFlow=detail.querySelector(':scope > .nomad-event-flow-card[data-event-flow-341]');
  if(eventFlow){if(eventFlow.nextElementSibling!==card)eventFlow.after(card);return;}
  if(card.parentElement!==detail)detail.prepend(card);
}

function cardFor(row){
  if(!row?.matches?.('.match-wrap'))return null;
  const detail=row.querySelector('.match-detail');if(!detail)return null;
  let card=detail.querySelector(':scope > .nomad-referee-price-flow-card[data-referee-flow-341]');
  if(!card){
    card=document.createElement('section');
    card.className='nomad-referee-price-flow-card';
    card.dataset.refereeFlow341='1';
    card.dataset.refereeFlowFixture=String(row.dataset.matchId||'');
    card.innerHTML='<div class="nomad-ref-flow-loading">10 Book AH Price Flow · waiting referee data</div>';
  }
  placeCard(row,card);return card;
}

async function mount(row,{force=false}={}){
  if(!row?.open)return;
  const card=cardFor(row);if(!card)return;
  const id=String(row.dataset.matchId||'').trim();
  if(!id){card.innerHTML='<div class="nomad-ref-flow-loading">10 Book AH Price Flow · FIXTURE_ID_REQUIRED</div>';return;}
  if(card.dataset.refFlowLoading==='1')return;
  card.dataset.refFlowLoading='1';
  try{render(card,await fetchFlow(id,{force}));card.dataset.refFlowReady='1';}
  catch(error){card.innerHTML=`<div class="nomad-ref-flow-head"><div><b>10 BOOK · AH PRICE FLOW</b><small>รอ Candidate / Referee snapshot</small></div><span>WAIT</span></div><div class="nomad-ref-flow-loading">${String(error?.message||'DATA_WAIT')}</div>`;}
  finally{card.dataset.refFlowLoading='0';}
}

function hydrate(root=document,{force=false}={}){
  root.querySelectorAll?.('.match-wrap').forEach(row=>{const card=cardFor(row);if(card)placeCard(row,card);if(row.open)mount(row,{force});});
}
const observer=new MutationObserver(mutations=>{
  let child=false;
  for(const mutation of mutations){
    if(mutation.type==='childList')child=true;
    if(mutation.type==='attributes'&&mutation.attributeName==='open')mount(mutation.target,{force:true});
  }
  if(child)hydrate(document);
});
function start(){
  const list=document.querySelector('.match-list');if(!list)return;
  observer.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  hydrate(list);setInterval(()=>hydrate(list,{force:true}),REFRESH_MS);
}
window.NOMAD_REFEREE_PRICE_FLOW_341={version:VERSION,fetchFlow,hydrate,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
