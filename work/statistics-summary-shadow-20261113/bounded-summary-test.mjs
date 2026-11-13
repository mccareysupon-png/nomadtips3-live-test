import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {reduceBounded,generation} from './bounded-summary.mjs';
import {formulas,registry} from './generated-summary-formulas.mjs';
const D='work/statistics-summary-shadow-20261113',input=JSON.parse(await readFile(D+'/reference/ui-proof/qa/verified-full-ledger.json'));
let checks=0;
function reader({drift=false,fail=false,oversize=false,repeat=false}={}){
 let pages=0;
 return async path=>{
  if(fail)throw Error('HTTP_429_STOP_NO_RETRY');
  if(path==='/ledger-health')return {...input.meta,updatedAt:input.asOf+(drift&&pages?1:0)};
  const u=new URL(path,'https://test.invalid');assert.equal(u.pathname,'/statistics');assert.equal(u.searchParams.get('paged'),'1');const c=u.searchParams.get('cursor');assert(c.startsWith('stat:v2:row:'));
  const offset=c==='stat:v2:row:\uffff'?0:Number(c.slice('stat:v2:row:'.length));pages++;
  const size=oversize?501:500,rows=input.rows.slice(offset,offset+size),hasMore=offset+size<input.rows.length;
  return {...input.meta,total:input.meta.settledTotal,ledgerUpdatedAt:input.asOf,rows,hasMore,nextCursor:hasMore?(repeat?c:'stat:v2:row:'+(offset+size)):null};
 };
}
const result=await reduceBounded(reader(),formulas,registry,{now:input.asOf});assert.equal(result.data.ledgerTotal,input.rows.length);assert.equal(result.proof.maxPageRows,500);assert.equal(result.proof.pages,Math.ceil(input.rows.length/500));checks++;
// Independent current frontend aggregate, with only Date.now injected.
const now=Date.now;Date.now=()=>input.asOf;let expected;try{expected=formulas.aggregate(input.rows)}finally{Date.now=now}
assert.deepEqual(result.data.daily,expected);checks++;
const reference={all:input.rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};for(const r of input.rows)reference[registry.familyOf(r)]++;assert.deepEqual(result.data.marketCounts,reference);checks++;
const settled=input.rows.filter(r=>r.status==='SETTLED').sort((a,b)=>Number(b.settledAt??b.createdAt)-Number(a.settledAt??a.createdAt));assert.deepEqual(result.data.recentSettled.map(r=>r.id),settled.slice(0,4).map(r=>r.id));checks++;
for(const [options,error] of [[{drift:true},/SOURCE_CHANGED/],[{fail:true},/HTTP_429/],[{oversize:true},/UNBOUNDED_PAGE/],[{repeat:true},/CURSOR_LOOP/]]){await assert.rejects(()=>reduceBounded(reader(options),formulas,registry,{now:input.asOf}),error);checks++;}
assert.equal(generation(input.meta),result.signature);checks++;
assert.equal(result.proof.sourceWrites,0);assert.equal(result.proof.providerRequests,0);checks++;
await writeFile(D+'/qa/bounded-summary.json',JSON.stringify({ok:true,checks,proof:result.proof,summaryBytes:JSON.stringify(result.data).length,limit:'Recorded current Ledger; production runtime binding not activated'},null,2));
console.log('BOUNDED_SUMMARY '+JSON.stringify({ok:true,checks,...result.proof}));
