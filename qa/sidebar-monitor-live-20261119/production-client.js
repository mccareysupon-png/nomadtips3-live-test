(()=>{'use strict';
 const keys=['all','1x2','ah','ou','btts','corners','cards','other'];let last=null;
 function valid(s){return s&&Number.isSafeInteger(s.sequence)&&s.sequence>=0&&s.rates&&Object.keys(s.rates).length===8&&keys.every(k=>Object.hasOwn(s.rates,k)&&(s.rates[k]===null||typeof s.rates[k]==='number'&&Number.isFinite(s.rates[k])&&s.rates[k]>=0&&s.rates[k]<=100))}
 function paint(s){
  if(!valid(s)||last&&s.sequence<last.sequence)return;
  last=s;
  document.querySelectorAll('[data-b46-rate-snapshot]').forEach(el=>{
    if(Number(el.dataset.b46MonitorSequence||-1)>s.sequence)return;
    const k=el.dataset.b46RateSnapshot;if(!keys.includes(k))return;
    const v=s.rates[k],label=v===null?'—':v.toFixed(2)+'%';
    if(el.textContent!==label)el.textContent=label;
    el.style.setProperty('color',v===null?'inherit':v>50?'#168b57':v<50?'#d54b60':'#ba8b20','important');
    el.dataset.b46MonitorSequence=String(s.sequence);el.dataset.b46MonitorLive='1';el.title='Receiver Win Rate · sequence '+s.sequence;
  });
 }
 document.addEventListener('DOMContentLoaded',()=>{if(last)paint(last)},{once:true});
 const native=window.fetch;
 if(typeof native!=='function')return;
 window.fetch=function(...args){
  const result=Reflect.apply(native,this,args);
  let u;try{u=new URL(args[0] instanceof Request?args[0].url:args[0],location.href)}catch{return result}
  if(u.origin!==location.origin||u.pathname!=='/b46-receiver-v1/graph')return result;
  return result.then(r=>{
   try{const h=r.headers.get('x-b46-monitor-rates');if(r.ok&&h){const s=JSON.parse(h);queueMicrotask(()=>{try{paint(s)}catch{}})}}catch{}
   return r;
  });
 };
})();