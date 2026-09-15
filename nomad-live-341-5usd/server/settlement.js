const n=v=>Number.isFinite(Number(v))?Number(v):null;
function settleLeg(selection,line,entryScore,finalScore){
  const home=n(finalScore?.home)??0,away=n(finalScore?.away)??0;
  const margin=selection==='away'?(away-home):(home-away);
  const adjusted=margin+(n(line)??0);
  return adjusted>0?{result:'WIN',units:1}:adjusted<0?{result:'LOSS',units:-1}:{result:'PUSH',units:0};
}
function splitLine(line){
  const value=n(line);if(value==null)return [];
  const q=Math.round(value*4);
  if(Math.abs(q)%2===1)return [(q-1)/4,(q+1)/4];
  return [value];
}
export function settleAsianHandicap({selection='home',line,odds,entryScore,finalScore}){
  const legs=splitLine(line);if(!legs.length)return {result:'UNSETTLED',units:null};
  const settled=legs.map(l=>settleLeg(selection,l,entryScore,finalScore));
  const stake=1/settled.length;
  let profit=0;
  for(const leg of settled){if(leg.result==='WIN')profit+=(Math.max(1,n(odds)??1)-1)*stake;else if(leg.result==='LOSS')profit-=stake;}
  const wins=settled.filter(x=>x.result==='WIN').length,losses=settled.filter(x=>x.result==='LOSS').length,pushes=settled.length-wins-losses;
  let result='PUSH';
  if(wins===settled.length)result='WIN';else if(losses===settled.length)result='LOSS';else if(wins&&pushes)result='HALF_WIN';else if(losses&&pushes)result='HALF_LOSS';else if(wins&&losses)result='PUSH';
  return {result,units:+profit.toFixed(3),legs};
}
