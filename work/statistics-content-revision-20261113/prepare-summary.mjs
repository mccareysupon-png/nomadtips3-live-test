import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const D='work/statistics-content-revision-20261113',UP='work/statistics-summary-shadow-20261113';
// Local upstream mirror is pinned to the handoff; CI uses the checked-out TEST source.
let s;try{s=await readFile(D+'/upstream/bounded-summary.mjs','utf8')}catch{s=await readFile(UP+'/bounded-summary.mjs','utf8')}
function one(a,b){assert.equal(s.split(a).length,2,'REDUCER_SOURCE_DRIFT:'+a.slice(0,65));s=s.replace(a,()=>b)}
one("export const generation=m=>JSON.stringify([m.ledgerTotal,m.total??m.settledTotal,m.pending,m.unresolved,m.win,m.loss,m.push,m.halfWin,m.halfLoss,m.ledgerUpdatedAt??m.updatedAt,m.byMarket]);",`export function contentRevision(m){const r=Number(m.contentRevision??m.statisticsContentRevision);if(!Number.isSafeInteger(r)||r<0)throw Error('CONTENT_REVISION_REQUIRED');return r}
export const generation=m=>JSON.stringify([contentRevision(m),m.ledgerTotal,m.total??m.settledTotal,m.pending,m.unresolved,m.win,m.loss,m.push,m.halfWin,m.halfLoss,Object.entries(m.byMarket||{}).sort(([a],[b])=>a.localeCompare(b))]);`);
one('{now=Date.now(),budgetMs=25000}={}', '{now=Date.now(),budgetMs=25000,onPage=null}={}');
one("const recentSettled=[];let firstDay=null,lastDay=null,pages=0,maxPageRows=0,cursor='stat:v2:row:\\uffff';const seenCursors=new Set();const pinned=String(before.updatedAt);", "const recentSettled=[];let metadata=null,firstDay=null,lastDay=null,pages=0,maxPageRows=0,cursor='stat:v2:row:\\uffff';const seenCursors=new Set(),seenIds=new Set();const pinned=String(contentRevision(before));");
one("{paged:'1',cursor,limit:'2000',generation:pinned}","{paged:'1',cursor,limit:'2000',generation:pinned,consistency:'content-v1'}");
one("check(String(page.statisticsGeneration??page.ledgerUpdatedAt)===pinned,'SOURCE_CHANGED');","check(String(contentRevision(page))===pinned,'SOURCE_CHANGED');if(!metadata){const {rows,nextCursor,hasMore,returned,...rest}=page;metadata=rest;}");
one("check(typeof row.id==='string'&&row.id.length>0,'ROW_ID');actual.ledgerTotal++;", "check(typeof row.id==='string'&&row.id.length>0,'ROW_ID');check(!seenIds.has(row.id),'DUPLICATE_SOURCE_ID');seenIds.add(row.id);check(seenIds.size<=100000,'SOURCE_ROW_BUDGET');actual.ledgerTotal++;");
one("  if(!page.nextCursor){", "  if(onPage)await onPage(page.rows,metadata);\n  if(!page.nextCursor){");
one("check(generation(await read('/ledger-health'))===sig,'SOURCE_CHANGED');", "const after=await read('/ledger-health');check(generation(after)===sig,'SOURCE_CHANGED');");
one("const asOf=Number(before.updatedAt);", "const asOf=Number(after.updatedAt);");
one("const data={ok:true,mode:'LIVE_SUMMARY',", "const data={ok:true,contentRevision:contentRevision(after),mode:'LIVE_SUMMARY',");
one("return {data,signature:sig,proof:","return {data,metadata:{...metadata,ledgerUpdatedAt:asOf},signature:sig,proof:");
await writeFile(D+'/bounded-summary.mjs',s);console.log('Prepared revision-aware reducer without changing bucket/formula loops.');
