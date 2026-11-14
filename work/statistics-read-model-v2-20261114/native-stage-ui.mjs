import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const DIR='work/statistics-summary-shadow-20261113/qa/ui-capture',OUT='work/statistics-read-model-v2-20261114/qa';
const sha=b=>createHash('sha256').update(b).digest('hex');
function once(source,before,after,label){assert.equal(source.split(before).length,2,'CURRENT_UI_DRIFT:'+label);return source.replace(before,()=>after)}
function region(source,start,end,after,label){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert(a>=0&&b>a&&source.indexOf(start,a+1)<0,'CURRENT_UI_REGION_DRIFT:'+label);
 return source.slice(0,a)+after+'\n'+source.slice(b);
}
export function patchActualStatistics(workspace){
 let w=workspace;
 w=once(w,'statsLoadedAt:0};','statsLoadedAt:0};','Stable original state signature');
 w=region(w,'function marketCounts(){','function currentMarket(){',String.raw