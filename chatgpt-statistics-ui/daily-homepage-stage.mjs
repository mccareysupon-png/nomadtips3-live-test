// STAGING ONLY. Read the previously materialized <1KB-ish daily accounting
// head. NEVER ask the browser to fetch or aggregate historical Ledger rows.
export const stageDailyHomeScript=String.raw`(()=>{
'use strict';
const DIAG={status:'pending',reads:0,source:'VERIFIED_DAILY_HEAD'};
window.__B46_HOME_DAILY_DIAG=DIAG;
let cached=null;
function parts(ms){
 const o={};
 for(const p of new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
  .formatToParts(new Date(ms)))if(p.type!=='literal')o[p.type]=p.value;
 return o;
}
function dayKey(ms){
 const p=parts(ms);let k=[p.year,p.month,p.day].join('-');
 if(Number(p.hour)<6){const n=k.split('-').map(Number);k=new Date(Date.UTC(n[0],n[1]-1,n[2])-86400000).toISOString().slice(0,10)}
 return k;
}
function valid(head){
 const d=head?.daily;
 if(head?.ok!==true||head?.schema!==1||d?.schema!==1||
    d.source!=='ORIGINAL_LONDON_06H_CREATED_AT'||
    d.asOf!==head.snapshotSavedAt||d.tk!==dayKey(Date.now())||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.yk||''))return false;
 for(const name of ['today','yesterday']){
  const x=d[name];
  if(!x||['win','loss','push','pending','oddsCount'].some(k=>!Number.isSafeInteger(x[k])||x[k]<0)||
     !Number.isFinite(x.oddsSum)||x.oddsSum<0)return false;
 }
 return true;
}
function displayDay(n){
 const [y,m,d]=n.split('-').map(Number);
 return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit',month:'short'})
    .format(new Date(Date.UTC(y,m-1,d))).toUpperCase();
}
function number(b,k){return b[k].toLocaleString('en-US')}
function rate(b){const n=b.win+b.loss;return n?(b.win/n*100).toFixed(1).replace(/\.0$/,'')+'%':'—'}
function avg(b){return b.oddsCount?(b.oddsSum/b.oddsCount).toFixed(2):'—'}
function paint(){
 if(!cached||!valid(cached))return;
 const root=document.getElementById('ball46-daily-performance');
 if(!root)return;
 const set=(selector,value)=>{
  const e=root.querySelector(selector);
  if(e&&e.textContent!==String(value))e.textContent=String(value)
 };
 for(const [name,b] of [['today',cached.daily.today],['yesterday',cached.daily.yesterday]]){
  for(const x of ['win','loss','push'])set('[data-b46-stat="'+name+'-'+x+'"]',number(b,x));
  if(name==='today')set('[data-b46-stat="today-pending"]',number(b,'pending'));
  const r=rate(b);set('[data-b46-rate="'+name+'"]',r);
  const tone=root.querySelector('[data-b46-rate="'+name+'"]');
  if(tone)tone.setAttribute('data-b46-rate-tone',r==='—'?'neutral':parseFloat(r)>50?'positive':parseFloat(r)<50?'negative':'neutral');
  set('[data-b46-avg-odds="'+name+'"]',avg(b));
  set('[data-b46-total="'+name+'"]',number({total:b.win+b.loss+b.push+(name==='today'?b.pending:0)},'total'));
 }
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(cached.daily.asOf));
 set('[data-b46-label="today"]','Saved Summary · '+displayDay(cached.daily.tk)+' · '+time+' TH');
 set('[data-b46-label="yesterday"]','Settled Summary · '+displayDay(cached.daily.yk));
 DIAG.status='saved-daily-visible';
 DIAG.asOf=cached.daily.asOf;
 DIAG.today=cached.daily.today.win+cached.daily.today.loss+cached.daily.today.push;
}
async function load(){
 if(document.hidden)return;
 try{
  const resp=await fetch('/_b46_stage_stats_summary',{cache:'no-store',
    signal:AbortSignal.timeout(12000)});
  DIAG.reads++;
  if(!resp.ok)throw Error('COMPACT_HTTP_'+resp.status);
  const head=await resp.json();
  if(!valid(head))throw Error('STALE_OR_UNVERIFIED_DAILY_SNAPSHOT');
  cached=head;paint();
 }catch(e){DIAG.status='unavailable';DIAG.error=String(e.message||e).slice(0,110)}
}
function boot(){
 load();
 // Reapply to the native HOME card only; it may be restored by SPA navigation.
 setInterval(()=>{if(!document.hidden)paint()},1750);
 setInterval(load,60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();`;
