(()=>{
'use strict';
const KEY='nomad341OddsDisplayV1',MODES=new Set(['decimal','american','fractional']);
let mode=(()=>{try{const v=String(localStorage.getItem(KEY)||'').toLowerCase();return MODES.has(v)?v:'decimal'}catch{return'decimal'}})(),applying=false;
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const american=v=>{if(!finite(v)||Number(v)<=1)return'—';const d=Number(v),a=d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));return a>0?`+${a}`:String(a)};
const gcd=(a,b)=>{a=Math.abs(Math.trunc(a));b=Math.abs(Math.trunc(b));while(b){const t=b;b=a%b;a=t}return a||1};
const fractional=v=>{if(!finite(v)||Number(v)<=1)return'—';const target=Number(v)-1;for(let den=1;den<=100;den++){const num=Math.round(target*den);if(num<=0)continue;if(Math.abs(num/den-target)<=0.0050000001){const g=gcd(num,den);return`${num/g}/${den/g}`}}const num=Math.max(1,Math.round(target*100)),g=gcd(num,100);return`${num/g}/${100/g}`};
const decimal=v=>finite(v)?Number(v).toFixed(2):'—';
const format=v=>mode==='american'?american(v):mode==='fractional'?fractional(v):decimal(v);
const isDecimal=s=>/^\d+\.\d{2}$/.test(String(s||'').trim());
const hasDecimalOdds=s=>/(@\s*)(\d+\.\d{2})(?!\d)/.test(s)||/(\bOdds\s+)(\d+\.\d{2})(?!\d)/i.test(s);
const convertText=(s,formatter)=>s.replace(/(@\s*)(\d+\.\d{2})(?!\d)/g,(_,p,v)=>p+formatter(v)).replace(/(\bOdds\s+)(\d+\.\d{2})(?!\d)/gi,(_,p,v)=>p+formatter(v));
function exact(el){if(!el)return;const cur=String(el.textContent||'').trim();if(mode==='decimal'){if(isDecimal(cur)){el.dataset.nomadOddsDecimal=cur;return}const raw=el.dataset.nomadOddsDecimal;if(raw&&isDecimal(raw)&&el.textContent!==raw)el.textContent=raw;return}if(isDecimal(cur))el.dataset.nomadOddsDecimal=cur;const raw=el.dataset.nomadOddsDecimal;if(raw&&isDecimal(raw)){const next=format(raw);if(el.textContent!==next)el.textContent=next}}
function text(el){if(!el)return;const cur=String(el.textContent||'');if(mode==='decimal'){if(hasDecimalOdds(cur)){el.dataset.nomadOddsOriginal=cur;return}const raw=el.dataset.nomadOddsOriginal;if(raw&&hasDecimalOdds(raw)&&el.textContent!==raw)el.textContent=raw;return}if(hasDecimalOdds(cur))el.dataset.nomadOddsOriginal=cur;const raw=el.dataset.nomadOddsOriginal;if(raw&&hasDecimalOdds(raw)){const next=convertText(raw,format);if(el.textContent!==next)el.textContent=next}}
function apply(){if(applying)return;applying=true;try{
 document.querySelectorAll('.price-board-row').forEach(r=>{const c=r.querySelectorAll(':scope > span');if(c.length>=3)exact(c[2])});
 document.querySelectorAll('.price-source-value,.price-selected-value').forEach(text);
 document.querySelectorAll('.detail-card').forEach(c=>{const h=String(c.querySelector('h3')?.textContent||'').trim().toUpperCase();if(h==='PRICE CHECK'||h==='SIGNAL LOCK · LOCKED')c.querySelectorAll('.check b').forEach(text)});
 document.querySelectorAll('.data-table tbody tr').forEach(r=>{const c=r.querySelectorAll(':scope > td');if(c.length>=5)exact(c[4])});
 document.querySelectorAll('.summary-grid .metric').forEach(m=>{if(String(m.querySelector('span')?.textContent||'').trim().toUpperCase()==='AVG ODDS')exact(m.querySelector('strong'))});
 document.querySelectorAll('[data-odds-mode]').forEach(b=>{const on=b.dataset.oddsMode===mode;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',on?'true':'false')});
 document.documentElement.dataset.oddsDisplay=mode;
}finally{applying=false}}
function setMode(next){next=String(next||'').toLowerCase();if(!MODES.has(next)||next===mode){apply();return}mode=next;try{localStorage.setItem(KEY,mode)}catch{}apply();window.dispatchEvent(new CustomEvent('nomad:odds-display-change',{detail:{mode}}))}
const markup=()=>`<div class="odds-display-control" role="group" aria-label="Odds display format"><span class="odds-display-label">ODDS</span><button type="button" data-odds-mode="decimal" aria-pressed="false">DECIMAL</button><button type="button" data-odds-mode="american" aria-pressed="false">AMERICAN</button><button type="button" data-odds-mode="fractional" aria-pressed="false">FRACTION</button></div>`;
function mount(){if(document.querySelector('.odds-display-control'))return;const search=document.querySelector('.toolbar .search');if(search){search.insertAdjacentHTML('beforebegin',markup());return}const panel=document.querySelector('.summary-grid + .panel');if(panel){const s=document.createElement('section');s.className='odds-display-toolbar';s.innerHTML=markup();panel.parentNode.insertBefore(s,panel)}}
const observer=new MutationObserver(()=>{if(!applying)requestAnimationFrame(apply)});
function start(){mount();document.addEventListener('click',e=>{const b=e.target.closest('[data-odds-mode]');if(b)setMode(b.dataset.oddsMode)});apply();if(document.body)observer.observe(document.body,{childList:true,subtree:true,characterData:true})}
window.NOMAD_ODDS_DISPLAY=Object.freeze({getMode:()=>mode,setMode,format,americanFromDecimal:american,fractionalFromDecimal:fractional,decimalText:decimal,refresh:apply});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();