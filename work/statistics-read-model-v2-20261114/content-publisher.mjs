// TEST publisher contract. It accepts complete, verified Ledger inputs; no network,
// provider, Engine storage or Production binding is available to this component.
import {dateMs,isSettled,outcome} from './read-model.mjs';
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!['_ledgerMarker','mirrorUpdatedAt'].includes(k)).map(k=>[k,canonical(value[k])]));
 return value;
}
export async function contentFingerprint(rows,now){
 const sorted=rows.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 // Window membership and London 06:00 day rollover change the rendered content
 // even when no new result arrives. A sync timestamp alone never invalidates it.
 const london=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
 const parts=Object.fromEntries(london.map(p=>[p.type,p.value]));
 const sportDay=Date.UTC(+parts.year,+parts.month-1,+parts.day)-(+parts.hour<6?86400000:0);
 const payload=JSON.stringify({rows:canonical(sorted),sportDay,windows:sorted.filter(isSettled).map(r=>[7,30,90].map(d=>dateMs(r.settledAt??r.createdAt)>=now-d*86400000))});
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function verifyCompleteLedger(rows,meta){
 if(!Array.isArray(rows)||rows.length!==meta.ledgerTotal||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!r.id))throw Error('INCOMPLETE_LEDGER');
 const fields={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'},counts={total:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0};
 for(const r of rows){if(isSettled(r)){counts.total++;counts[fields[outcome(r)]]++;}else if(r.status==='PENDING')counts.pending++;else if(r.status==='UNRESOLVED')counts.unresolved++;else throw Error('INVALID_LEDGER_STATUS');}
 for(const k of Object.keys(counts))if(meta[k]!==counts[k])throw Error('LEDGER_META_MISMATCH:'+k);
 return counts;
}
export class ContentPublisher{
 constructor(store,{registry,formulas,clock=()=>Date.now()}={}){this.store=store;this.registry=registry;this.formulas=formulas;this.clock=clock;this.queue=Promise.resolve();}
 ingest(rows,meta){
  const copy=structuredClone(rows),metadata=structuredClone(meta);
  const work=this.queue.catch(()=>{}).then(async()=>{
   verifyCompleteLedger(copy,metadata);const now=this.clock(),fingerprint=await contentFingerprint(copy,now),active=await this.store.active();
   if(active?.sourceFingerprint===fingerprint){await this.store.storage.put('b46:stat:read-v2:observed',{revision:active.contentRevision,at:now});return{changed:false,contentRevision:active.contentRevision,observedAt:now};}
   const revision=(active?.contentRevision??0)+1;
   const result=await this.store.publish(copy,{contentRevision:revision,asOf:now,registry:this.registry,formulas:this.formulas,sourceFingerprint:fingerprint});
   return{changed:true,contentRevision:revision,sourceRows:result.sourceRows};
  });this.queue=work;return work;
 }
}
