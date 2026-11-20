import assert from 'node:assert/strict';import fs from 'node:fs';import {evaluateBttsSignal} from './evaluate-btts-signal.mjs';import {evaluate1x2Signal} from './evaluate-1x2-signal.mjs';
// Explicitly read-only: only the isolated archived JSON snapshot. No provider calls.
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const daily=await fetch(host+'/preview-data',{signal:AbortSignal.timeout(15000)});assert(daily.ok);const archive=await daily.json();assert(archive.system==='BALL46_PREMATCH_ONLY');
const now=Math.floor(Date.now()/1000);
const report={source:'isolated stored snapshot',providerCalls:0,productionWrites:0,stored:archive.stored,teams:archive.teams,teamsWith10:archive.teamsWith10,actualUpcoming:archive.selection?.rows?.length??0,actualCompared:0,rows:[],blocked:[]};
const supplied=process.env.REAL_INPUT_FILE;
if(supplied){
 const bundle=JSON.parse(fs.readFileSync(supplied,'utf8'));assert(Array.isArray(bundle.fixtures));
 for(const f of bundle.fixtures.slice(0,10)){
 const r={fixtureId:f.fixtureId,btts:evaluateBttsSignal(f,{enabled:true}),oneX2:evaluate1x2Signal(f,{enabled:true})};
 report.rows.push(r);if(r.btts.metrics&&r.oneX2.metrics)report.actualCompared++;
 }
}else{
 const candidates=archive.selection?.rows??[];
 for(const f of candidates.filter(x=>x.kickoff>now).slice(0,10)){
 const input={homeLast10:f.homeLast10,awayLast10:f.awayLast10,odds:f.odds,asOf:now,kickoff:f.kickoff};
 report.rows.push({fixtureId:f.fixtureId,home:f.home,away:f.away,homeCount:f.homeCount,awayCount:f.awayCount,btts:evaluateBttsSignal(input,{enabled:true}),oneX2:evaluate1x2Signal(input,{enabled:true})});
 }
 report.blocked.push('No stored combined ten-match histories and Bet365 prices are exposed by this isolated archive snapshot.');
}
report.state=report.actualCompared>=5?'DRY_RUN_COMPLETE':'REAL_INPUT_INCOMPLETE';
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/pure-signals-real.json',JSON.stringify(report,null,2));console.log('PURE_REAL_COMPARE '+JSON.stringify(report));
