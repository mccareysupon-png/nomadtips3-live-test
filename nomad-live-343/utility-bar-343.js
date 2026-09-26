(()=>{
'use strict';
const VERSION='343-utility-bar-v1-static';
const ROOT=document.documentElement;
const ODDS_KEY='nomad343_odds_format_v1';
const VALID_ODDS=new Set(['decimal','fractional','american']);
function stored(){try{const v=localStorage.getItem(ODDS_KEY);return VALID_ODDS.has(v)?v:'decimal'}catch{return'decimal'}}
function paintOdds(value){const v=VALID_ODDS.has(value)?value:'decimal';ROOT.dataset.utilityOdds=v;document.querySelectorAll('[data-utility-odds]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.utilityOdds===v)))}
function sync(){paintOdds(window.NOMAD343_ODDS?.format||stored())}
function bind(){
  document.querySelectorAll('[data-utility-odds]').forEach(btn=>btn.addEventListener('click',()=>{const v=btn.dataset.utilityOdds;if(!VALID_ODDS.has(v))return;window.NOMAD343_ODDS?.setFormat?.(v);paintOdds(v)}));
  document.addEventListener('nomad343:odds-format-change',e=>paintOdds(e.detail?.format));
  window.addEventListener('storage',e=>{if(e.key===ODDS_KEY)paintOdds(e.newValue)});
  sync();window.NOMAD343_UTILITY_BAR={version:VERSION,sync};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
