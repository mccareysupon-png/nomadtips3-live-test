(()=>{
'use strict';
const VERSION='343-odds-format-v2-odds-only-preserve-total';
const STORAGE_KEY='nomad343_odds_format_v1';
const EVENT_NAME='nomad343:odds-format-change';
const FORMATS={decimal:'DEC',fractional:'FRA',american:'AM'};
let current=readStored();
let applying=false,queued=false;

function readStored(){try{const v=localStorage.getItem(STORAGE_KEY);return FORMATS[v]?v:'decimal'}catch{return'decimal'}}
function numeric(v){const n=Number(String(v??'').trim());return Number.isFinite(n)?n:null}
function decimalText(v){const n=numeric(v);if(n===null)return String(v??'—');return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){const t=b;b=a%b;a=t}return a||1}
function fractionalText(v){
  const d=numeric(v);if(d===null||d<=1)return decimalText(v);
  const x=d-1;let bestN=1,bestD=1,bestErr=Infinity;
  for(let den=1;den<=20;den++){const num=Math.max(1,Math.round(x*den)),err=Math.abs(x-num/den);if(err<bestErr){bestErr=err;bestN=num;bestD=den}}
  const g=gcd(bestN,bestD);return`${bestN/g}/${bestD/g}`;
}
function americanText(v){const d=numeric(v);if(d===null||d<=1)return decimalText(v);const a=d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));return a>0?`+${a}`:String(a)}
function format(v,kind=current){if(kind==='fractional')return fractionalText(v);if(kind==='american')return americanText(v);return decimalText(v)}
function setNodeText(node,value){if(node.nodeValue!==value)node.nodeValue=value}
function setElementText(el,value){if(el.textContent!==value)el.textContent=value}
function parseAt(text){const m=String(text||'').match(/^(.*?@\s*)([0-9]+(?:\.[0-9]+)?)(.*)$/);return m?{prefix:m[1],raw:m[2],suffix:m[3]}:null}
function parseLeading(text){const m=String(text||'').match(/^\s*([0-9]+(?:\.[0-9]+)?)(.*)$/);return m?{raw:m[1],suffix:m[2]}:null}

