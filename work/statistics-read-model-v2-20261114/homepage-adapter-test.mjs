import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {patchHomepageStatistics,patchScorebarStatistics} from './homepage-statistics-adapter.mjs';
import {buildCurrentFormulas} from './build-current-formulas.mjs';
const base=new URL('./qa/live-base/',import.meta.url);
test('Homepage change touches only its Statistics consumer, with byte-reversal guard',async()=>{
 const html=await readFile(new URL('index.html',base),'utf8'),p=patchHomepageStatistics(html);
 assert(!p.includes("data!==api.getSnapshot()"));assert(p.includes('data!==api.peekSummary()'));assert(p.includes("ball46:statistics-fast-summary"));
 assert.deepEqual([...p.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[0]),[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[0]));
 for(const m of p.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(/json/i.test(m[1]))JSON.parse(m[2]);else new vm.Script(m[2]);}
});
test('Dashboard no longer requests complete statistics for four results',async()=>{
 const original=await readFile(new URL('scorebar.js',base),'utf8'),p=patchScorebarStatistics(original);new vm.Script(p);
 assert(!p.includes('await window.BALL46_STATISTICS_DATA.load()'));assert(p.includes('j.recentSettled'));assert(p.includes("window.BALL46_STATISTICS_FAST.getSummary()"));
});
test('Current London daily formulas are extracted without alteration',async()=>{
 const proof=await buildCurrentFormulas(),{formulas}=await import('./qa/current-formulas.mjs');assert.equal(proof.formulaChanges,0);
 const createdAt=Date.now(),rows=[{id:'w',status:'SETTLED',result:'HALF_WIN',odds:1.9,createdAt},{id:'l',status:'SETTLED',result:'LOSS',odds:2,createdAt},{id:'p',status:'PENDING',createdAt,odds:1.8}];
 const d=formulas.aggregate(rows);assert.equal(d.today.win,1);assert.equal(d.today.loss,1);assert.equal(d.today.pending,1);assert.equal(formulas.rate(d.today),'50%');
});
