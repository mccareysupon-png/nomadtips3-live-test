/* BALL46 presentation: existing fixture snapshot only; no requests or votes. */
(()=>{'use strict';let queued=false,card=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
function render(){queued=false;const prediction=document.querySelector('[data-prediction-card]');if(!prediction)return;
 if(!card){card=document.createElement('section');card.className='b46-match-monitor';card.setAttribute('aria-label','Live Match Monitor')}
 if(prediction.previousElementSibling!==card)prediction.before(card);
 const id=prediction.dataset.fixtureId||'',f=window.NOMAD343_DASHBOARD_V2?.getFixture?.(id),featured=document.querySelector('.right-rail [data-featured]');
 const home=f?.home?.name||featured?.querySelector('[data-featured-home]')?.textContent||'Home',away=f?.away?.name||featured?.querySelector('[data-featured-away]')?.textContent||'Away',model=probabilities(f),values=model?.values;
 const best=values?values.indexOf(Math.max(...values)):-1,tied=values&&values.filter(v=>Math.abs(v-values[best])<.05).length>1,leader=tied?'Even outlook':best===0?home:best===1?'Draw':away;
 const age=model?Math.max(0,Math.floor((Date.now()-model.at)/1000)):null,signature=JSON.stringify([id,home,away,model?.whole,age]);if(card.dataset.signature===signature)return;card.dataset.signature=signature;
 let offset=0;const colors=['var(--mm-green)','var(--mm-white)','var(--mm-yellow)'];const arcs=values?values.map((v,i)=>{const length=Math.max(0,v-1.5),el=`<circle class="mm-arc" cx="110" cy="110" r="85" pathLength="100" stroke="${colors[i]}" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}"/>`;offset+=v;return el}).join(''):'';
 const labels=['Home win','Draw','Away win'];
 card.innerHTML=`<div class="mm-heading"><span class="mm-eyebrow">LIVE MATCH MONITOR</span><span class="mm-badge">${model?'LIVE ODDS':'AWAITING DATA'}</span></div><h2>Match outlook</h2><p class="mm-sub">${esc(home)} · ${esc(away)}</p><div class="mm-dial" role="img" aria-label="${model?labels.map((s,i)=>s+' '+model.whole[i]+' percent').join(', '):'Probability unavailable: awaiting verified live odds'}"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="mm-ticks" cx="110" cy="110" r="103" pathLength="100"/><circle class="mm-track" cx="110" cy="110" r="85"/>${arcs}<circle cx="110" cy="110" r="73" fill="none" stroke="#9cd1b51a"/></svg><div class="mm-core"><small>${model?'MARKET OUTLOOK':'WIN PROBABILITY'}</small><strong>${model?(tied?'—':model.whole[best]+'%'):'—'}</strong><b style="color:${best>=0?colors[best]:'var(--mm-green)'}">${model?esc(leader):'Awaiting live odds'}</b></div></div><div class="mm-grid">${['HOME','DRAW','AWAY'].map((s,i)=>`<div class="mm-outcome mm-${['home','draw','away'][i]}"><span>${s}</span><strong>${model?model.whole[i]+'%':'—'}</strong></div>`).join('')}</div><p class="mm-foot">${model?'Market-implied · live 1X2 · '+age+'s ago<br>Margin adjusted. Estimates, not guaranteed outcomes.':'Waiting for fresh live 1X2 prices.<br>Pre-match, held or stale prices are not used.'}</p>`;
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render)}}
new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.b46-match-monitor')))schedule()}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-fixture-id','aria-hidden']});
document.addEventListener('nomad343:fixture-ready',schedule);window.addEventListener('resize',schedule);setInterval(()=>{if(!document.hidden)schedule()},5000);schedule();
})();
