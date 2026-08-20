const EPS=1e-9;
function splitLine(line){
  const q=Math.round(line*4);
  if(Math.abs(line*4-q)>EPS) return [line];
  if(Math.abs(q)%2===1) return [(q-1)/4,(q+1)/4];
  return [line];
}
function leg(diff,line){
  const v=diff+line;
  if(v>EPS) return 'WIN';
  if(v<-EPS) return 'LOSS';
  return 'PUSH';
}
export function settleAsian(signal, finalScore){
  const base=signal.selection==='home'?finalScore.home-finalScore.away:finalScore.away-finalScore.home;
  const legs=splitLine(signal.line).map(x=>leg(base,x));
  let profit=0;
  for(const r of legs){
    const stake=1/legs.length;
    if(r==='WIN') profit+=stake*(signal.odds-1);
    if(r==='LOSS') profit-=stake;
  }
  let result;
  if(legs.every(x=>x==='WIN')) result='WIN';
  else if(legs.every(x=>x==='LOSS')) result='LOSS';
  else if(legs.every(x=>x==='PUSH')) result='PUSH';
  else if(legs.includes('WIN')&&legs.includes('PUSH')) result='HALF WIN';
  else if(legs.includes('LOSS')&&legs.includes('PUSH')) result='HALF LOSS';
  else result=profit>EPS?'WIN':profit<-EPS?'LOSS':'PUSH';
  return {result,profit:Number(profit.toFixed(4)),legs};
}
