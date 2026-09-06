(()=>{
'use strict';
window.NOMAD342_LEDGER_RUNTIME=Object.freeze({
  version:'ledger-v2-realtime-repair',
  base:'https://nomadtips3-342-ledger.mccarey-supon.workers.dev',
  lockPath:'/lock',
  signalPath:'/signal',
  statisticsPath:'/statistics',
  healthPath:'/health',
  pollMs:5000,
  timeoutMs:6500,
});

const ODDS_KEY='nomad341OddsDisplayV1',ODDS_MODES=new Set(['decimal','american','fractional']);
const normalizeMode=value=>{value=String(value||'').toLowerCase();return ODDS_MODES.has(value)?value:'decimal';};
const storedMode=()=>{try{return normalizeMode(localStorage.getItem(ODDS_KEY));}catch{return'decimal';}};
let oddsMode=storedMode();
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const american=value=>{if(!finite(value)||Number(value)<=1)return'—';const d=Number(value),a=d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));return a>0?`+${a}`:String(a);};
const gcd=(a,b)=>{a=Math.abs(Math.trunc(a));b=Math.abs(Math.trunc(b));while(b){const t=b;b=a%b;a=t;}return a||1;};
const fractional=value=>{if(!finite(value)||Number(value)<=1)return'—';const target=Number(value)-1;for(let den=1;den<=100;den++){const num=Math.round(target*den);if(num<=0)continue;if(Math.abs(num/den-target)<=0.0050000001){const g=gcd(num,den);return`${num/g}/${den/g}`;}}const num=Math.max(1,Math.round(target*100)),g=gcd(num,100);return`${num/g}/${100/g}`;};
const decimal=value=>finite(value)?Number(value).toFixed(2):'—';
const format=value=>oddsMode==='american'?american(value):oddsMode==='fractional'?fractional(value):decimal(value);
const emit=source=>document.dispatchEvent(new CustomEvent('nomad342:odds-display-change',{detail:{mode:oddsMode,source}}));
const syncMode=(value,source)=>{const next=normalizeMode(value);if(next===oddsMode)return false;oddsMode=next;emit(source);return true;};
window.NOMAD342_ODDS_DISPLAY=Object.freeze({getMode:()=>oddsMode,format,americanFromDecimal:american,fractionalFromDecimal:fractional,decimalText:decimal});
window.addEventListener('storage',event=>{if(event.key===ODDS_KEY)syncMode(event.newValue,'storage');});
window.addEventListener('focus',()=>syncMode(storedMode(),'focus'));

document.addEventListener('nomad342:ledgerlocked',()=>document.dispatchEvent(new CustomEvent('nomad342:ledgerrefresh')));
})();
