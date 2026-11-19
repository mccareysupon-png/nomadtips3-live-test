// Staging-only cache. Reads stored all-time rates, never changes Receiver or original records.
export const markets=[['all','all'],['1x2','1X2'],['ah','AH'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
const outcomes=['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'];
export function valid(s){
 return s&&Number.isSafeInteger(s.sequence)&&s.sequence>=0&&Number.isSafeInteger(s.generation)&&typeof s.capturedAt==='string'&&Number.isFinite(Date.parse(s.capturedAt))&&s.rates&&Object.keys(s.rates).length===8&&markets.every(([id])=>Object.hasOwn(s.rates,id)&&(s.rates[id]===null||typeof s.rates[id]==='number'&&Number.isFinite(s.rates[id])&&s.rates[id]>=0&&s.rates[id]<=100));
}
export async function readRates(reader,target){
 const rows=await Promise.all(markets.map(async([id,market])=>{
  const q=new URLSearchParams({market,variant:'all',range:'all',filter:'all'});
  const r=await reader.fetch(new Request('https://shadow.internal/projection-graph-v1?'+q,{method:'GET',headers:{accept:'application/json'}}));
  if(r.status!==200)throw Error('RECEIVER_STATUS_'+r.status);
  const d=await r.json(),c=d.counts;
  if(!d.ok||d.market!==market||d.variant!=='all'||d.range!=='all'||d.filter!=='all'||!Number.isSafeInteger(d.sequence)||!Number.isSafeInteger(d.generation)||!c||!outcomes.every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||typeof d.win_rate!=='number'||!Number.isFinite(d.win_rate)||d.win_rate<0||d.win_rate>100)throw Error('RECEIVER_SCHEMA');
  const empty=['WIN','HALF_WIN','LOSS','HALF_LOSS'].every(k=>c[k]===0);
  return {id,sequence:d.sequence,generation:d.generation,rate:empty?null:d.win_rate,counts:c};
 }));
 const first=rows[0];
 if(first.sequence<target||!rows.every(r=>r.sequence===first.sequence&&r.generation===first.generation))throw Error('MIXED_GENERATION');
 for(const k of outcomes)if(rows.slice(1).reduce((n,r)=>n+r.counts[k],0)!==first.counts[k])throw Error('MARKET_TOTAL_DRIFT');
 const s={sequence:first.sequence,generation:first.generation,capturedAt:new Date().toISOString(),rates:Object.fromEntries(rows.map(r=>[r.id,r.rate]))};
 if(!valid(s))throw Error('BAD_RATES');return s;
}
export class MonitorRateCache{
 constructor(state,env){this.storage=state.storage;this.env=env;this.current=null;this.flight=null;this.lastAttempt=0;this.loaded=state.blockConcurrencyWhile(async()=>{this.current=await this.storage.get('snapshot')??null})}
 async fetch(req){
  const u=new URL(req.url);
  if(req.method!=='GET')return new Response(null,{status:405});
  await this.loaded;
  if(u.pathname==='/cached')return Response.json({snapshot:this.current,refreshing:!!this.flight});
  if(u.pathname!=='/refresh')return new Response(null,{status:404});
  const target=Number(u.searchParams.get('sequence'));
  if(!u.searchParams.has('sequence')||!Number.isSafeInteger(target)||target<0)return new Response(null,{status:400});
  if(valid(this.current)&&this.current.sequence>=target)return Response.json({snapshot:this.current,state:'CURRENT'});
  if(!this.flight&&Date.now()-this.lastAttempt>=3000){
   this.lastAttempt=Date.now();
   this.flight=(async()=>{
    const next=await readRates(this.env.B46_MARKET_READER,target);
    if(!valid(this.current)||next.sequence>=this.current.sequence){await this.storage.put('snapshot',next);this.current=next}
   })().catch(()=>{}).finally(()=>{this.flight=null});
  }
  if(this.flight)await this.flight;
  return Response.json({snapshot:this.current,state:valid(this.current)&&this.current.sequence>=target?'CURRENT':'WAITING'});
 }
}
// No polling, no fetch calls added by this bridge. Observe the header on the existing native graph response.
export function browserBridge(){
 try{
  const keys=['all','1x2','ah','ou','corners','btts','cards','other'];let latest=-1;
  function update(s){
   if(!s||!Number.isSafeInteger(s.sequence)||s.sequence<latest||!s.rates||Object.keys(s.rates).length!==8||!keys.every(k=>Object.hasOwn(s.rates,k)&&(s.rates[k]===null||typeof s.rates[k]==='number'&&Number.isFinite(s.rates[k])&&s.rates[k]>=0&&s.rates[k]<=100)))return;
   latest=s.sequence;
   for(const el of document.querySelectorAll('[data-b46-rate-snapshot]')){
    const k=el.dataset.b46RateSnapshot;if(!keys.includes(k))continue;
    const v=s.rates[k],label=v===null?'—':v.toFixed(2)+'%';
    if(el.textContent!==label)el.textContent=label;
    el.style.setProperty('color',v===null?'inherit':v>50?'#168b57':v<50?'#d54b60':'#ba8b20','important');
    el.dataset.b46MonitorSequence=String(s.sequence);el.title='Receiver Win Rate · sequence '+s.sequence;
   }
  }
  const native=window.fetch;
  window.fetch=function(...args){
   const promise=Reflect.apply(native,this,args);
   let u;try{u=new URL(args[0] instanceof Request?args[0].url:args[0],location.href)}catch{return promise}
   if(u.origin!==location.origin||u.pathname!=='/b46-receiver-v1/graph')return promise;
   return promise.then(r=>{try{const h=r.headers.get('x-b46-monitor-rates');if(h&&r.ok){const s=JSON.parse(h);queueMicrotask(()=>{try{update(s)}catch{}})}}catch{}return r});
  };
 }catch{}
}
