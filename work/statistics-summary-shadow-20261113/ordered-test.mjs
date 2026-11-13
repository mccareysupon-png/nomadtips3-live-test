import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {financialBlock,mergeBlocks,emptyBlock,blockView} from './ordered-blocks.mjs';
const D='work/statistics-summary-shadow-20261113';
const source=await readFile(existsSync(D+'/source/active.json')?D+'/source/longterm-performance-343.js':D+'/reference/longterm-performance-343.js','utf8');
const grab=name=>{const match=source.match(new RegExp('function '+name+'\\([^\\n]+'));assert(match,'SOURCE_DRIFT_'+name);return match[0];};
const stats=new Function('outcome','num','dateMs',grab('settlement')+'\n'+grab('stats')+';return stats')(r=>String(r.result||'').toUpperCase(),x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null,x=>Number(x)||0);
const results=[];
async function test(name,fn){await fn();results.push({name,pass:true});}
const rows=n=>Array.from({length:n},(_,i)=>({id:'b'+i,status:'SETTLED',result:['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH'][i%5],odds:i%17?1.925:null,settledAt:1700000000000+i}));
const block=(list,start=0,g='stable')=>financialBlock(list.map((row,i)=>({position:start+i,row})),g);
function equal(actual,reference){for(const k of ['net','stake','priced','peak','maxDD','bestRun','roi'])if(reference[k]===null)assert.equal(actual[k],null,k);else assert(Math.abs(actual[k]-reference[k])<1e-7,k+':'+actual[k]+' != '+reference[k]);}
await test('bounded block equals current chronological financial function',()=>{for(const n of [0,1,50,499,500]){const r=rows(n);equal(blockView(block(r)),stats(r));}});
await test('merged 15000 rows equal original net, ROI, peak, drawdown and recovery',()=>{const r=rows(15000);let merged=emptyBlock('stable');for(let i=0;i<r.length;i+=500)merged=mergeBlocks(merged,block(r.slice(i,i+500),i));equal(blockView(merged),stats(r));});
await test('merge is associative within floating point tolerance',()=>{const r=rows(900),a=block(r.slice(0,300)),b=block(r.slice(300,600),300),c=block(r.slice(600),600);equal(blockView(mergeBlocks(mergeBlocks(a,b),c)),blockView(mergeBlocks(a,mergeBlocks(b,c))));});
await test('correction recomputes affected block and composed totals',()=>{const r=rows(1500),a=block(r.slice(0,500)),b=block(r.slice(500,1000),500),c=block(r.slice(1000),1000);r[700]={...r[700],result:'LOSS'};const corrected=block(r.slice(500,1000),500);equal(blockView(mergeBlocks(mergeBlocks(a,corrected),c)),stats(r));assert.notEqual(b.net,corrected.net);});
await test('cross-block peak to trough retains full drawdown',()=>{const a=[{status:'SETTLED',result:'WIN',odds:11}],b=Array.from({length:12},()=>({status:'SETTLED',result:'LOSS'}));equal(blockView(mergeBlocks(block(a),block(b,1))),stats([...a,...b]));});
await test('mixed generations, overlap and reversed order rejected',()=>{assert.throws(()=>mergeBlocks(block(rows(2)),block(rows(2),2,'other')),/GENERATION/);assert.throws(()=>mergeBlocks(block(rows(2)),block(rows(2),1)),/OVERLAP/);assert.throws(()=>mergeBlocks(block(rows(2),2),block(rows(2))),/REORDER/);});
await test('pending rows and blocks larger than 500 rejected',()=>{assert.throws(()=>block([{status:'PENDING'}]),/SETTLED/);assert.throws(()=>block(rows(501)),/BLOCK_BOUND/);});
await test('only net per day is insufficient for drawdown',()=>{const a=[{status:'SETTLED',result:'WIN',odds:2},{status:'SETTLED',result:'LOSS'}],b=[...a].reverse();assert.equal(block(a).net,block(b).net);assert.notEqual(block(a).max,block(b).max);});
await mkdir(D+'/qa',{recursive:true});await writeFile(D+'/qa/ordered.json',JSON.stringify({ok:true,checks:results.length,productionReady:false,results,limit:'Generated ordered rows and source formula parity; no actual Ledger tie-order/index integration or live heap measurement.'},null,2));console.log(JSON.stringify({ok:true,orderedChecks:results.length}));
