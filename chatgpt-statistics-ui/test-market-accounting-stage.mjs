import assert from 'node:assert/strict';
import {seedMarketAccounts,applyMarketTransition,marketSnapshot} from './market-accounting-stage.mjs';
import {buildVerifiedGraph} from './chart-series-stage.mjs';
// Representative exact keys; live audit must confirm canonical aliases.
const markets=['ft_ah','ft_1x2','ft_over','ft_corners','ft_btts','ft_cards','other'];
const start=Date.parse('2026-11-17T00:00:00Z');
let book=seedMarketAccounts({ok:true,rows:[],ledgerTotal:0,total:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,snapshotSavedAt:start});
const rows=[];
for(let i=0;i<markets.length;i++){
 const pending={id:'test-'+i,market:markets[i],status:'PENDING',createdAt:start+i*60000,odds:2};
 let out=applyMarketTransition(book,null,pending,{at:start+i*60000});
 assert.equal(out.mode,'NON_SETTLED_COUNTER_UPDATE');book=out.state;
 assert.equal(book.accounts[markets[i]].stats.pending,1);
 const result=['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH','WIN','LOSS'][i];
 const settled={...pending,status:'SETTLED',result,settledAt:start+i*60000+1000};
 out=applyMarketTransition(book,pending,settled,{at:settled.settledAt});
 assert.equal(out.mode,'POSTED_NEW_SETTLEMENT');book=out.state;rows.push(settled);
 assert.equal(book.accounts[markets[i]].stats.pending,0);
 assert.equal(book.accounts[markets[i]].stats.total,1);
 assert.equal(applyMarketTransition(book,settled,settled).mode,'ALREADY_APPLIED');
 const snapshot=marketSnapshot(book);
 assert.equal(snapshot.all.total,rows.length);
 for(const [market,a] of Object.entries(snapshot.byMarket)){
  const expected=buildVerifiedGraph(rows.filter(x=>x.market===market),start).result;
  assert.deepEqual(a.summary,expected.summary);
  assert.deepEqual(a.series,expected.series);
 }
}
assert.equal(Object.keys(book.accounts).length,7);
assert.equal(book.all.stats.total,7);
assert.deepEqual(book.all.summary,buildVerifiedGraph(rows,start).result.summary);
assert.throws(()=>applyMarketTransition(book,rows[0],{...rows[0],market:'other'}),/MARKET_KEY_MISSING_OR_CHANGED/);
console.log('B46_SEVEN_MARKET_STAGE_TEST=PASS');
