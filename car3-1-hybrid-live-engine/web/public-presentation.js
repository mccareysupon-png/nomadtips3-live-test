let scheduled=false;
const $=s=>document.querySelector(s);
const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};
const setHidden=(el,value)=>{if(el&&el.hidden!==value)el.hidden=value;};

function confirmedActive(){return Boolean($('.candidate.active.confirmed-signal'));}

function cleanPublicText(text){
  let out=String(text||'');
  out=out.replace(/CAR\s*3\.1\s*(?:LIVE\s*)?/gi,'NOMADTIPS3 ')
    .replace(/BET365[_\s-]*V4/gi,'VERIFIED')
    .replace(/\bSHADOW SIGNAL\b/gi,'CONFIRMED SIGNAL')
    .replace(/\bSHADOW\b/gi,'')
    .replace(/\bWorker connection error\b/gi,'Live data connection issue')
    .replace(/\bWorker\b/gi,'service')
    .replace(/server-side evaluation/gi,'live qualification status')
    .replace(/stored server-side/gi,'recorded automatically')
    .replace(/Event feed parser is being expanded\. Score \/ cards \/ corners are already live\./gi,'No event timeline is available for this match yet.');
  return out.replace(/\s{2,}/g,' ').trim();
}

function hideInternalPanels(){
  setHidden($('#sourceRow'),true);
  setHidden(document.querySelector('.tab[data-tab="source"]'),true);
  setHidden($('#tab-source'),true);
  setHidden($('#gateList'),true);
  setHidden($('#finalReason'),true);
}

function publicMetrics(){
  const labels={metricLive:'LIVE MATCHES',metricStats:'DATA READY',metricWindow:'ACTIVE WINDOW',metricWatch:'MONITORING',metricSignal:'CONFIRMED'};
  for(const [id,label] of Object.entries(labels))setText(document.getElementById(id)?.closest('.metric')?.querySelector('small'),label);
  setHidden(document.getElementById('metricNear')?.closest('.metric'),true);
}

function publicCandidates(){
  document.querySelectorAll('.candidate').forEach(card=>{
    const state=card.querySelector('.state');
    const confirmed=card.classList.contains('confirmed-signal');
    setHidden(state,!confirmed);
    if(confirmed)setText(state,'CONFIRMED');
  });
  document.querySelectorAll('.candidate-list .footer-note').forEach(el=>{
    const raw=String(el.textContent||'');
    if(/CAR\s*3\.1|live record|Worker/i.test(raw))setText(el,'NOMADTIPS3 is scanning live matches · No confirmed signal is available in the latest update.');
  });
}

function publicDecision(){
  const final=$('#finalDecision');
  const section=final?.closest('.decision');
  const heading=section?.previousElementSibling?.classList.contains('section-title')?section.previousElementSibling:null;
  setText(heading?.querySelector('h3'),'SIGNAL STATUS');
  setText(heading?.querySelector('span'),'Live qualification status');
  setText(section?.querySelector('.decision-final small'),'SIGNAL STATUS');
  setText(final,confirmedActive()?'CONFIRMED LIVE SIGNAL':'MONITORING');
}

function cleanDynamicCopy(){
  document.querySelectorAll('.evidence-card small').forEach(el=>setText(el,String(el.textContent||'').replace(/\bDELTA\b/gi,'CHANGE')));
  document.querySelectorAll('#events .footer-note,.empty-row,#historyUpdated').forEach(el=>setText(el,cleanPublicText(el.textContent)));
}

function publicize(){
  scheduled=false;
  hideInternalPanels();
  publicMetrics();
  publicCandidates();
  publicDecision();
  cleanDynamicCopy();
}

/* Mobile compact mode is presentation-only. It folds deep analysis without changing live data or engine state. */
const mobileQuery=window.matchMedia('(max-width: 760px)');
let mobileToggle=null;

function ensureMobileCompactStyles(){
  if(document.querySelector('link[data-car31-mobile-compact]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./mobile-compact.css?v=20260818-r1';
  link.dataset.car31MobileCompact='true';
  document.head.appendChild(link);
}

function markMobileExtras(){
  const detail=document.querySelector('.detail');
  if(!detail)return;
  const titles=[...detail.querySelectorAll(':scope > .section-title')];
  titles.slice(1).forEach(el=>el.classList.add('mobile-extra'));
  ['.charts','#evidenceGrid','.tabs','#tab-odds','#tab-events','#tab-source','.decision','.footer-note'].forEach(selector=>{
    detail.querySelectorAll(selector).forEach(el=>el.classList.add('mobile-extra'));
  });
}

function ensureMobileToggle(){
  const grid=$('#statsGrid');
  if(!grid||mobileToggle)return;
  mobileToggle=document.createElement('button');
  mobileToggle.type='button';
  mobileToggle.className='mobile-more-toggle';
  mobileToggle.setAttribute('aria-expanded','false');
  mobileToggle.innerHTML='<span>More stats</span><small>ODDS · PRESSURE · EVENTS · SIGNAL STATUS</small>';
  mobileToggle.addEventListener('click',()=>{
    const open=document.body.classList.toggle('mobile-more-open');
    mobileToggle.setAttribute('aria-expanded',String(open));
    mobileToggle.querySelector('span').textContent=open?'Less stats':'More stats';
    if(!open)mobileToggle.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
  grid.insertAdjacentElement('afterend',mobileToggle);
}

function applyMobileMode(){
  document.body.classList.toggle('mobile-compact',mobileQuery.matches);
  if(!mobileQuery.matches){
    document.body.classList.remove('mobile-more-open');
    if(mobileToggle){
      mobileToggle.setAttribute('aria-expanded','false');
      mobileToggle.querySelector('span').textContent='More stats';
    }
  }
}

function initMobileCompact(){
  ensureMobileCompactStyles();
  markMobileExtras();
  ensureMobileToggle();
  applyMobileMode();
  mobileQuery.addEventListener?.('change',applyMobileMode);
}

function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(publicize);}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
window.addEventListener('load',schedule,{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMobileCompact,{once:true});
else initMobileCompact();
schedule();
