import test from'node:test';
import assert from'node:assert/strict';
import{evaluateBTTSForm5,settleBTTSForm5}from'./form5.mjs';
import{form5LedgerRow,aggregateLedgerWithModel}from'./ledger-adapter.mjs';
const k='2026-10-24T12:00:00Z',at='2026-10-23T12:00:00Z';
const f=id=>Array.from({length:5},(_,i)=>({id:String(id+i+1),teams:{home:{id:'A'},away:{id:'B'}},goals:{home:1,away:1},kickoff_utc:new Date(Date.parse(k)-(i+1)*86400000).toISOString(),status:'finished'}));
const game={fixtureId:'888',home:{id:'A',name:'Club A'},away:{id:'B',name:'Club B'},kickoffUtc:k,league:{name:'Test'}};
const decision=()=>evaluateBTTSForm5(game,f(100),f(200),at);
test('pending maps into current statistics ledger row format with no fake bookmaker or odds',()=>{
 const x=form5LedgerRow(decision(),game);
 assert.equal(x.status,'PENDING');assert.equal(x.id,'btts-form5-v1:888');assert.equal(x.market,'ft_btts_yes');assert.equal(x.odds,null);assert.equal(x.bookmaker,null);assert.equal(x.priceSource,'FORM5_MODEL_NO_VERIFIED_ODDS');assert.equal(x.entryMinute,null);
});
test('settled keeps immutable pick and createdAt, FT results truthful',()=>{
 const d=decision(),row=form5LedgerRow(d,game),result=settleBTTSForm5(d,{fixtureId:'888',status:'finished',goals:{home:2,away:2}});
 const next=form5LedgerRow({...d,status:'SETTLED',...result},game,row);
 assert.equal(next.createdAt,row.createdAt);assert.equal(next.selection,row.selection);assert.equal(next.result,'WIN');assert.deepEqual(next.finalScore,{home:2,away:2});
});
test('reject changing selection retrospectively',()=>{
 const d=decision(),row=form5LedgerRow(d,game);
 assert.throws(()=>form5LedgerRow({...d,market:'ft_btts_no',selection:'NO'},game,row),/IMMUTABLE/);
});
test('refuse ledger entry at or after kickoff',()=>{
 const d={...decision(),issuedAt:k};assert.throws(()=>form5LedgerRow(d,game),/NOT_PREMATCH/);
});
test('merge independent form5 results into correct existing totals, no doubles when handed already merged',()=>{
 const old={total:3,win:1,loss:1,halfWin:1,halfLoss:0,byMarket:{ft_1x2:3}};
 const rows=[{model:'B46_BTTS_FORM5_V1',market:'ft_btts_yes',status:'SETTLED',result:'WIN'},
 {model:'B46_BTTS_FORM5_V1',market:'ft_btts_no',status:'SETTLED',result:'LOSS'},
 {model:'B46_BTTS_FORM5_V1',market:'ft_btts_yes',status:'PENDING'}];
 const v=aggregateLedgerWithModel(old,rows);
 assert.equal(v.total,5);assert.equal(v.win,2);assert.equal(v.loss,2);assert.equal(v.winRate,50);assert.equal(v.byMarket.ft_btts_yes,1);assert.equal(v.byMarket.ft_btts_no,1);assert.equal(v.byMarket.ft_1x2,3);
});
