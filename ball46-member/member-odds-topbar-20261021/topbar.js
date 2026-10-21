
/* BALL46 MEMBER ODDS TOPBAR V1 — browser-only display preference, no API mutation */
(()=>{
 'use strict';
 const key='b46_member_odds_display_v1';
 const valid=new Set(['DEC','FRA','AM']);
 let format='DEC';
 try{const saved=localStorage.getItem(key);if(valid.has(saved))format=saved;}catch{}
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t;}return a;};
 const frac=decimal=>{
   const d=decimal-1;
   if(!(d>0))return '—';
   const den=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,20,25,33,40,50,100];
   let best={p:1,q:1,error:Infinity};
   for(const q of den){
      const p=Math.max(1,Math.round(d*q)),error=Math.abs(p/q-d);
      if(error<best.error-0.000001)best={p,q,error};
   }
   const common=gcd(best.p,best.q);
   return (best.p/common)+'/'+(best.q/common);
 };
 const convert=(value)=>{
    if(value===null||value===undefined||value===''||typeof value==='boolean')return '—';
    const decimal=Number(value);
    if(!Number.isFinite(decimal)||decimal<=1)return '—';
    if(format==='DEC')return decimal.toFixed(2);
    if(format==='FRA')return frac(decimal);
    return decimal>=2?'+'+Math.round((decimal-1)*100):String(-Math.round(100/(decimal-1)));
 };
 const api={getFormat:()=>format,formatOdds:(value)=>{const s=convert(value);return s==='—'?'—':'@'+s;}};
 Object.defineProperty(window,'Ball46MemberOdds',{value:api,writable:false,configurable:false});
 const trigger=document.querySelector('#b46-member-odds-trigger');
 const menu=document.querySelector('#b46-member-odds-menu');
 if(!trigger||!menu)return;
 const code=menu.querySelector('#b46-member-odds-code');
 const options=[...menu.querySelectorAll('[data-b46-odds-format]')];
 const open=state=>{menu.hidden=!state;trigger.setAttribute('aria-expanded',String(state));};
 const paint=()=>{
    code.textContent=format;
    options.forEach(el=>el.setAttribute('aria-checked',String(el.dataset.b46OddsFormat===format)));
    trigger.title='Odds display: '+({DEC:'Decimal',FRA:'Fractional',AM:'American'}[format]);
 };
 const pick=next=>{
    if(!valid.has(next))return;
    const changed=next!==format;
    format=next;try{localStorage.setItem(key,format);}catch{}
    paint();open(false);trigger.focus();
    if(changed)window.dispatchEvent(new CustomEvent('ball46:member-odds-format-change',{detail:{format}}));
 };
 trigger.addEventListener('click',()=>open(menu.hidden));
 options.forEach(el=>el.addEventListener('click',()=>pick(el.dataset.b46OddsFormat)));
 document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!e.target.closest('#b46-member-odds-wrap'))open(false);});
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!menu.hidden){open(false);trigger.focus();}
 });
 paint();
})();
