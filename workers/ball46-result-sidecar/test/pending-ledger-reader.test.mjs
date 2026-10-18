import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRST_LEDGER_CURSOR,readPendingFromLedgerV2,pendingMarketEligible} from '../src/pending-ledger-reader.mjs';
const row=(id,market='OVER',status='PENDING')=>({id,fixtureId:'5USD-'+id,market,status,period:'FT'});
const page=(rows,nextCursor=null)=>({ok:true,statisticsSource:'LEDGER_V2_ONLY',
 statisticsLedgerVersion:'signal-ledger-v2-longterm',rows,nextCursor,pending:2,ledgerTotal:5000});
function engine(pages){
 const calls=[];
 return{calls,fetch:async(url,opt)=>{
  calls.push({url,opt});
  return{ok:true,json:async()=>pages.shift()};
 }};
}
test('first cursor is lexicographic upper bound, not bare prefix',()=>{
 assert.equal(FIRST_LEDGER_CURSOR,'stat:v2:row:9999999999999:~');
});
test('reads all paged PENDING rows without invoking /signals or scan',async()=>{
 const e=engine([page([row('1'),row('2','CORNERS'),row('3','AH','SETTLED')],
  'stat:v2:row:0000000002000:X'),page([row('4','AH')])]);
 const r=await readPendingFromLedgerV2(e);
 assert.equal(r.ok,true);assert.equal(r.rows.length,3);assert.equal(r.eligible.length,2);
 assert.equal(r.pages,2);assert.equal(r.mutations,0);
 assert.ok(e.calls.every(x=>x.opt.method==='GET'));
 assert.ok(e.calls.every(x=>x.url.includes('cursor=')&&!x.url.includes('/signals')));
});
test('declines uncertified or fabricated non Ledger V2 source',async()=>{
 const e=engine([{...page([row('1')]),statisticsSource:'CACHED_PAGE'}]);
 assert.equal((await readPendingFromLedgerV2(e)).ok,false);
});
test('never claims complete after a page cap',async()=>{
 const e=engine([page([row('1')],'stat:v2:row:0000000002000:X')]);
 assert.equal((await readPendingFromLedgerV2(e,{maxPages:1})).state,'LEDGER_V2_PAGES_EXCEEDED');
});
test('rejects replayed duplicate Signal IDs',async()=>{
 const e=engine([page([row('1'),row('1')])]);
 assert.equal((await readPendingFromLedgerV2(e)).state,'DUPLICATE_PENDING_SIGNAL_ID');
});
test('rejects ascending or invalid nextCursor',async()=>{
 const e=engine([page([row('1')],'bad-cursor')]);
 assert.equal((await readPendingFromLedgerV2(e)).state,'INVALID_NEXT_CURSOR');
});
test('missing service binding fails closed',async()=>{
 assert.equal((await readPendingFromLedgerV2(null)).state,'ENGINE_READ_BINDING_MISSING');
});
test('corners, cards, half time excluded from goals-only fallback',()=>{
 assert.equal(pendingMarketEligible(row('1','CORNERS')),false);
 assert.equal(pendingMarketEligible(row('1','CARDS')),false);
 assert.equal(pendingMarketEligible({...row('1','OVER'),period:'HT'}),false);
 assert.equal(pendingMarketEligible(row('1','OVER')),true);
});
