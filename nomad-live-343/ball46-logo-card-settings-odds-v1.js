// BALL46-LOGO-CARD-SETTINGS-ODDS START
(()=>{
  'use strict';
  const ID='ball46LogoCardSettingsOdds';
  const KEY='nomad343_odds_format_v1';
  const LABELS={decimal:'DEC',fractional:'FRA',american:'AM'};
  function current(){
    const apiValue=window.NOMAD343_ODDS?.format;
    if(LABELS[apiValue]) return apiValue;
    try{const v=localStorage.getItem(KEY);return LABELS[v]?v:'decimal'}catch{return'decimal'}
  }
  function paint(){
    const value=current(),label=LABELS[value];
    document.documentElement.dataset.utilityOdds=value;
    document.querySelectorAll('[data-b46-format]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.b46Format===value)));
    const chip=document.querySelector('[data-b46-current-odds]');
    if(chip) chip.textContent=`ODDS · ${label}`;
    const bulk=document.querySelector('.workspace-brand-meta b');
    if(bulk && /^BULK\s*·/i.test(bulk.textContent||'')) bulk.textContent=`BULK · ${label}`;
  }
  function choose(event){
    const value=event.currentTarget.dataset.b46Format;
    if(!LABELS[value]) return;
    try{localStorage.setItem(KEY,value)}catch{}
    window.NOMAD343_ODDS?.setFormat?.(value);
    paint();
  }
  function mount(){
    if(document.getElementById(ID)) return;
    const brand=document.querySelector('.workspace-brand-card');
    if(!brand) return;
    const card=document.createElement('div');
    card.id=ID;
    card.className='rail-card b46-settings-card';
    card.innerHTML='<details class="b46-settings-details"><summary><span>⚙ Settings</span><b data-b46-current-odds>ODDS · DEC</b></summary><div class="b46-settings-panel"><span class="b46-settings-label">ODDS FORMAT</span><div class="b46-settings-options"><button type="button" data-b46-format="decimal" aria-pressed="false">DEC<small>Decimal</small></button><button type="button" data-b46-format="fractional" aria-pressed="false">FRA<small>Fractional</small></button><button type="button" data-b46-format="american" aria-pressed="false">AM<small>American</small></button></div></div></details>';
    brand.insertAdjacentElement('afterend',card);
    card.querySelectorAll('[data-b46-format]').forEach(btn=>btn.addEventListener('click',choose));
    document.addEventListener('nomad343:odds-format-change',paint);
    window.addEventListener('storage',e=>{if(e.key===KEY) paint()});
    paint();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})();
// BALL46-LOGO-CARD-SETTINGS-ODDS END