function convertAtElement(el){
  if(!el.dataset.nomadOddsRaw){const p=parseAt(el.textContent);if(!p)return;el.dataset.nomadOddsRaw=p.raw;el.dataset.nomadOddsPrefix=p.prefix;el.dataset.nomadOddsSuffix=p.suffix}
  setElementText(el,`${el.dataset.nomadOddsPrefix||'@ '}${format(el.dataset.nomadOddsRaw)}${el.dataset.nomadOddsSuffix||''}`);
}
function convertDirectElement(el){
  if(!el.dataset.nomadOddsRaw){const raw=el.textContent.trim(),n=numeric(raw);if(n===null||n<=1)return;el.dataset.nomadOddsRaw=raw}
  setElementText(el,format(el.dataset.nomadOddsRaw));
}
function isDirectOddsChip(label,market){
  if(!label||label.includes('LINE'))return false;
  if(label==='OVER'||label==='UNDER'||label==='YES'||label==='NO'||label==='DRAW')return true;
  if(/\b1X2\b/.test(market))return true;
  if(/BOTH TEAMS TO SCORE|BTTS/.test(market)&&(label==='YES'||label==='NO'))return true;
  return false;
}
function convertChip(strong){
  const chip=strong.closest('.b365-chip');if(!chip)return;
  const label=(chip.querySelector('small')?.textContent||'').trim().toUpperCase();
  const market=(strong.closest('.b365-market')?.querySelector('header b')?.textContent||'').trim().toUpperCase();
  if(strong.dataset.nomadOddsRaw){
    if(strong.dataset.nomadOddsMode==='at')setElementText(strong,`${strong.dataset.nomadOddsPrefix||''}${format(strong.dataset.nomadOddsRaw)}${strong.dataset.nomadOddsSuffix||''}`);
    else setElementText(strong,format(strong.dataset.nomadOddsRaw));
    return;
  }
  const at=parseAt(strong.textContent);
  if(at){
    strong.dataset.nomadOddsRaw=at.raw;strong.dataset.nomadOddsMode='at';strong.dataset.nomadOddsPrefix=at.prefix;strong.dataset.nomadOddsSuffix=at.suffix;
    setElementText(strong,`${at.prefix}${format(at.raw)}${at.suffix}`);return;
  }
  if(!isDirectOddsChip(label,market))return;
  const raw=strong.textContent.trim(),n=numeric(raw);if(n===null||n<=1)return;
  strong.dataset.nomadOddsRaw=raw;strong.dataset.nomadOddsMode='direct';setElementText(strong,format(raw));
}
function convertSignalMarket(span){
  const node=[...span.childNodes].find(n=>n.nodeType===3&&String(n.nodeValue).includes('@'));if(!node)return;
  if(!span.dataset.nomadOddsRaw){const p=parseAt(node.nodeValue);if(!p)return;span.dataset.nomadOddsRaw=p.raw;span.dataset.nomadOddsPrefix=p.prefix;span.dataset.nomadOddsSuffix=p.suffix}
  setNodeText(node,`${span.dataset.nomadOddsPrefix||' @ '}${format(span.dataset.nomadOddsRaw)}${span.dataset.nomadOddsSuffix||''}`);
}
function convertLabelledDirect(container,labelText){
  const label=(container.querySelector('span,small')?.textContent||'').trim().toUpperCase();if(label!==labelText)return;
  const target=container.querySelector('strong,b');if(target)convertDirectElement(target);
}
function convertTracker(container){
  const label=(container.querySelector('small')?.textContent||'').trim().toUpperCase();if(label!=='ODDS AT SIGNAL')return;
  const target=container.querySelector('b,strong');if(!target)return;
  if(!target.dataset.nomadOddsRaw){const p=parseLeading(target.textContent);if(!p)return;target.dataset.nomadOddsRaw=p.raw;target.dataset.nomadOddsSuffix=p.suffix}
  setElementText(target,`${format(target.dataset.nomadOddsRaw)}${target.dataset.nomadOddsSuffix||''}`);
}
function convertLiveInline(el){
  if(!el.dataset.nomadOddsRaw){const p=parseAt(el.textContent);if(!p)return;el.dataset.nomadOddsRaw=p.raw;el.dataset.nomadOddsPrefix=p.prefix;el.dataset.nomadOddsSuffix=p.suffix}
  setElementText(el,`${el.dataset.nomadOddsPrefix||''}${format(el.dataset.nomadOddsRaw)}${el.dataset.nomadOddsSuffix||''}`);
}
function apply(root=document){
  if(applying)return;applying=true;
  try{
    root.querySelectorAll?.('.b365-signal-price').forEach(convertAtElement);
    root.querySelectorAll?.('.b365-chip strong').forEach(convertChip);
    root.querySelectorAll?.('.signal-market-chip > span').forEach(convertSignalMarket);
    root.querySelectorAll?.('.signal-entry-block > header small').forEach(convertAtElement);
    root.querySelectorAll?.('.signal-entry-grid > div').forEach(el=>convertLabelledDirect(el,'ODDS AT SIGNAL'));
    root.querySelectorAll?.('.signal-tracker > span').forEach(convertTracker);
    root.querySelectorAll?.('td.odds').forEach(convertDirectElement);
    root.querySelectorAll?.('.live-signal-sub').forEach(convertLiveInline);
  }finally{applying=false}
}
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply(document)})}
function setFormat(next){
  if(!FORMATS[next])return current;
  current=next;try{localStorage.setItem(STORAGE_KEY,current)}catch{}
  updateControl();apply(document);
  document.dispatchEvent(new CustomEvent(EVENT_NAME,{detail:{format:current,label:FORMATS[current]}}));
  return current;
}
function updateControl(){
  const btn=document.querySelector('[data-odds-format-button]');if(btn)btn.textContent=`ODDS · ${FORMATS[current]} ▾`;
  document.querySelectorAll('[data-odds-format-option]').forEach(b=>b.classList.toggle('active',b.dataset.oddsFormatOption===current));
}
function injectStyle(){
  if(document.getElementById('nomad343-odds-format-style'))return;
  const s=document.createElement('style');s.id='nomad343-odds-format-style';s.textContent=`.odds-format-control{position:relative;flex:0 0 auto}.odds-format-button{appearance:none;border:0;background:transparent;color:#aeb9b1;padding:7px 3px;font:800 9px/1 Arial,sans-serif;letter-spacing:.04em;cursor:pointer;white-space:nowrap}.odds-format-button:hover,.odds-format-button:focus-visible{color:#fff;outline:none}.odds-format-menu{position:absolute;right:0;top:calc(100% + 7px);z-index:2147483600;min-width:118px;padding:4px;background:#101712;border:1px solid #334239;box-shadow:0 10px 28px rgba(0,0,0,.34)}.odds-format-menu[hidden]{display:none}.odds-format-menu button{display:block;width:100%;border:0;background:transparent;color:#b7c2ba;padding:7px 8px;text-align:left;font:800 9px/1 Arial,sans-serif;cursor:pointer}.odds-format-menu button:hover,.odds-format-menu button.active{background:#1b2a20;color:#fff}.odds-format-menu button.active:after{content:'✓';float:right;color:#d7c54a}@media(max-width:760px){.odds-format-control{position:absolute;right:9px;top:50%;transform:translateY(-50%)}.odds-format-button{font-size:8px;padding:8px 0}.odds-format-menu{right:0;top:calc(100% + 5px)}}`;
  document.head.appendChild(s);
}
function injectControl(){
  if(document.querySelector('[data-odds-format-control]'))return;
  const host=document.querySelector('.topbar-inner');if(!host)return;
  const wrap=document.createElement('div');wrap.className='odds-format-control';wrap.dataset.oddsFormatControl='1';
  wrap.innerHTML=`<button type="button" class="odds-format-button" data-odds-format-button aria-haspopup="menu" aria-expanded="false">ODDS · ${FORMATS[current]} ▾</button><div class="odds-format-menu" data-odds-format-menu role="menu" hidden><button type="button" role="menuitem" data-odds-format-option="decimal">Decimal · DEC</button><button type="button" role="menuitem" data-odds-format-option="fractional">Fractional · FRA</button><button type="button" role="menuitem" data-odds-format-option="american">American · AM</button></div>`;
  host.appendChild(wrap);
  const button=wrap.querySelector('[data-odds-format-button]'),menu=wrap.querySelector('[data-odds-format-menu]');
  button.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open))});
  wrap.querySelectorAll('[data-odds-format-option]').forEach(b=>b.addEventListener('click',()=>{setFormat(b.dataset.oddsFormatOption);menu.hidden=true;button.setAttribute('aria-expanded','false')}));
  document.addEventListener('click',e=>{if(!wrap.contains(e.target)){menu.hidden=true;button.setAttribute('aria-expanded','false')}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;button.setAttribute('aria-expanded','false');button.focus()}});
  updateControl();
}
function start(){
  injectStyle();injectControl();apply(document);
  const mo=new MutationObserver(()=>{if(!applying)schedule()});mo.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('storage',e=>{if(e.key!==STORAGE_KEY)return;current=FORMATS[e.newValue]?e.newValue:'decimal';updateControl();apply(document)});
  window.NOMAD343_ODDS={version:VERSION,formats:{...FORMATS},get format(){return current},formatOdds:format,setFormat,refresh:()=>apply(document)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
