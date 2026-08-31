function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function cleanZero(value){return Object.is(value,-0)?0:value}

export function splitQuarterLine(line){
  const n=finite(line);if(n===null)return [];
  const q=cleanZero(Math.round(n*4)/4);
  const frac=Math.abs(q*4)%2;
  if(frac===0)return [q];
  const lower=cleanZero(Math.floor(q*2)/2);
  const upper=cleanZero(Math.ceil(q*2)/2);
  return lower===upper?[q]:[lower,upper];
}

function settleComponent(value){return value>0?1:value<0?-1:0}

export function settleAsianHandicap(homeGoals,awayGoals,homeLine){
  const h=finite(homeGoals),a=finite(awayGoals),parts=splitQuarterLine(homeLine);
  if(h===null||a===null||!parts.length)return null;
  const legs=parts.map(line=>settleComponent((h+line)-a));
  const score=legs.reduce((sum,x)=>sum+x,0)/legs.length;
  const label=score===1?'WIN':score===.5?'HALF_WIN':score===0?'PUSH':score===-.5?'HALF_LOSS':'LOSS';
  return {score,label,legs,parts};
}

export function settleTotal(homeGoals,awayGoals,totalLine,side='OVER'){
  const h=finite(homeGoals),a=finite(awayGoals),parts=splitQuarterLine(totalLine);
  if(h===null||a===null||!parts.length)return null;
  const total=h+a,over=String(side).toUpperCase()!=='UNDER';
  const legs=parts.map(line=>settleComponent(over?total-line:line-total));
  const score=legs.reduce((sum,x)=>sum+x,0)/legs.length;
  const label=score===1?'WIN':score===.5?'HALF_WIN':score===0?'PUSH':score===-.5?'HALF_LOSS':'LOSS';
  return {score,label,legs,parts,total};
}

export function oneXtwoOutcome(homeGoals,awayGoals){
  const h=finite(homeGoals),a=finite(awayGoals);if(h===null||a===null)return null;
  return h>a?'HOME':h<a?'AWAY':'DRAW';
}
