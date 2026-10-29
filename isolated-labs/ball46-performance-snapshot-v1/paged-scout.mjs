/*
 * One-time paged-ledger real-source viability audit (GET only).
 * No Cloudflare writes, no 5USD calls, no raw ledger logging or persistence.
 */
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {createPagedStatisticsSource} from './source-pages.mjs';
import {createDailyAccumulator} from './snapshot.mjs';
const out={mode:'READ_ONLY',schema:'snapshot-v1-paged-scout',startedUtc:new Date().toISOString(),
  productionWrites:0,rawRowsStored:false,providerCalls:0,ok:false,pageCount:0,rowCount:0};
const start=performance.now();
try{
  const source=createPagedStatisticsSource(fetch);
  const now=Date.now(),first=await source.head();
  out.head={ledgerTotal:first.ledgerTotal,ledgerUpdatedAt:first.ledgerUpdatedAt,
    returned:first.rows.length,nextCursor:Boolean(first.nextCursor),
    settlementRevision:first.settlementRevision};
  const accumulator=createDailyAccumulator({asOfMs:now});
  for await(const page of source.pages(first)){
    accumulator.append(page.rows);
    out.rowCount+=page.rows.length;out.pageCount++;
  }
  const s=accumulator.finish({expectedRows:Number(first.ledgerTotal),
    ledgerRevision:first.settlementRevision??null});
  out.day=s.londonDay;out.today={win:s.today.win,loss:s.today.loss,push:s.today.push,
    pending:s.today.pending,winRate:s.today.winRate,avgOdds:s.today.avgOdds};
  out.yesterday={win:s.yesterday.win,loss:s.yesterday.loss,push:s.yesterday.push,
    pending:s.yesterday.pending,winRate:s.yesterday.winRate,avgOdds:s.yesterday.avgOdds};
  out.ok=true;
}catch(e){out.error=String(e?.message||e).slice(0,160)}
finally{
  out.elapsedMs=Math.round(performance.now()-start);
  await mkdir('reports',{recursive:true});
  await writeFile('reports/ball46-snapshot-v1-paged-scout.json',JSON.stringify(out,null,2)+'\n');
  console.log('B46_PAGED_SCOUT='+JSON.stringify(out));
  if(!out.ok)process.exitCode=1;
}
