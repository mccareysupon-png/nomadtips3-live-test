const pitchMarkup=`<div class="signal-pitch" aria-hidden="true"><div class="pitch-outline"></div><div class="pitch-mid"></div><div class="pitch-circle"></div><div class="pitch-box left"></div><div class="pitch-box right"></div><div class="pitch-goal left"></div><div class="pitch-goal right"></div><div class="signal-flow"></div><div class="signal-ball"></div><div class="signal-caption">Live signal activity</div></div>`;

function decorateSignalCards(){
  const holder=document.getElementById('candidateCards');
  if(!holder)return;
  holder.querySelectorAll('.match-card.signal').forEach(card=>{
    if(card.querySelector('.signal-pitch'))return;
    const sub=card.querySelector('.match-sub');
    if(sub)sub.insertAdjacentHTML('beforebegin',pitchMarkup);
    else card.insertAdjacentHTML('beforeend',pitchMarkup);
  });
}

const holder=document.getElementById('candidateCards');
if(holder){
  new MutationObserver(decorateSignalCards).observe(holder,{childList:true,subtree:true});
  decorateSignalCards();
}
