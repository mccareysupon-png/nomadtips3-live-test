// TEST-only atomic fix to ensure Dot's KV snapshot expires based on actual scheduled Risk Guard completion.
import assert from 'node:assert/strict';
export function patchDotKvFreshness(source){
 const old="staleAfter:new Date(Date.now()+35*60*1000).toISOString()";
 const updated="staleAfter:new Date(Date.parse(report.freshness.cronCompletedAt)+35*60*1000).toISOString()";
 assert.equal(source.split(old).length-1,1,'UNEXPECTED_SNAPSHOT_STALE_ANCHOR');
 assert(source.includes('B46_DOT_PRIVATE_KV_CRON_EXPORT_V1'),'PRIVATE_KV_PATCH_MISSING');
 return source.replace(old,updated);
}
