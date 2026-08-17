import '../web/mobile-compact.js';

const FINAL_COPY={SIGNAL:'CONFIRMED LIVE SIGNAL','SHADOW SIGNAL':'CONFIRMED LIVE SIGNAL'};
let scheduled=false;

function setText(el,text){
  if(el&&el.textContent!==text)el.textContent=text;
}

function routePaymentPage(){
  const action=document.querySelector('.monitor-subscribe-action');
  if(!action)return;
  action.setAttribute('href','./payment.html');
  setText(action.querySelector('span'),'VIEW PLAN · $20 / MONTH');
}

function activeConfirmed(){
  const active=document.querySelector('.candidate.active');
  return Boolean(active?.classList.contains('confirmed-signal'));
}

function updateSearchStatus(confirmedCount){
  const search=document.getElementById('metricWatch');
  const card=search?.closest('.metric');
  const label=card?.querySelector('small');
  const liveCount=Number(document.getElementById('metricLive')?.textContent||0);
  if(!search||!card)return;

  card.classList.remove('public-hidden');
  setText(label,'SIGNAL SEARCH');
  search.classList.remove('search-scanning','search-monitoring','search-confirmed');

  if(confirmedCount>0){
    setText(search,'CONFIRMED SIGNAL');
    search.classList.add('search-confirmed');
  }else if(liveCount>0){
    setText(search,'MONITORING LIVE MATCHES');
    search.classList.add('search-monitoring');
  }else{
    setText(search,'SCANNING LIVE MATCHES');
    search.classList.add('search-scanning');
  }
}

function updateTeamSignalLabel(confirmed){
  const selectedName=document.getElementById('homeTeam');
  const opponentName=document.getElementById('awayTeam');
  const selectedLabel=selectedName?.closest('.team-copy')?.querySelector('small');
  const opponentLabel=opponentName?.closest('.team-copy')?.querySelector('small');
  if(!selectedLabel)return;

  if(!confirmed){
    setText(selectedLabel,'WAITING FOR SIGNAL');
    selectedLabel.classList.remove('signal-selected');
    return;
  }

  const raw=String(selectedLabel.textContent||'').trim();
  const match=raw.match(/(?:SELECT|SIGNAL)\s*\/?\s*(HOME|AWAY)/i);
  const side=(match?.[1]||'HOME').toUpperCase();
  const other=side==='AWAY'?'HOME':'AWAY';
  setText(selectedLabel,`SIGNAL / ${side}`);
  setText(opponentLabel,`OPPONENT / ${other}`);
  selectedLabel.classList.add('signal-selected');
}

function publicize(){
  scheduled=false;
  routePaymentPage();

  document.getElementById('metricNear')?.closest('.metric')?.classList.add('public-hidden');

  document.querySelectorAll('.candidate .state').forEach(el=>{
    const confirmed=Boolean(el.closest('.candidate')?.classList.contains('confirmed-signal'));
    el.classList.toggle('public-state-visible',confirmed);
    if(confirmed)setText(el,'CONFIRMED');
  });

  const confirmedCount=document.querySelectorAll('.candidate.confirmed-signal').length;
  const confirmedMetric=document.getElementById('metricSignal');
  if(confirmedMetric)setText(confirmedMetric,String(confirmedCount));
  updateSearchStatus(confirmedCount);

  const confirmed=activeConfirmed();
  updateTeamSignalLabel(confirmed);

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
        :'NOMADTIPS3 is scanning live matches · No confirmed signal is available in the latest update.');
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
