import assert from 'node:assert/strict';
export const MARKER='B46_STATISTICS_MENU_SINGLE_OWNER_20261114';
// Workspace already counts the complete validated ledgerRows. Remove the
// competing settled-only painter and its redundant 15-second metadata poll.
// Signal counts and Event Flow code remain byte-for-byte unchanged.
export function patchMenu(source){
 if(source.includes(MARKER))return source;
 const start=source.indexOf('function paintStatCounts('),end=source.indexOf("window.addEventListener('ball46:signals-snapshot'",start);assert(start>=0&&end>start,'MENU_OWNER_SOURCE_DRIFT');
 const block=source.slice(start,end);assert(block.includes('function paintStatSummary(')&&block.includes("k!=='1x2'&&k!=='ah'"));
 let s=source.slice(0,start)+'/* '+MARKER+': complete-snapshot counts are owned by Workspace. */\n'+source.slice(end);
 const listener="document.addEventListener('ball46:statistics-snapshot',e=>paintStatCounts(e.detail.rows,e.detail.ledgerTotal));\n",poll='loadStatCountsOnce();setInterval(refreshStatCounts,15000);';
 assert.equal(s.split(listener).length,2);assert.equal(s.split(poll).length,2);s=s.replace(listener,'').replace(poll,'');
 assert.equal(s.replace('/* '+MARKER+': complete-snapshot counts are owned by Workspace. */\n',block).replace('function init(){','function init(){'+poll).replace('function init(){',listener+'function init(){'),source,'UNRELATED_SYNC_BYTES_CHANGED');return s;
}
