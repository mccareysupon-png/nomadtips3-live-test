import assert from 'node:assert/strict';

const urls=[
  'https://www.ball46.com/index.html',
  'https://www.ball46.com/api/engine/statistics?paged=1',
  'https://www.ball46.com/api/engine/statistics',
  'https://www.ball46.com/api/engine/signals',
  'https://www.ball46.com/api/engine/board'
];

async function timed(url){
  const t0=Date.now();
  const r=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache','Accept':'*/*'},signal:AbortSignal.timeout(60000)});
  const text=await r.text();
  return {url,status:r.status,ms:Date.now()-t0,bytes:Buffer.byteLength(text),text};
}

const out={checkedAt:new Date().toISOString()};
for(const u of urls){
  try{
    const x=await timed(u);
    out[u]={status:x.status,ms:x.ms,bytes:x.bytes};
    if(u.endsWith('index.html')){
      out.index={
        hasPerformance:x.text.includes('b46-daily-performance-runtime'),
        hasFlatCards:x.text.includes('b46-flat-result-cards-runtime'),
        hasLedgerGuard:x.text.includes('STATISTICS_LEDGER_INCOMPLETE'),
        hasPagedLoop:x.text.includes('while(cursor)')
      };
    }else if(u.includes('/statistics')){
      try{
        const j=JSON.parse(x.text);
        out[u].ok=j?.ok===true;
        out[u].ledgerTotal=j?.ledgerTotal;
        out[u].total=j?.total;
        out[u].pending=j?.pending;
        out[u].rows=Array.isArray(j?.rows)?j.rows.length:null;
        out[u].nextCursor=Boolean(j?.nextCursor);
        out[u].ledgerUpdatedAt=j?.ledgerUpdatedAt||null;
      }catch(e){out[u].jsonError=e.message}
    }
  }catch(e){
    out[u]={error:e.message};
  }
}

const first=await timed('https://www.ball46.com/api/engine/statistics?paged=1');
let pages=0,rows=0,cursor=null,ledgerTotal=null,sig=null;
try{
  let j=JSON.parse(first.text);
  ledgerTotal=Number(j?.ledgerTotal);
  cursor=j?.nextCursor||null;
  rows=Array.isArray(j?.rows)?j.rows.length:0;
  sig=JSON.stringify([j?.ledgerTotal,j?.total,j?.pending,j?.unresolved,j?.win,j?.loss,j?.push,j?.halfWin,j?.halfLoss,j?.ledgerUpdatedAt]);
  pages=1;
  const t0=Date.now();
  const seen=new Set();
  while(cursor&&pages<200){
    if(seen.has(cursor))throw Error('CURSOR_CYCLE');
    seen.add(cursor);
    const x=await timed('https://www.ball46.com/api/engine/statistics?paged=1&cursor='+encodeURIComponent(cursor));
    const p=JSON.parse(x.text);
    const psig=JSON.stringify([p?.ledgerTotal,p?.total,p?.pending,p?.unresolved,p?.win,p?.loss,p?.push,p?.halfWin,p?.halfLoss,p?.ledgerUpdatedAt]);
    if(psig!==sig)throw Error('SNAPSHOT_CHANGED_DURING_PAGING');
    rows+=Array.isArray(p?.rows)?p.rows.length:0;
    cursor=p?.nextCursor||null;
    pages++;
  }
  out.fullPaging={pages,rows,ledgerTotal,complete:!cursor&&rows===ledgerTotal,ms:Date.now()-t0};
}catch(e){
  out.fullPaging={pages,rows,ledgerTotal,error:e.message};
}
console.log(JSON.stringify(out,null,2));


/* ROOT_VS_INDEX_20261007 */
{
  const crypto=await import('node:crypto');
  const h=s=>crypto.createHash('sha256').update(s).digest('hex');
  const q=Date.now();
  const urls=['https://www.ball46.com/?_='+q,'https://www.ball46.com/index.html?_='+q];
  const rows=[];
  for(const u of urls){
    const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},redirect:'manual',signal:AbortSignal.timeout(60000)});
    const t=await r.text();
    rows.push({url:u,status:r.status,location:r.headers.get('location'),bytes:Buffer.byteLength(t),sha256:h(t),hasFlat:t.includes('b46-flat-result-cards-style'),hasRuntime:t.includes('b46-flat-result-cards-runtime'),hasPcOverride:t.includes('B46_FLAT_RESULT_CARDS_PC_NATIVE_OVERRIDE_20261007')});
  }
  console.log(JSON.stringify({ROOT_VS_INDEX_20261007:rows},null,2));
}
