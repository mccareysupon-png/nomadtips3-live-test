const FINAL_COPY={SIGNAL:'CONFIRMED LIVE SIGNAL','SHADOW SIGNAL':'CONFIRMED LIVE SIGNAL'};
let scheduled=false;

function setText(el,text){
  if(el&&el.textContent!==text)el.textContent=text;
}

function activeConfirmed(){
  const active=document.querySelector('.candidate.active');
  return Boolean(active?.classList.contains('confirmed-signal'));
}

function publicize(){
  scheduled=false;

  for(const id of ['metricWatch','metricNear']){
    document.getElementById(id)?.closest('.metric')?.classList.add('public-hidden');
  }

  document.querySelectorAll('.candidate .state').forEach(el=>{
    const confirmed=Boolean(el.closest('.candidate')?.classList.contains('confirmed-signal'));
    el.classList.toggle('public-state-visible',confirmed);
    if(confirmed)setText(el,'CONFIRMED');
  });

  const confirmedCount=document.querySelectorAll('.candidate.confirmed-signal').length;
  const confirmedMetric=document.getElementById('metricSignal');
  if(confirmedMetric)setText(confirmedMetric,String(confirmedCount));

  const confirmed=activeConfirmed();
  const final=document.getElementById('finalDecision');
  const decision=final?.closest('.decision');
  const heading=decision?.previousElementSibling?.classList.contains('section-title')
    ?decision.previousElementSibling
    :null;

  decision?.classList.toggle('public-confirmed-visible',confirmed);
  heading?.classList.toggle('public-confirmed-visible',confirmed);

  if(final&&confirmed){
    const key=String(final.textContent||'').trim().toUpperCase();
    setText(final,FINAL_COPY[key]||'CONFIRMED LIVE SIGNAL');
    const title=heading?.querySelector('h3');
    const note=heading?.querySelector('span');
    setText(title,'CONFIRMED LIVE SIGNAL');
    setText(note,'Selected team and entry time are shown above');
  }

  document.querySelectorAll('.evidence-card small').forEach(el=>{
    const next=String(el.textContent||'').replace(/\bDELTA\b/gi,'CHANGE');
    setText(el,next);
  });

  document.querySelectorAll('.empty-row,.candidate-list .footer-note').forEach(el=>{
    const text=String(el.textContent||'');
    if(/CAR\s*3\.1/i.test(text)){
      setText(el,/ยังไม่มีคู่/i.test(text)
        ?'No confirmed signals have been recorded yet.'
        :'NOMADTIPS3 is monitoring live matches · No confirmed signal is available in the latest update.');
    }
  });

  document.querySelectorAll('#pressureChart line[stroke-dasharray]').forEach(el=>el.remove());
}

function schedulePublicize(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(publicize);
}

new MutationObserver(schedulePublicize).observe(document.documentElement,{
  subtree:true,
  childList:true,
  characterData:true,
  attributes:true,
  attributeFilter:['class']
});
window.addEventListener('load',schedulePublicize,{once:true});
schedulePublicize();
