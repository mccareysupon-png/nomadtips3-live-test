function normalizeMinuteText(value){
  const text=String(value||'').trim();
  if(!text||text==='—')return 'LIVE';
  return text;
}

function ensureMatchTimeCard(card){
  const source=card.querySelector('.candidate-minute');
  if(!source)return;
  let timeCard=card.querySelector('.candidate-match-time');
  if(!timeCard){
    timeCard=document.createElement('span');
    timeCard.className='candidate-match-time';
    timeCard.innerHTML='<small>MATCH TIME</small><b>LIVE</b><em>LIVE</em>';
    source.insertAdjacentElement('afterend',timeCard);
  }
  const value=normalizeMinuteText(source.textContent);
  const valueEl=timeCard.querySelector('b');
  if(valueEl&&valueEl.textContent!==value)valueEl.textContent=value;
}

function cleanScoreboardClock(){
  const row=document.querySelector('#signalClockRow');
  if(!row)return;
  const spans=row.querySelectorAll(':scope > span');
  const divider=row.querySelector(':scope > i');
  if(spans[0]){
    const label=spans[0].querySelector('small');
    if(label&&label.textContent!=='SIGNAL LOCK')label.textContent='SIGNAL LOCK';
  }
  if(divider&&!divider.hidden)divider.hidden=true;
  if(spans[1]&&!spans[1].hidden)spans[1].hidden=true;
  const signal=document.querySelector('#signalMinute');
  const signalText=String(signal?.textContent||'').trim();
  const shouldHide=!signalText||signalText==='—';
  if(row.hidden!==shouldHide)row.hidden=shouldHide;
}

function applyMatchTimeCards(){
  document.querySelectorAll('.candidate').forEach(ensureMatchTimeCard);
  cleanScoreboardClock();
}

applyMatchTimeCards();
const observer=new MutationObserver(()=>applyMatchTimeCards());
const candidateList=document.querySelector('#candidateList');
if(candidateList)observer.observe(candidateList,{childList:true,subtree:true,characterData:true});
const score=document.querySelector('.score');
if(score)observer.observe(score,{childList:true,subtree:true,characterData:true});
setInterval(applyMatchTimeCards,1000);
