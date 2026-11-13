import {unitSettlement} from './summary.mjs';
function check(ok,message){if(!ok)throw Error(message);}
export function emptyBlock(generation){
 return {generation,first:null,last:null,rows:0,net:0,stake:0,priced:0,min:0,max:0,maxDD:0,bestRun:0};
}
// Positions must come from the existing chronological comparator, including its
// tie order, in ONE stable source generation. Never sort by a new ID rule.
export function financialBlock(entries,generation){
 check(typeof generation==='string'&&generation.length>0,'GENERATION_REQUIRED');
 check(Array.isArray(entries)&&entries.length<=500,'BLOCK_BOUND');
 const b=emptyBlock(generation);
 for(const {position,row} of entries){
  check(Number.isSafeInteger(position)&&position>=0&&(b.last===null||position>b.last),'ORDER_REQUIRED');
  check(row?.status==='SETTLED','SETTLED_ROWS_REQUIRED');
  b.first??=position;b.last=position;b.rows++;
  const s=unitSettlement(row);if(!s.priced)continue;
  b.net+=s.profit;b.stake+=s.stake;b.priced++;
  b.max=Math.max(b.max,b.net);b.maxDD=Math.max(b.maxDD,b.max-b.net);
  b.min=Math.min(b.min,b.net);b.bestRun=Math.max(b.bestRun,b.net-b.min);
 }
 return b;
}
export function mergeBlocks(left,right){
 check(left.generation===right.generation,'GENERATION_MISMATCH');
 if(left.rows===0)return {...right};if(right.rows===0)return {...left};
 check(left.last<right.first,'OVERLAP_OR_REORDER');
 return {generation:left.generation,first:left.first,last:right.last,rows:left.rows+right.rows,
  net:left.net+right.net,stake:left.stake+right.stake,priced:left.priced+right.priced,
  min:Math.min(left.min,left.net+right.min),max:Math.max(left.max,left.net+right.max),
  maxDD:Math.max(left.maxDD,right.maxDD,left.max-left.net-right.min),
  bestRun:Math.max(left.bestRun,right.bestRun,left.net+right.max-left.min)};
}
export function blockView(b){return {...b,peak:b.max,roi:b.stake?b.net/b.stake*100:null};}
