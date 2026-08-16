// CAR 3.1 presentation-only normalization. Do not mutate engine/data/config values.
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const set=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};

function normalizeNav(){
  qa('.nav a').forEach(a=>{
    const t=(a.textContent||'').trim().toUpperCase();
    if(t.includes('LIVE')) set(a,'Live detection');
    else if(t.includes('STAT')) set(a,'Statistics');
    else if(t.includes('SETTING')) set(a,'Settings');
  });
}

function normalizePage(){
  const path=location.pathname.toLowerCase();
  const hero=q('.hero h1,.hero-copy h1');
  const heroP=q('.hero p,.hero-copy p');
  if(path.includes('settings')){
    set(hero,'Settings');set(heroP,'Signal condition controls');
  }else if(path.includes('statistics')||path.includes('history')){
    set(hero,'Statistics');set(heroP,'Transparent performance records');
  }else{
    set(hero,'Live detection');set(heroP,'Real-time signal monitoring');
  }
}

function normalizeLive(){
  const map=[
    ['.panel-head h2','Live analysis'],
    ['.section-title:nth-of-type(1) h3','Live match overview']
  ];
  for(const [s,t] of map)set(q(s),t);
  qa('.section-title h3').forEach(el=>{
    const raw=(el.textContent||'').trim().toUpperCase();
    if(raw.includes('MATCH OVERVIEW'))set(el,'Live match overview');
    else if(raw.includes('PRESSURE TIMELINE'))set(el,'Live pressure timeline');
    else if(raw.includes('ATTACK ACTIVITY'))set(el,'Attack activity');
    else if(raw.includes('SIGNAL STATUS'))set(el,'Signal status');
  });
  qa('.chart-card h4').forEach(el=>{
    const raw=(el.textContent||'').trim().toUpperCase();
    if(raw.includes('MOMENTUM'))set(el,'Momentum · 0–100');
    else if(raw.includes('DANGEROUS ATTACK'))set(el,'Dangerous attack trend');
  });
  qa('.tab').forEach(el=>{
    const raw=(el.textContent||'').trim().toUpperCase();
    if(raw==='ODDS')set(el,'Odds'); else if(raw==='EVENTS')set(el,'Events');
  });
  const anim=q('.animation-head b');if(anim)set(anim,'Live match');
  const animSmall=q('.animation-head small');if(animSmall)set(animSmall,' · nomadtips3 animation');
  // Running/current clock is intentionally presentation-hidden. Signal detection time remains.
  const current=q('#matchMinute');if(current)current.hidden=true;
  qa('.candidate-minute').forEach(el=>el.hidden=true);
}

function normalizeSettings(){
  qa('.settings-section h2').forEach(el=>{
    const raw=(el.textContent||'').trim().toUpperCase();
    if(raw.includes('CORE CONDITIONS'))set(el,'Core signal conditions');
    else if(raw.includes('ATTACK EVIDENCE'))set(el,'Attack evidence');
    else if(raw.includes('DATA SOURCE'))set(el,'Data source');
    else if(raw.includes('MOMENTUM LAB'))set(el,'Momentum weights & trend');
  });
  const reset=q('#resetBtn'),save=q('#saveBtn'),run=q('#runBtn');
  set(reset,'Reset');set(save,'Save only');set(run,'Save & run');
}

function normalizeStatistics(){
  qa('.history-chart-panel .panel-head h2').forEach(el=>set(el,'Performance history'));
  qa('.history-wrap .panel-head h2').forEach(el=>set(el,'Signal history'));
  const refresh=q('#refreshStats');set(refresh,'Refresh');
  qa('.pager button').forEach(el=>{
    const raw=(el.textContent||'').toUpperCase();
    if(raw.includes('PREVIOUS'))set(el,'← Previous');
    if(raw.includes('NEXT'))set(el,'Next →');
  });
}

function apply(){normalizeNav();normalizePage();normalizeLive();normalizeSettings();normalizeStatistics();}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
window.addEventListener('load',schedule,{once:true});schedule();
