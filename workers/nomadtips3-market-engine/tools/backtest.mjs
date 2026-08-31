import fs from 'node:fs';
import { settleAsianHandicap, settleTotal, oneXtwoOutcome } from '../src/settle.js';

function empty(){return {decisions:0,winEquivalent:0,lossEquivalent:0,pushes:0,strongDecisions:0,strongWinEquivalent:0,strongLossEquivalent:0}}
function add(bucket,score,strength){
  if(!Number.isFinite(score))return;
  bucket.decisions++;
  if(score>0)bucket.winEquivalent+=score;else if(score<0)bucket.lossEquivalent+=-score;else bucket.pushes++;
  if(String(strength).toUpperCase()==='STRONG'){
    bucket.strongDecisions++;
    if(score>0)bucket.strongWinEquivalent+=score;else if(score<0)bucket.strongLossEquivalent+=-score;
  }
}
function pct(win,loss){const d=win+loss;return d>0?Number((win/d*100).toFixed(1)):null}
function finish(bucket){return {...bucket,hitRate:pct(bucket.winEquivalent,bucket.lossEquivalent),strongHitRate:pct(bucket.strongWinEquivalent,bucket.strongLossEquivalent)}}

export function backtest(samples=[]){
  const ah=empty(),oneXtwo=empty(),totals=empty();
  for(const sample of samples){
    const h=Number(sample?.homeGoals),a=Number(sample?.awayGoals),cons=sample?.consensus||{},main=sample?.main||{};
    const ahSide=String(cons?.ah?.side||'MIXED').toUpperCase();
    if(['HOME','AWAY'].includes(ahSide)&&Number.isFinite(Number(main?.ah?.line))){
      const settled=settleAsianHandicap(h,a,Number(main.ah.line));
      if(settled)add(ah,ahSide==='HOME'?settled.score:-settled.score,cons?.ah?.strength);
    }
    const oneSide=String(cons?.oneXtwo?.side||'MIXED').toUpperCase();
    if(['HOME','DRAW','AWAY'].includes(oneSide)){
      const actual=oneXtwoOutcome(h,a);if(actual)add(oneXtwo,actual===oneSide?1:-1,cons?.oneXtwo?.strength);
    }
    const totalSide=String(cons?.totals?.side||'MIXED').toUpperCase();
    if(['OVER','UNDER'].includes(totalSide)&&Number.isFinite(Number(main?.totals?.line))){
      const settled=settleTotal(h,a,Number(main.totals.line),totalSide);if(settled)add(totals,settled.score,cons?.totals?.strength);
    }
  }
  return {samples:samples.length,ah:finish(ah),oneXtwo:finish(oneXtwo),totals:finish(totals)};
}

function main(){
  const path=process.argv[2];
  if(!path){console.error('Usage: node tools/backtest.mjs <market-history.json>');process.exitCode=2;return}
  const parsed=JSON.parse(fs.readFileSync(path,'utf8'));
  const samples=Array.isArray(parsed)?parsed:Array.isArray(parsed?.samples)?parsed.samples:[];
  const report=backtest(samples);
  console.log(JSON.stringify(report,null,2));
  if(!samples.length)process.exitCode=3;
}

if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g,'/')))main();
