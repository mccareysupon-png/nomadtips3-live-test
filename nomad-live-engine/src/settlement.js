const EPS=1e-9;
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
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
function sideDiff(selection,score){
  return selection==='home'?Number(score.home)-Number(score.away):Number(score.away)-Number(score.home);
}
export function settleAsian(signal, finalScore){
  const finalValid=finite(finalScore?.home)&&finite(finalScore?.away);
  if(!finalValid) return {result:'PENDING',profit:0,legs:[],settlementScope:'INVALID_FINAL_SCORE'};
  const hasEntry=finite(signal?.entryScore?.home)&&finite(signal?.entryScore?.away);
  const finalDiff=sideDiff(signal.selection,finalScore);
  const entryDiff=hasEntry?sideDiff(signal.selection,signal.entryScore):0;
  // In-play Asian Handicap ignores goals scored before the bet was placed.
  // Therefore settle on the score movement after entry, not the full-time score differential.
  const base=finalDiff-entryDiff;
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
  const postEntryScore=hasEntry?{
    home:Number(finalScore.home)-Number(signal.entryScore.home),
    away:Number(finalScore.away)-Number(signal.entryScore.away),
  }:null;
  return {
    result,profit:Number(profit.toFixed(4)),legs,
    settlementScope:hasEntry?'LIVE_POST_ENTRY':'FULL_MATCH_FALLBACK',
    settlementRuleVersion:2,
    postEntryScore,
  };
}
