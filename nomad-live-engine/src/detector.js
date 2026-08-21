const val=(x,k)=>x?.[k];
const finite=x=>Number.isFinite(Number(x));
const diff=(p,side)=>finite(val(p,'home'))&&finite(val(p,'away')) ? (side==='home'?p.home-p.away:p.away-p.home) : null;
const ratio=(p,side)=>{
  if(!finite(p?.home)||!finite(p?.away)) return null;
  const own=side==='home'?p.home:p.away, opp=side==='home'?p.away:p.home;
  return opp===0 ? (own>0?99:1) : own/opp;
};
const own=(p,side)=>finite(p?.[side])?Number(p[side]):null;
const totalShotsPair=stats=>({
  home:(finite(stats?.shotsOn?.home)||finite(stats?.shotsOff?.home))?(Number(stats?.shotsOn?.home||0)+Number(stats?.shotsOff?.home||0)):null,
  away:(finite(stats?.shotsOn?.away)||finite(stats?.shotsOff?.away))?(Number(stats?.shotsOn?.away||0)+Number(stats?.shotsOff?.away||0)):null,
});

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
  const shotsDiff=diff(totalShotsPair(match.stats),side);
  const sotOwn=own(match.stats.shotsOn,side);
  const sotDiff=diff(match.stats.shotsOn,side);
  const cornersOwn=own(match.stats.corners,side);

  const evidenceItems=[
    {key:'attack',enabled:config.evidenceAttackEnabled!==false,ok:attackDiff!=null&&attackDiff>=config.attackDifference},
    {key:'danger',enabled:config.evidenceDangerousAttackEnabled!==false,ok:daDiff!=null&&daDiff>=config.dangerousAttackDifference&&daRatio!=null&&daRatio>=config.dangerousAttackRatio},
    {key:'shots',enabled:config.evidenceShotsEnabled!==false,ok:shotsDiff!=null&&shotsDiff>=config.shotsDifference},
    {key:'shotsOnTarget',enabled:config.evidenceShotsOnTargetEnabled!==false,ok:finite(sotOwn)&&sotOwn>=config.shotsOnTargetMinimum&&sotDiff!=null&&sotDiff>=config.shotsOnTargetDifference},
    {key:'corners',enabled:config.evidenceCornersEnabled!==false,ok:finite(cornersOwn)&&cornersOwn>=config.cornersMinimum},
  ];
  const enabledEvidence=evidenceItems.filter(x=>x.enabled);
  const evidencePassedCount=enabledEvidence.filter(x=>x.ok).length;
  const evidenceRequired=config.evidenceRequired==='ALL'?enabledEvidence.length:Number(config.evidenceRequired||1);
  const evidenceOk=config.attackEvidenceEnabled===false || (enabledEvidence.length>0&&evidencePassedCount>=evidenceRequired);
  const evidence={
    enabled:config.attackEvidenceEnabled!==false,
    required:config.attackEvidenceEnabled===false?0:(config.evidenceRequired==='ALL'?'ALL':evidenceRequired),
    enabledCount:enabledEvidence.length,
    passedCount:evidencePassedCount,
    checks:Object.fromEntries(evidenceItems.map(x=>[x.key,{enabled:x.enabled,pass:Boolean(x.ok)}])),
  };

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
