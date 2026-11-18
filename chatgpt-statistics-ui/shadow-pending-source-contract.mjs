// Production read-only: discover whether existing active /signals can provide a COMPLETE Pending set.
// No user identifiers or raw match data logged.
import {collect} from './shadow-seed-snapshot.mjs';
const s=await collect({includeRaw:true}),pending=s.rawRows.filter(x=>x.status==='PENDING'),ids=new Set(pending.map(r=>String(r.id)));
const root='https://www.ball46.com';
const queries=['/api/engine/signals','/api/engine/signals?window=all','/api/engine/statistics?paged=1&window=pending','/api/engine/statistics?paged=1&window=all'];
const probes=[];
for(const path of queries){
 const started=performance.now();
 try{
  const r=await fetch(root+path,{headers:{accept:'application/json','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-ReadOnly'},signal:AbortSignal.timeout(20000)});
  const body=await r.text(),d=JSON.parse(body),arrays=[];
  function walk(x,key,depth=0){
   if(depth>3||!x||typeof x!=='object')return;
   if(Array.isArray(x)){
    if(!x.length||x.some(z=>z&&typeof z==='object'&&!Array.isArray(z)))arrays.push({key,rows:x});
    return;
   }
   for(const [k,v] of Object.entries(x))if(v&&typeof v==='object')walk(v,key+'.'+k,depth+1);
  }
  walk(d,'$');
  const tested=arrays.map(({key,rows})=>{
   const rs=rows.filter(x=>x&&typeof x==='object'),kys=[...new Set(rs.slice(0,5).flatMap(x=>Object.keys(x)))].sort();
   const ids2=new Set(rs.map(x=>String(x.id??x.signal_id??x.signalId??'')));
   const statuses={};for(const x of rs){const st=String(x.status??x.result??x.settlement?.result??'MISSING');statuses[st]=(statuses[st]??0)+1}
   const matched=[...ids].filter(x=>ids2.has(x)).length;
   return {key,rows:rows.length,fields:kys.slice(0,70),statuses,matchingPendingIds:matched,allPendingIdsPresent:matched===ids.size};
  });
  probes.push({path,http:r.status,bytes:Buffer.byteLength(body),ms:Math.round(performance.now()-started),topKeys:Object.keys(d).slice(0,50),tested:tested.slice(0,10)});
 }catch(e){probes.push({path,error:String(e.message).slice(0,80)})}
}
console.log('PENDING_SOURCE_VERIFICATION='+JSON.stringify({legacyPending:ids.size,legacySettled:s.totals.total,probes}));
