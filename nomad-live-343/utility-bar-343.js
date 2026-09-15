(()=>{
'use strict';
const VERSION='343-utility-bar-v1-static';
const ROOT=document.documentElement;
const ODDS_KEY='nomad343_odds_format_v1';
const LANG_KEY='nomad343_language_v1';
const VALID_ODDS=new Set(['decimal','fractional','american']);
const VALID_LANG=new Set(['en','th']);

function stored(key,fallback,valid){try{const v=localStorage.getItem(key);return valid.has(v)?v:fallback}catch{return fallback}}
function paintOdds(value){const v=VALID_ODDS.has(value)?value:'decimal';ROOT.dataset.utilityOdds=v;document.querySelectorAll('[data-utility-odds]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.utilityOdds===v)))}
function paintLang(value){const v=VALID_LANG.has(value)?value:'en';ROOT.dataset.utilityLang=v;document.querySelectorAll('[data-utility-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.utilityLang===v)))}
function sync(){paintOdds(window.NOMAD343_ODDS?.format||stored(ODDS_KEY,'decimal',VALID_ODDS));paintLang(window.NOMAD343_LANGUAGE?.current?.()||stored(LANG_KEY,'en',VALID_LANG))}
function bind(){
  document.querySelectorAll('[data-utility-odds]').forEach(btn=>btn.addEventListener('click',()=>{const v=btn.dataset.utilityOdds;if(!VALID_ODDS.has(v))return;window.NOMAD343_ODDS?.setFormat?.(v);paintOdds(v)}));
  document.querySelectorAll('[data-utility-lang]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.disabled)return;const v=btn.dataset.utilityLang;if(!VALID_LANG.has(v))return;window.NOMAD343_LANGUAGE?.set?.(v);paintLang(v)}));
  document.addEventListener('nomad343:odds-format-change',e=>paintOdds(e.detail?.format));
  document.addEventListener('nomad343:language-change',e=>paintLang(e.detail?.language));
  window.addEventListener('storage',e=>{if(e.key===ODDS_KEY)paintOdds(e.newValue);if(e.key===LANG_KEY)paintLang(e.newValue)});
  sync();
  window.NOMAD343_UTILITY_BAR={version:VERSION,sync};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
