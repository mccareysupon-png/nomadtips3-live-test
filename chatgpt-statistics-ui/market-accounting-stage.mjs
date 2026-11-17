// STAGING only: independent balances for exact market keys from verified Ledger.
// No production writes. Unknown market keys are retained, never silently merged.
import {seedFromLatestVerified,applyLedgerTransition,displaySnapshot} from './incremental-accounting-v2-stage.mjs';
const fields={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};
const key=r=>String(r?.market??'').trim();
function counts(rows){
 const s={ok:true,ledgerTotal:rows.length,total:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0};
 for(const r of rows){if(r.status==='PENDING')s.pending++;else if(r.status==='UNRESOLVED')s.unresolved++;else if(r.status==='SETTLED'&&fields[r.result]){s.total++;s[fields[r.result]]++}else throw Error('UNKNOWN_MARKET_ROW_STATUS')}
 return s;
}
export function seedMarketAccounts(source){
 const all=seedFromLatestVerified(source),groups=new Map();
 for(const row of source.rows){const k=key(row);if(!k)throw Error('MARKET_KEY_MISSING');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row)}
 const accounts=Object.fromEntries([...groups].map(([k,rows])=>[k,seedFromLatestVerified({...counts(rows),rows,snapshotSavedAt:source.snapshotSavedAt})]));
 return {schema:1,all,accounts};
}
export function applyMarketTransition(book,oldRow,newRow,options={}){
 const k=key(newRow);if(!k||oldRow&&key(oldRow)!==k)throw Error('MARKET_KEY_MISSING_OR_CHANGED');
 const all=applyLedgerTransition(book.all,oldRow,newRow,options);
 if(all.mode.includes('REBUILD')||all.mode==='ALREADY_APPLIED')return {mode:all.mode,state:book};
 const current=Object.hasOwn(book.accounts,k)?book.accounts[k]:null;
 if(!current&&oldRow)throw Error('MARKET_BALANCE_MISSING');
 const account=current??seedFromLatestVerified({...counts([]),rows:[],snapshotSavedAt:options.at??Date.now()});
 const part=applyLedgerTransition(account,oldRow,newRow,options);
 if(part.mode!==all.mode)throw Error('MARKET_TRANSITION_MISMATCH');
 const state={schema:1,all:all.state,accounts:{...book.accounts,[k]:part.state}};
 for(const field of Object.keys(state.all.stats)){
  const sum=Object.values(state.accounts).reduce((n,a)=>n+a.stats[field],0);
  if(sum!==state.all.stats[field])throw Error('MARKET_TOTAL_MISMATCH_'+field);
 }
 return {mode:all.mode,state};
}
export function marketSnapshot(book){
 return {all:displaySnapshot(book.all),byMarket:Object.fromEntries(Object.entries(book.accounts).map(([k,v])=>[k,displaySnapshot(v)]))};
}
