const val=(x,k)=>x?.[k];
const finite=x=>Number.isFinite(Number(x));
const diff=(p,side)=>finite(val(p,'home'))&&finite(val(p,'away')) ? (side==='home'?p.home-p.away:p.away-p.home) : null;
const ratio=(p,side)=>{
  if(!finite(p?.home)||!finite(p?.away)) return null;
  const own=side==='home'?p.home:p.away, opp=side==='home'?p.away:p.home;
  return opp===0 ? (own>0?99:1) : own/opp;
};

export function computeMomentum(stats, side){
  let score=0, weight=0;
  const add=(w,v)=>{if(v==null||!Number.isFinite(v))return;score+=w*Math.max(0,Math.min(1,v));weight+=w;};
  const daD=diff(stats.dangerousAttack,side), daR=ratio(stats.dangerousAttack,side);
  const sotD=diff(stats.shotsOn,side), atkD=diff(stats.attacks,side), corD=diff(stats.corners,side);
  const possD=diff(stats.possession,side);
  add(32, daD==null?null:daD/25);
  add(18, daR==null?null:(daR-1)/0.8);
  add(22, sotD==null?null:sotD/5);
  add(14, atkD==null?null:atkD/35);
  add(8, corD==null?null:corD/5);
  add(6, possD==null?null:possD/18);
  return weight?Math.round((score/weight)*100):null;
}

export function chooseSide(stats){
  const home=computeMomentum(stats,'home'), away=computeMomentum(stats,'away');
  if(home==null&&away==null) return null;
  return (home??-1)>=(away??-1)?'home':'away';
}

export function evaluate(match, config, market=null){
  const side=chooseSide(match.stats);
  if(!side) return {state:'WATCHING',side:null,momentum:null,passed:0,total:5,checks:{minute:false,score:false,evidence:false,momentum:false,market:false},evidence:null};

  const momentum=computeMomentum(match.stats,side);
  const ownScore=side==='home'?match.score.home:match.score.away;
  const oppScore=side==='home'?match.score.away:match.score.home;
  const attackDiff=diff(match.stats.attacks,side);
  const daDiff=diff(match.stats.dangerousAttack,side);
  const daRatio=ratio(match.stats.dangerousAttack,side);
  const sotOwn=side==='home'?match.stats.shotsOn.home:match.stats.shotsOn.away;
  const sotDiff=diff(match.stats.shotsOn,side);
  const cornersOwn=side==='home'?match.stats.corners.home:match.stats.corners.away;

  const evidenceChecks={
    attack:attackDiff!=null&&attackDiff>=config.attackDifference,
    danger:daDiff!=null&&daDiff>=config.dangerousAttackDifference&&daRatio!=null&&daRatio>=config.dangerousAttackRatio,
    shots:finite(sotOwn)&&sotOwn>=config.shotsOnTargetMinimum&&sotDiff!=null&&sotDiff>=config.shotsOnTargetDifference,
    corners:finite(cornersOwn)&&cornersOwn>=config.cornersMinimum,
  };
  const evidencePassedCount=Object.values(evidenceChecks).filter(Boolean).length;
  const evidenceRequired=config.evidenceRequired==='ALL'?4:Number(config.evidenceRequired||1);
  const evidenceOk=config.attackEvidenceEnabled===false || evidencePassedCount>=evidenceRequired;
  const evidence={enabled:config.attackEvidenceEnabled!==false,required:config.evidenceRequired??1,passedCount:evidencePassedCount,total:4,checks:evidenceChecks};

  const checks=[
    ['minute',finite(match.minute)&&match.minute>=config.minuteFrom&&match.minute<=config.minuteTo],
    ['score',finite(ownScore)&&finite(oppScore)&&Math.abs(ownScore-oppScore)<=config.maxScoreDifference],
    ['evidence',evidenceOk],
    ['momentum',momentum!=null&&momentum>=config.momentumMinimum],
  ];

  let marketOk=false;
  let selectionLine=null, selectionOdds=null;
  if(market){
    selectionLine=side==='home'?market.line:-market.line;
    selectionOdds=side==='home'?market.homeOdds:market.awayOdds;
    marketOk=config.allowedSelectionLines.some(x=>Math.abs(x-selectionLine)<1e-9)&&selectionOdds>=config.oddsMinimum&&selectionOdds<=config.oddsMaximum;
  }
  checks.push(['market',marketOk]);

  const corePassed=checks.slice(0,4).filter(([,ok])=>ok).length;
  const passed=checks.filter(([,ok])=>ok).length;
  const state=corePassed===4?(marketOk?'SIGNAL':'NEAR SIGNAL'):'WATCHING';
  return {state,side,momentum,passed,total:5,checks:Object.fromEntries(checks),evidence,selectionLine,selectionOdds};
}
