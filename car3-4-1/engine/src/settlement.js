const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
function splitQuarterLine(value){const raw=num(value);if(raw===null)return[];const q=Math.round(raw*4)/4,idx=Math.round(q*4);return Math.abs(idx)%2===1?[(idx-1)/4,(idx+1)/4]:[q];}
function legResult(v){return v>1e-9?'W':v<-1e-9?'L':'P';}
function combineLegs(legs){if(!legs.length)return'VOID';const w=legs.filter(x=>x==='W').length,l=legs.filter(x=>x==='L').length,p=legs.filter(x=>x==='P').length;if(w===legs.length)return'FULL_WIN';if(l===legs.length)return'FULL_LOSS';if(p===legs.length)return'PUSH';if(w>0&&p>0&&l===0)return'HALF_WIN';if(l>0&&p>0&&w===0)return'HALF_LOSS';return'PUSH';}
function group(exact){return exact==='FULL_WIN'||exact==='HALF_WIN'?'WIN':exact==='FULL_LOSS'||exact==='HALF_LOSS'?'LOSS':exact==='PUSH'?'DRAW':exact==='PENDING'?'PENDING':'VOID';}
function netUnits(exact,odds){const d=num(odds);if(d===null||d<=0)return null;if(exact==='FULL_WIN')return Number((d-1).toFixed(6));if(exact==='HALF_WIN')return Number(((d-1)/2).toFixed(6));if(exact==='PUSH')return 0;if(exact==='HALF_LOSS')return-.5;if(exact==='FULL_LOSS')return-1;return null;}

export function settleSignal(record,finalScore,settledAt=new Date().toISOString()){
  if(!record||!finalScore)return{...record,result:'PENDING',resultGroup:'PENDING',settlementResult:'PENDING'};
  const fh=num(finalScore.home),fa=num(finalScore.away),eh=num(record.entryScore?.home),ea=num(record.entryScore?.away),line=num(record.selectedLine??record.line);
  if(fh===null||fa===null)return{...record,settledAt,finalScore,result:'VOID',resultGroup:'VOID',settlementResult:'VOID',settlementBasis:'INVALID_FINAL_SCORE',settlementNetUnits:null};
  if(eh===null||ea===null)return{...record,settledAt,finalScore,result:'VOID',resultGroup:'VOID',settlementResult:'VOID',settlementBasis:'MISSING_ENTRY_SCORE',settlementNetUnits:null};
  if(line===null)return{...record,settledAt,finalScore,result:'VOID',resultGroup:'VOID',settlementResult:'VOID',settlementBasis:'INVALID_LINE',settlementNetUnits:null};
  const homeAfter=fh-eh,awayAfter=fa-ea;
  if(homeAfter<0||awayAfter<0)return{...record,settledAt,finalScore,result:'VOID',resultGroup:'VOID',settlementResult:'VOID',settlementBasis:'ENTRY_SCORE_EXCEEDS_FINAL',settlementNetUnits:null};
  const selectedAway=String(record.selectedSide).toUpperCase()==='AWAY',selected=selectedAway?awayAfter:homeAfter,opponent=selectedAway?homeAfter:awayAfter,lines=splitQuarterLine(line),legs=lines.map(l=>({line:l,outcome:legResult(selected+l-opponent)})),exact=combineLegs(legs.map(x=>x.outcome)),resultGroup=group(exact);
  return{...record,settledAt,finalScore:{home:fh,away:fa},result:resultGroup,resultGroup,settlementResult:exact,settlementLegs:legs,settlementBasis:'BET365_INPLAY_POST_ENTRY',settlementScore:{home:homeAfter,away:awayAfter},settlementLine:line,settlementNetUnits:netUnits(exact,record.odds),settlement:'bet365_live_v4',settlementContract:'BET365_V4'};
}

export function summarizeHistory(records=[]){
  const settled=records.filter(r=>r.settledAt&&r.resultGroup!=='PENDING'),win=settled.filter(r=>r.resultGroup==='WIN').length,loss=settled.filter(r=>r.resultGroup==='LOSS').length,draw=settled.filter(r=>r.resultGroup==='DRAW').length,voids=settled.filter(r=>r.resultGroup==='VOID').length,pending=records.filter(r=>!r.settledAt||r.resultGroup==='PENDING').length,odds=settled.filter(r=>r.resultGroup!=='VOID').map(r=>num(r.odds)).filter(v=>v!==null&&v>0),averageOdds=odds.length?odds.reduce((a,b)=>a+b,0)/odds.length:0,net=settled.map(r=>num(r.settlementNetUnits)).filter(v=>v!==null).reduce((a,b)=>a+b,0);
  return{total:records.length,pending,settled:settled.length,win,loss,draw,void:voids,averageOdds:Number(averageOdds.toFixed(2)),winRate:Number((win+loss?win/(win+loss)*100:0).toFixed(2)),netUnits:Number(net.toFixed(4)),settlementContract:'BET365_V4'};
}
