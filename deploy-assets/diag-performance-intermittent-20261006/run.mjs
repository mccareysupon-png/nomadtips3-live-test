const base='https://www.ball46.com';
async function timed(path){
  const t0=Date.now();
  try{
    const r=await fetch(base+path,{cache:'no-store',headers:{'Cache-Control':'no-cache','Accept':'application/json'},signal:AbortSignal.timeout(15000)});
    const txt=await r.text();
    let j=null;try{j=JSON.parse(txt)}catch{}
    return {ok:r.ok,status:r.status,ms:Date.now()-t0,bytes:Buffer.byteLength(txt),jsonOk:j?.ok===true,rows:Array.isArray(j?.rows)?j.rows.length:null,ledgerTotal:j?.ledgerTotal??null,nextCursor:Boolean(j?.nextCursor),pending:j?.pending??null};
  }catch(e){return {ok:false,error:e.name+':'+e.message,ms:Date.now()-t0}}
}
const out=[];
for(let i=0;i<30;i++){
  const s=await timed('/api/engine/statistics?paged=1&_='+Date.now());
  out.push(s);
  await new Promise(r=>setTimeout(r,500));
}
const ok=out.filter(x=>x.ok&&x.jsonOk);
const fail=out.filter(x=>!(x.ok&&x.jsonOk));
const ms=ok.map(x=>x.ms).sort((a,b)=>a-b);
const summary={
  runs:out.length,
  success:ok.length,
  failures:fail.length,
  minMs:ms[0]??null,
  p50Ms:ms.length?ms[Math.floor(ms.length*.5)]:null,
  p90Ms:ms.length?ms[Math.floor(ms.length*.9)]:null,
  maxMs:ms.at(-1)??null,
  bytesMin:ok.length?Math.min(...ok.map(x=>x.bytes)):null,
  bytesMax:ok.length?Math.max(...ok.map(x=>x.bytes)):null,
  ledgerTotals:[...new Set(ok.map(x=>x.ledgerTotal))],
  rowCounts:[...new Set(ok.map(x=>x.rows))],
  pending:[...new Set(ok.map(x=>x.pending))],
  failuresDetail:fail
};
console.log(JSON.stringify({summary,out},null,2));