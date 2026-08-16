const STATE_COPY={WATCH:'MONITORING',NEAR:'CLOSE',SIGNAL:'CONFIRMED'};
const FINAL_COPY={WATCH:'MONITORING',NEAR:'CLOSE',SIGNAL:'CONFIRMED SIGNAL','SHADOW SIGNAL':'CONFIRMED SIGNAL'};
let scheduled=false;

function publicize(){
  scheduled=false;

  document.querySelectorAll('.candidate .state').forEach(el=>{
    const key=String(el.textContent||'').trim().toUpperCase();
    if(STATE_COPY[key])el.textContent=STATE_COPY[key];
  });

  const final=document.getElementById('finalDecision');
  if(final){
    const key=String(final.textContent||'').trim().toUpperCase();
    if(FINAL_COPY[key])final.textContent=FINAL_COPY[key];
  }

  document.querySelectorAll('.evidence-card small').forEach(el=>{
    el.textContent=String(el.textContent||'').replace(/\bDELTA\b/gi,'CHANGE');
  });

  document.querySelectorAll('.empty-row,.candidate-list .footer-note').forEach(el=>{
    const text=String(el.textContent||'');
    if(/CAR\s*3\.1/i.test(text)){
      el.textContent=/ยังไม่มีคู่/i.test(text)
        ?'No confirmed signals have been recorded yet.'
        :'NOMADTIPS3 is monitoring live matches · No confirmed signal is available in the latest update.';
    }
  });

  document.querySelectorAll('#pressureChart line[stroke-dasharray]').forEach(el=>el.remove());
}

function schedulePublicize(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(publicize);
}

new MutationObserver(schedulePublicize).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
window.addEventListener('load',schedulePublicize,{once:true});
schedulePublicize();
