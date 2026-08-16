function cleanupMatchTimeCard(){
  // The per-card/live-time display was not source-real-time and could mislead users.
  // Keep only the immutable SIGNAL minute recorded when a confirmed signal is created.
  document.querySelectorAll('.candidate-match-time').forEach(el=>el.remove());
  document.querySelectorAll('.candidate-minute').forEach(el=>{if(el.hidden)el.hidden=false;});

  const row=document.querySelector('#signalClockRow');
  if(!row)return;

  const spans=row.querySelectorAll(':scope > span');
  const divider=row.querySelector(':scope > i');
  divider?.remove();
  if(spans[1])spans[1].remove();

  if(spans[0]){
    const label=spans[0].querySelector('small');
    if(label&&label.textContent!=='SIGNAL')label.textContent='SIGNAL';
  }
}

cleanupMatchTimeCard();
const observer=new MutationObserver(()=>cleanupMatchTimeCard());
const candidateList=document.querySelector('#candidateList');
if(candidateList)observer.observe(candidateList,{childList:true,subtree:true});
const score=document.querySelector('.score');
if(score)observer.observe(score,{childList:true,subtree:true});
setInterval(cleanupMatchTimeCard,1000);
