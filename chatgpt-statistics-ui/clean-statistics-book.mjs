// NEW isolated statistics book: no dependency on historical Ledger.
// net is fixed-point micro-units. Opening balance must be verified externally.
export function contribution(row){if(!row||row.status!=="SETTLED")return {win:0,loss:0,push:0,halfWin:0,halfLoss:0,net:0,stake:0};const map={WIN:"win",LOSS:"loss",PUSH:"push",HALF_WIN:"halfWin",HALF_LOSS:"halfLoss"};const k=map[row.result];if(!k)throw Error("invalid result");const odds=Number(row.odds);if((k==="win"||k==="halfWin")&&(!Number.isFinite(odds)||odds<=1))throw Error("invalid odds");return {win:0,loss:0,push:0,halfWin:0,halfLoss:0,[k]:1,net:k==="win"?Math.round((odds-1)*1e6):k==="halfWin"?Math.round((odds-1)*5e5):k==="loss"?-1e6:k==="halfLoss"?-5e5:0,stake:1}}
export function apply(balance,oldRow,newRow){const a=contribution(oldRow),b=contribution(newRow),next={...balance};for(const k of Object.keys(a)){next[k]=(next[k]??0)+b[k]-a[k];if(!Number.isSafeInteger(next[k])||(k!=="net"&&next[k]<0))throw Error("invalid balance "+k)}return next}
export function display(b){const win=b.win+b.halfWin,loss=b.loss+b.halfLoss;return {...b,wins:win,losses:loss,total:win+loss+b.push,netProfit:b.net/1e6,winRate:win+loss?(b.win+b.halfWin*.5)/(win+loss)*100:0,roi:b.stake?b.net/1e6/b.stake*100:0}}

export class CleanStatisticsBook {
 constructor(ctx){this.storage=ctx.storage}
 async seed(opening){return this.storage.transaction(async tx=>{
  if(await tx.get('balance'))throw Error('already seeded');
  if(!opening.sourceRevision||!Number.isSafeInteger(opening.sequence)||opening.sequence<0)throw Error('verified opening revision required');
  const balance=apply(opening.balance,null,null);
  if(balance.stake!==balance.win+balance.loss+balance.push+balance.halfWin+balance.halfLoss)throw Error('opening stake mismatch');
  await tx.put('balance',{...opening,balance});return display(balance);
 })}
 async post(event){return this.storage.transaction(async tx=>{
  const state=await tx.get('balance');if(!state)throw Error('not seeded');
  if(!event.id||!event.signalId||!Number.isSafeInteger(event.sequence)||!event.newRow||event.newRow.status!=='SETTLED')throw Error('invalid event');
  const marker='event:'+event.id;const prior=await tx.get(marker);
  if(prior!==undefined){if(prior!==JSON.stringify(event))throw Error('event id conflict');return {duplicate:true,...display(state.balance)}}
  if(event.sequence!==state.sequence+1)throw Error('sequence gap or stale event');
  const key='signal:'+event.signalId;const posted=await tx.get(key);
  if(posted&&JSON.stringify(posted)!==JSON.stringify(event.oldRow))throw Error('old result mismatch');
  if(event.oldRow?.status==='SETTLED'&&(!event.correction||!event.reason))throw Error('explicit correction required');
  if(!posted&&event.oldRow?.status==='SETTLED'&&!event.correction)throw Error('historical result immutable');
  const balance=apply(state.balance,event.oldRow,event.newRow);
  await tx.put('balance',{...state,balance,sequence:event.sequence});
  await tx.put(key,event.newRow);await tx.put(marker,JSON.stringify(event));
  return display(balance);
 })}
 async read(){const state=await this.storage.get('balance');if(!state)throw Error('not seeded');return {...display(state.balance),sequence:state.sequence,sourceRevision:state.sourceRevision}}
}
