// Probe documented existing public read route only; no mutations, no invented endpoint capabilities.
const base='https://www.ball46.com/api/engine/statistics';
const opts={headers:{accept:'application/json','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Staging-QA'},signal:AbortSignal.timeout(25000)};
async function read(query){
 const start=performance.now(),r=await fetch(base+'?'+query,opts),text=await r.text(),elapsed=Math.round(performance.now()-start);let d;
 try{d=JSON.parse(text)}catch{}
 const rows=Array.isArray(d?.rows)?d.rows:[],counts={};
 for(const row of rows)counts[row.status??'MISSING']=(counts[row.status??'MISSING']??0)+1;
 return {query,http:r.status,elapsed,bytes:Buffer.byteLength(text),rows:rows.length,statuses:counts,pending:d?.pending??null,ledgerTotal:d?.ledgerTotal??null,hasMore:d?.hasMore??null,nextCursor:!!d?.nextCursor,ids:rows.map(x=>String(x.id)),data:rows};
}
const plain=await read('paged=1');
const report=[];
for(const q of ['paged=1&status=PENDING','paged=1&status=pending','paged=1&filter=pending','paged=1&pending=1']){
 const x=await read(q);const same=x.ids.length===plain.ids.length&&x.ids.every((v,i)=>v===plain.ids[i]);const onlyPending=x.rows>0&&x.statuses.PENDING===x.rows;
 const verifiedComplete=onlyPending&&x.rows===x.pending&&!x.hasMore&&!x.nextCursor&&new Set(x.ids).size===x.rows;
 report.push({...x,ids:undefined,data:undefined,sameAsUnfiltered:same,onlyPending,verifiedComplete});
}
console.log('STAGE_PENDING_UPSTREAM_PROBE='+JSON.stringify({baseline:{...plain,ids:undefined,data:undefined},filters:report,completePendingCandidate:report.some(x=>x.verifiedComplete)}));
