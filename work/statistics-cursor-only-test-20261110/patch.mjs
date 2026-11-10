import assert from 'node:assert/strict';
export function patchWorkspace(source){
 const start=source.indexOf('async function directAll() {'),end=source.indexOf('async function readAll() {',start);
 const attempt="  try { return await directAll(); } catch (error) { console.warn('Statistics direct read fallback', error?.message || error); }\n";
 assert(start>=0&&end>start,'DIRECT_READER_SOURCE_DRIFT');assert.equal(source.split(attempt).length,2,'DIRECT_ATTEMPT_DRIFT');
 const removed=source.slice(start,end);const next=source.slice(0,start)+source.slice(end).replace(attempt,'');
 assert.equal(next.replace('async function readAll() {\n',removed+'async function readAll() {\n'+attempt),source,'UNRELATED_BYTES_CHANGED');
 return next;
}
