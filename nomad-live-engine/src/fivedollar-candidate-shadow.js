import {buildRollingAnalysis,evaluate} from './detector.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

export function appendNativeFixtureHistory(history=[],fixture,observedAt=Date.now(),limit=40){
  if(!finite(fixture?.minute)) return [...history];
  const minute=Number(fixture.minute);
  const snapshot={observedAt,minute,stats:clone(fixture?.stats||{})};
  const next=(Array.isArray(history)?history:[])
    .filter(item=>finite(item?.minute)&&Number(item.minute)!==minute)
    .concat(snapshot)
    .sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt)-Number(b.observedAt));
  return next.slice(-Math.max(3,Number(limit)||40));
}

function publicFixtureName(value){
  if(value&&typeof value==='object') return value.name??value.id??null;
  return value??null;
}

export function buildNativeCandidateShadow(fixtures=[],historyByFixture={},config,observedAt=Date.now()){
  const nextHistory={};
  const rows=[];
  for(const fixture of Array.isArray(fixtures)?fixtures:[]){
    if(!fixture?.fixtureId||fixture?.boardState!=='live') continue;
    const id=String(fixture.fixtureId);
    const history=appendNativeFixtureHistory(historyByFixture?.[id]||[],fixture,observedAt);
    nextHistory[id]=history;
    const rolling=buildRollingAnalysis(history,config);
    const base={
      id,
      fixtureId:id,
      league:publicFixtureName(fixture.league),
      home:publicFixtureName(fixture.home),
      away:publicFixtureName(fixture.away),
      minute:finite(fixture.minute)?Number(fixture.minute):null,
      score:clone(fixture.score||{home:null,away:null}),
      stats:clone(fixture.stats||{}),
      rolling,
      freshness:{sourceStale:false},
    };
    const assessment=evaluate(base,config,null,observedAt);
    rows.push({
      fixtureId:id,
      league:base.league,
      home:base.home,
      away:base.away,
      minute:base.minute,
      score:base.score,
      stats:clone(base.stats),
      rolling:clone(rolling),
      state:assessment.state,
      side:assessment.side,
      detectionPassed:Boolean(assessment.detectionPassed),
      checks:clone(assessment.checks||{}),
      passed:Number.isFinite(Number(assessment.passed))?Number(assessment.passed):0,
      total:Number.isFinite(Number(assessment.total))?Number(assessment.total):6,
      rollingAvailable:Boolean(rolling?.available),
      rollingReason:rolling?.available?null:rolling?.reason??'unknown',
      hunger:clone(assessment.hunger),
      evidence:clone(assessment.evidence),
      sidePressureShare:Number.isFinite(Number(assessment.sidePressureShare))?Number(assessment.sidePressureShare):null,
    });
  }
  const candidates=rows.filter(row=>row.detectionPassed);
  return {
    updatedAt:observedAt,
    history:nextHistory,
    rows,
    candidates,
    summary:{live:rows.length,candidates:candidates.length,historyFixtures:Object.keys(nextHistory).length},
  };
}
