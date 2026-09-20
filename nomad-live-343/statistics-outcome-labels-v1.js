(()=>{
'use strict';
const EVENT='ball46:statistics';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settledRows=rows=>(Array.isArray(rows)?rows:[]).filter(r=>String(r?.status||'SETTLED').toUpperCase()==='SETTLED');
function counts(rows){
  const s=settledRows(rows);
  const n=x=>s.filter(r=>String(r?.result||'').toUpperCase()===x).length;
  return {settled:s.length,fw:n('WIN'),hw:n('HALF_WIN'),fl:n('LOSS'),hl:n('HALF_LOSS'),p:n('PUSH')};
}
function compactOutcome(c,cls='outcome-breakdown-v1'){
  return `<div class="${cls}" aria-label="Full Win ${c.fw}, Half Win ${c.hw}, Full Loss ${c.fl}, Half Loss ${c.hl}, Push ${c.p}"><span class="win" title="Full Win"><b>${c.fw}</b> FW</span><span class="win" title="Half Win"><b>${c.hw}</b> HW</span><span class="loss" title="Full Loss"><b>${c.fl}</b> FL</span><span class="loss" title="Half Loss"><b>${c.hl}</b> HL</span><span class="push" title="Push"><b>${c.p}</b> P</span></div>`;
}
function topSummary(rows){
  const root=document.querySelector('.next-kpis');
  if(!root)return;
  const c=counts(rows);
  root.classList.remove('five');
  root.classList.add('outcome-summary-v1');
  root.innerHTML=`
    <article class="next-kpi"><span class="label">Settled Signals</span><strong>${c.settled}</strong><small>Completed signal results</small></article>
    <article class="next-kpi good"><span class="label">Full Win</span><strong>${c.fw}</strong><small>WIN settlements only</small></article>
    <article class="next-kpi"><span class="label">Full Loss</span><strong>${c.fl}</strong><small>LOSS settlements only</small></article>
    <article class="next-kpi good"><span class="label">Half Win</span><strong>${c.hw}</strong><small>HALF WIN settlements</small></article>
    <article class="next-kpi"><span class="label">Half Loss</span><strong>${c.hl}</strong><small>HALF LOSS settlements</small></article>
    <article class="next-kpi warn"><span class="label">Push</span><strong>${c.p}</strong><small>Stake returned</small></article>`;
}
function marketCards(j,rows){
  const defs=Object.keys(j?.markets||{}),cards=[...document.querySelectorAll('[data-next-stat-markets] .market-performance-card')];
  cards.forEach((card,i)=>{
    const key=defs[i]; if(!key)return;
    const c=counts(rows.filter(r=>r?.market===key));
    const old=card.querySelector('.market-wlp');
    if(old)old.outerHTML=compactOutcome(c,'market-wlp outcome-breakdown-v1');
    const bar=card.querySelector('.market-result-bar');
    if(bar)bar.setAttribute('aria-label',`Win-side outcomes ${c.fw+c.hw}, loss-side outcomes ${c.fl+c.hl}, push ${c.p}`);
  });
  const note=document.querySelector('.market-performance-title small');
  if(note)note.textContent='FW Full Win · HW Half Win · FL Full Loss · HL Half Loss · P Push';
}
function ceoCard(rows){
  const ceo=rows.filter(r=>String(r?.strategy||'OWNER').toUpperCase()==='CEO'),c=counts(ceo);
  const old=document.querySelector('.ceo-performance-card .ceo-wlp');
  if(old)old.outerHTML=compactOutcome(c,'ceo-wlp outcome-breakdown-v1');
}
function unitCards(j,rows){
  const all=counts(rows);
  const overall=document.querySelector('.unit-overall-card');
  if(overall){
    const p=overall.querySelector('.unit-overall-head p');
    if(p)p.textContent=`${all.settled} settled signals · Fixed stake 1.00u · Starts at 0.00u`;
    const statBox=overall.querySelector('.unit-overall-stats');
    if(statBox){
      [...statBox.querySelectorAll('.unit-metric')].forEach(m=>{
        const label=String(m.querySelector('small')?.textContent||'').trim().toLowerCase();
        if(label==='settled'||label==='unit samples')m.remove();
      });
    }
    const old=overall.querySelector('.unit-wlp');
    if(old)old.outerHTML=compactOutcome(all,'unit-wlp outcome-breakdown-v1');
  }
  document.querySelectorAll('[data-unit-market-card]').forEach(card=>{
    const key=card.getAttribute('data-unit-market-card');
    const c=counts(rows.filter(r=>String(r?.market||'')===String(key||'')));
    const old=card.querySelector('.unit-market-summary .unit-wlp');
    if(old)old.outerHTML=compactOutcome(c,'unit-wlp outcome-breakdown-v1');
  });
}
function apply(j){
  const rows=Array.isArray(j?.rows)?j.rows:[];
  topSummary(rows);
  marketCards(j,rows);
  ceoCard(rows);
  unitCards(j,rows);
}
window.addEventListener(EVENT,e=>requestAnimationFrame(()=>apply(e?.detail||{})));
})();
