/* BALL46 compact outlook: shared fixture snapshot only. */
(()=>{'use strict';
/* Same market-implied probability calculation as current monitor. */
function probabilities(f,now=Date.now()){
 if(!f||!['live','inplay','in_play','halftime','ht'].includes(String(f.boardState||f.status).toLowerCase())||f.providerOddsHeld)return null;
 const t=f.providerOddsFreshAt??f.providerOddsUpdatedAt,at=typeof t==='number'?t:Date.parse(t);
 if(!Number.isFinite(at)||now-at>120000||at-now>10000)return null;
 const o=f.providerOdds?.odds?.['1x2']?.inplay;if(!o)return null;
 const prices=[o.home,o.draw,o.away];if(!prices.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>1))return null;
 const inverse=prices.map(x=>1/x),total=inverse.reduce((a,b)=>a+b,0);if(!(total>.5&&total<1.6))return null;
 const values=inverse.map(x=>x/total*100),whole=values.map(Math.floor);let left=100-whole.reduce((a,b)=>a+b,0);const ranks=values.map((x,i)=>({i,r:x-whole[i]})).sort((a,b)=>b.r-a.r);for(let i=0;i<left;i++)whole[ranks[i].i]++;
 return{values,whole,at};
}
class OutlookCache {
 constructor(storage=null){this.storage=storage;this.rows=new Map();try{const data=JSON.parse(storage?.getItem('b46-monitor-mini-v1')||'null');if(data?.version===1)for(const row of data.rows||[])if(typeof row.id==='string'&&Number.isFinite(row.at)&&row.values?.length===3&&row.values.every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&Math.abs(row.values.reduce((a,b)=>a+b,0)-100)<.001&&row.whole?.length===3&&row.whole.every(v=>Number.isInteger(v)&&v>=0&&v<=100)&&row.whole.reduce((a,b)=>a+b,0)===100)this.rows.set(row.id,Object.freeze(row));}catch{}}
 save(){try{this.storage?.setItem('b46-monitor-mini-v1',JSON.stringify({version:1,rows:[...this.rows.values()]}))}catch{}}
 resolve(id,fixture,now=Date.now()){
  id=String(id||'');if(!id)return{state:'awaiting',model:null};
  const same=fixture&&String(fixture.fixtureId)===id;
  const candidate=same?probabilities(fixture,now):null;
  let saved=this.rows.get(id)||null;
  if(candidate&&(!saved||candidate.at>saved.at)){
   saved=Object.freeze({id,at:candidate.at,values:[...candidate.values],whole:[...candidate.whole]});this.rows.set(id,saved);this.save();
  }
  const finished=same&&['finished','ft','ended','cancelled','canceled','abandoned','postponed','suspended'].includes(String(fixture.boardState||fixture.status).toLowerCase());
  const current=!!(saved&&candidate&&candidate.at===saved.at&&JSON.stringify(candidate.whole)===JSON.stringify(saved.whole));
  return{state:finished?'ended':current?'live':saved?'saved':'awaiting',model:saved};
 }
}

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderCard(node,result,{home='Home',away='Away',now=Date.now()}={}){
 const {model,state}=result;node.className='mini-monitor';node.dataset.state=state;node.setAttribute('aria-label','Live Match Monitor');
 const age=model?Math.max(0,Math.floor((now-model.at)/1000)):0;
 const ago=age<60?age+'s ago':age<3600?Math.floor(age/60)+'m ago':Math.floor(age/3600)+'h ago';
 const time=model?new Date(model.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
 const badge={live:'LIVE ODDS',saved:'LAST UPDATE',awaiting:'AWAITING DATA',ended:'MATCH ENDED'}[state];
 const note=state==='saved'?'Showing last valid outlook · waiting for new prices.':state==='ended'?(model?'Last market outlook · match no longer live.':'No saved outlook for this match.'):state==='live'?'Updated from the latest valid live 1X2 prices.':'Waiting for the first valid live 1X2 prices.';
 node.innerHTML=`<div class="mini-heading"><span class="mini-eyebrow">LIVE MATCH MONITOR</span><span class="mini-badge"><i aria-hidden="true"></i>${badge}</span></div><h2>Match outlook</h2><p class="mini-teams" title="${escape(home+' · '+away)}">${escape(home)} · ${escape(away)}</p><div class="mini-rings">${['HOME','DRAW','AWAY'].map((s,i)=>`<div class="mini-outcome" role="img" aria-label="${s} ${model?model.whole[i]+' percent':'probability unavailable'}"><span class="mini-label">${s}</span><div class="mini-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="mini-track" cx="40" cy="40" r="33"/>${!model&&state==='awaiting'?'<g class="mini-scan"><circle class="mini-scan-beam" cx="40" cy="40" r="33" pathLength="100" stroke-dasharray="20 80"/></g>':''}<circle class="mini-arc" cx="40" cy="40" r="33" pathLength="100" stroke-dasharray="${model?model.values[i]:0} ${model?100-model.values[i]:100}" ${model?'':'style="display:none"'}/></svg><span class="mini-percent">${model?model.whole[i]+'<small>%</small>':'—'}</span></div></div>`).join('')}</div><div class="mini-updated"><span>UPDATED <span class="mini-time">${time}</span></span><span>${model?ago:'No estimate yet'}</span></div><p class="mini-note">${note}</p><p class="mini-method">Market-implied · margin adjusted · estimates only.</p>`;
}

/* BALL46 monitor: consumes existing validated Board data; no network requests. */
(()=>{'use strict';let card=null,queued=false;let storage;try{storage=sessionStorage}catch{}const cache=new OutlookCache(storage);
function render(){queued=false;const prediction=document.querySelector('[data-prediction-card]');if(!prediction)return;if(!card){card=document.createElement('section');card.className='mini-monitor b46-match-monitor b46-match-monitor-mini'}if(prediction.previousElementSibling!==card)prediction.before(card);const id=String(prediction.dataset.fixtureId||''),fixture=window.NOMAD343_DASHBOARD_V2?.getFixture?.(id),host=document.querySelector('.right-rail [data-featured]');const home=fixture?.home?.name||host?.querySelector('[data-featured-home]')?.textContent||'Home',away=fixture?.away?.name||host?.querySelector('[data-featured-away]')?.textContent||'Away',result=cache.resolve(id,fixture);const age=result.model?Math.floor(Math.max(0,Date.now()-result.model.at)/5000):0,signature=JSON.stringify([id,home,away,result.state,result.model?.at,result.model?.whole,age]);if(card.dataset.signature===signature)return;card.dataset.signature=signature;renderCard(card,result,{home,away});card.classList.add('b46-match-monitor','b46-match-monitor-mini')}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render)}}new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.b46-match-monitor-mini')))schedule()}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-fixture-id','aria-hidden']});window.addEventListener('ball46:monitor-snapshot',schedule);window.addEventListener('ball46:board-first-paint',schedule);document.addEventListener('nomad343:fixture-ready',schedule);addEventListener('resize',schedule);setInterval(()=>{if(!document.hidden)schedule()},5000);schedule();
})();

})();