import assert from 'node:assert/strict';
import {patchStatisticsAsset,MARK} from './b46-statistics-inplace.mjs';
const r=await fetch('https://ball46.com/longterm-performance-343.js?source-audit='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(35000)});
assert(r.ok,'PRODUCTION_JS_HTTP_'+r.status);
const before=await r.text();
const after=patchStatisticsAsset(before);
assert(after.includes(MARK)&&after.length>before.length);
assert(after.includes("b46StatApply(shell,'<article"));
assert(after.includes("if(sh&&!sh.querySelector(':scope > .f46-card'))"));
assert(!after.includes("shell.innerHTML='<article"));
let jsValid=false;
try{
 new Function(after);
 jsValid=true;
}catch(error){throw Error('PATCH_JS_INVALID_'+error.message)}
assert(jsValid);
console.log('B46_STAT_PATCH_OFFLINE_PASS '+JSON.stringify({sourceBytes:before.length,patchBytes:after.length,marker:MARK,scriptParses:true,source:'https://ball46.com/longterm-performance-343.js'}));
