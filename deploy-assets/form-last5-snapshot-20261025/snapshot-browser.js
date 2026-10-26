// Attach after window.__B46_LAST5_SNAPSHOT__ is populated alongside board data.
// Clicking View/Hide performs ZERO network requests; no special handling of 5USD on click.
(()=>{
'use strict';
if(window.__B46_LAST5_SNAPSHOT_UI__)return;
window.__B46_LAST5_SNAPSHOT_UI__=true;
const card=document.querySelector('.b46-pv8'),host=card?.querySelector('.form');
if(!host)return;
const button=document.createElement('button'),detail=document.createElement('section');
button.type='button';button.className='last5-button';button.textContent='View Last 5';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','b46-last5-detail');
detail.id='b46-last5-detail';detail.className='last5-detail';detail.hidden=true;detail.setAttribute('aria-label','Verified last five results');
host.append(button,detail);
const el=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
let fixtureId=card.dataset.fixtureId||'',expanded=false;
function available(){
 const snap=window.__B46_LAST5_SNAPSHOT__,data=snap?.schema==='ball46.last5.snapshot.v1'&&snap?.source==='verified-stored-FT'?snap.fixtures?.[fixtureId]:null;
 return !!fixtureId&&!!data&&String(data.fixtureId)===fixtureId&&['home','away'].every(side=>Array.isArray(data[side]?.rows))&&
  (data.home.rows.length+data.away.rows.length)>0;
}
function visibility(){button.hidden=!available();button.disabled=button.hidden;}
function render(){
 const snap=window.__B46_LAST5_SNAPSHOT__,data=snap?.schema==='ball46.last5.snapshot.v1'&&snap?.source==='verified-stored-FT'?snap.fixtures?.[fixtureId]:null;
 detail.replaceChildren();
 if(!data){detail.append(el('p','Verified history has not been preloaded for this match.','last5-status'));return;}
 detail.append(el('p','Verified stored FT · Preloaded snapshot','last5-source'));
 for(const side of ['home','away']){
  const team=data[side],block=document.createElement('section');block.className='last5-team',block.setAttribute('aria-label',side+' last five');
  const header=document.createElement('div');header.className='last5-team-head';header.append(el('strong',side.toUpperCase()),el('span',(team?.rows?.length||0)+'/5 results'));block.append(header);
  for(const r of (team?.rows||[])){
   const row=document.createElement('div');row.className='last5-row';row.dataset.result=r.result;
   const info=document.createElement('div');info.className='last5-info';const opponent=el('strong',r.opponent?.name||'—');info.append(opponent,el('small',new Date(r.kickoffUtc).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})+' · '+r.venue+' · FT'));
   row.append(el('b',r.result,'last5-result'),info,el('b',r.gf+'–'+r.ga,'last5-score'));block.append(row);
  }
  if(!team?.rows?.length)block.append(el('p','No verified stored FT results.','last5-status'));
  detail.append(block);
 }
 detail.append(el('p','Source: verified local FT history. No 5USD request on expansion.','last5-footnote'));
}
function close(){expanded=false;detail.hidden=true;detail.replaceChildren();button.textContent='View Last 5';button.setAttribute('aria-expanded','false');}
button.addEventListener('click',()=>{if(expanded){close();return;}if(!available()){close();visibility();return;}expanded=true;button.textContent='Hide';button.setAttribute('aria-expanded','true');detail.hidden=false;render();});
new MutationObserver(()=>{const next=card.dataset.fixtureId||'';if(next!==fixtureId){fixtureId=next;close();visibility();}}).observe(card,{attributes:true,attributeFilter:['data-fixture-id']});
visibility();
})();
