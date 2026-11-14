import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createReadModel,financial,selectionOf,familyOf,dateMs} from './read-model.mjs';
import {formulas,registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
const U='work/statistics-summary-shadow-20261113',D='work/statistics-read-model-v2-20261114';
const recorded=JSON.parse(await readFile(U+'/reference/ui-proof/qa/verified-full-ledger.json','utf8'));
const financeText=await readFile(U+'/reference/longterm-performance-343.js','utf8');const formulaLine=financeText.match(/function settlement\\(r\\)\\{[^\\n]+/);assert(formulaLine,'REFERENCE_FORMULA_MISSING');const financialReference=new Function('outcome','num',formulaLine[0]+';return settlement')(r=>String(r.result||'').toUpperCase(),v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null);
const rows=recorded.rows,proofs=[],stats={ok:false,sourceRows:rows.length,providerRequests:0,productionWrites:0};
function test(name,fn){fn();proofs.push(name)}
const st=performance.now(),model=createReadModel(rows,{contentRevision:17,asOf:recorded.asOf,registry,now:Date.now()});
stats.buildMs=performance.now()-st;stats.groupCount=model.groupCount;
const s=model.summary;
test('Complete source is consumed and all identifiers unique',()=>{assert.equal(s.ledgerTotal,rows.length);assert.equal(s.marketCounts.all,rows.length);assert.equal(new Set(rows.map(x=>x.id)).size,rows.length)});
test('All original status/outcome buckets match recorded Engine metadata',()=>{for(const k of ['settledTotal','pending','unresolved','win','loss','push','halfWin','halfLoss'])assert.equal(s[k],recorded.meta[k],k)});
test('Every original market family matches current production registry',()=>{const reference={all:rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};for(const r of rows)reference[registry.familyOf(r)]++;assert.deepEqual(s.marketCounts,reference)});
test('Original untouched financial settlement formula matches every settled entry',()=>{
 const script=financialReference; 
 let net=0,stake=0;
 for(const r of rows.filter(x=>x.status==='SETTLED')){const expected=script(r),actual=financial(r);assert.equal(actual.priced,expected.priced);assert.equal(actual.stake,expected.stake);if(actual.priced){assert(Math.abs(actual.profit-expected.profit)<1e-10);net+=actual.profit;stake+=actual.stake}}
 assert(Math.abs(s.net-net)<1e-6);assert.equal(s.stake,stake);
});
test('Global win rate is weighted according to original full-ledger rule',()=>{const d=s.win+s.loss+s.halfWin+s.halfLoss;assert.equal(s.winRate,d?Math.round((s.win+.5*s.halfWin)/d*1000)/10:null)});
test('Every market uses correct server-side pagination and complete global counts',()=>{
 for(const market of ['all','1x2','ah','ou','btts','corners','cards','other']){let page=1,total=0;const seen=new Set();while(true){const got=model.query({market,page,limit:50});assert(got.rows.length<=50);assert.equal(got.contentRevision,17);assert.equal(got.totalRows,s.marketCounts[market]);for(const r of got.rows){assert(!seen.has(r.id));seen.add(r.id);assert(market==='all'||registry.familyOf(r)===market)}total+=got.rows.length;if(page>=got.pages)break;page++;assert(page<500)}assert.equal(total,s.marketCounts[market]);}
});
test('Filtered market and variant pages match original UI grouping',()=>{
 const present=new Map();for(const r of rows){const m=registry.familyOf(r),v=registry.resolve(r)?.key||'other',f=selectionOf(r);for(const k of [JSON.stringify([m,v,'all']),JSON.stringify([m,'all',f]),JSON.stringify([m,v,f])])present.set(k,(present.get(k)||0)+1)}
 for(const [k,n]of present){const [market,variant,filter]=JSON.parse(k),q=model.query({market,variant,filter});assert.equal(q.totalRows,n,k);}
});
test('Chart aggregates never change exact all-history net and preserve within-day extremes',()=>{
 for(const market of ['all','1x2','ah','ou','corners']){const data=model.query({market,rangeDays:'all'});assert(data.chart.every(x=>x.low<=x.close&&x.close<=x.high&&x.low<=x.open&&x.open<=x.high));if(data.chart.length)assert(Math.abs(data.chart.at(-1).close-data.metrics.net)<1e-6);}
});
test('Visible chart range does not alter complete market KPI and total count',()=>{const a=model.query({market:'ou',rangeDays:'all'}),b=model.query({market:'ou',rangeDays:30}),c=model.query({market:'ou',rangeDays:90});assert.equal(a.totalRows,b.totalRows);assert.equal(a.totalRows,c.totalRows);assert.deepEqual(a.metrics,b.metrics);assert.deepEqual(a.metrics,c.metrics);assert(b.chart.length<=c.chart.length&&c.chart.length<=a.chart.length)});
test('Only the first 50 rows are transferred; subsequent pages retain original rows',()=>{const first=model.query(),second=model.query({page:2});assert.equal(first.rows.length,50);assert.equal(second.rows.length,50);assert(!first.rows.some(r=>second.rows.some(s=>s.id===r.id)));assert.equal(first.totalRows,rows.length);stats.completeResponseBytes=Buffer.byteLength(JSON.stringify(rows));stats.firstPageBytes=Buffer.byteLength(JSON.stringify(first));stats.transferReduction=1-stats.firstPageBytes/stats.completeResponseBytes;assert(stats.transferReduction>.90)});
test('No partial snapshot or duplicate source can be published',()=>{assert.throws(()=>createReadModel([rows[0],rows[0]],{contentRevision:1}),/DUPLICATE/);assert.throws(()=>createReadModel(rows,{contentRevision:-1}),/REVISION/);assert.throws(()=>model.query({limit:101}),/PAGINATION/)});
test('Immutable model does not depend on subsequent source array changes',()=>{const old=s.ledgerTotal;const removed=rows.pop();try{assert.equal(model.summary.ledgerTotal,old);assert.equal(model.query().totalRows,old)}finally{rows.push(removed)}});
stats.ok=true;stats.checks=proofs.length;stats.tests=proofs;
await mkdir(D+'/qa',{recursive:true});await writeFile(D+'/qa/read-model-proof.json',JSON.stringify(stats,null,2));
console.log('B46_READ_MODEL_TEST '+JSON.stringify({ok:true,checks:stats.checks,sourceRows:stats.sourceRows,buildMs:stats.buildMs,firstPageBytes:stats.firstPageBytes,completeResponseBytes:stats.completeResponseBytes,transferReduction:stats.transferReduction,groupCount:stats.groupCount}));
