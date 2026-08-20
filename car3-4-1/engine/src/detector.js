const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const bool=(v,f=false)=>typeof v==='boolean'?v:v==='true'||v===1||v==='1'?true:v==='false'||v===0||v==='0'?false:f;
const clamp=(v,f,min,max)=>{const n=num(v);return n===null?f:Math.max(min,Math.min(max,n));};

export const DEFAULT_CONFIG={
  engineEnabled:true,side:'HOME',market:'AH',minuteMin:54,minuteMax:89,
  oddsMin:1.40,oddsMax:null,ahMin:1,ahMax:null,realMarketMaxAgeSeconds:120,
  momentumMin:54,attackEvidenceEnabled:true,
  attackEvidenceDangerousAttacksEnabled:true,attackEvidenceDangerousAttacksMin:1,
  attackEvidenceShotsEnabled:true,attackEvidenceShotsMin:1,
  attackEvidenceShotsOnTargetEnabled:true,attackEvidenceShotsOnTargetMin:1,
  attackEvidenceCornersEnabled:true,attackEvidenceCornersMin:1,
  attackEvidenceRequirement:'1',goalGapLimited:false,maxGoalGap:1,
  confirmationRounds:1,signalLimitEnabled:false,maxSignalsPerDay:10,
  sourceFreshnessMaxSeconds:90,matchConfidenceMin:85,requireCoreStats:true,redCardPolicy:'ALLOW',
  momentumWeights:{attacks:.16,dangerousAttacks:.52,shots:2,shotsOnTarget:4,corners:1.25,possession:.07}
};

export function normalizeConfig(input={}){
  const s=input&&typeof input==='object'?input:{};
  const enumv=(v,allowed,f)=>{const x=String(v??f).toUpperCase();return allowed.includes(x)?x:f;};
  const minuteMin=Math.round(clamp(s.minuteMin,DEFAULT_CONFIG.minuteMin,1,119));
  const minuteMax=Math.round(clamp(s.minuteMax,DEFAULT_CONFIG.minuteMax,minuteMin,120));
  return {
    ...DEFAULT_CONFIG,...s,market:'AH',
    engineEnabled:bool(s.engineEnabled,true),
    side:enumv(s.side,['HOME','AWAY','BOTH'],'HOME'),minuteMin,minuteMax,
    oddsMin:clamp(s.oddsMin,1.4,1.01,100),oddsMax:num(s.oddsMax),
    ahMin:clamp(s.ahMin,1,-5,5),ahMax:num(s.ahMax),realMarketMaxAgeSeconds:Math.round(clamp(s.realMarketMaxAgeSeconds,120,15,600)),
    momentumMin:Math.round(clamp(s.momentumMin,54,1,99)),
    attackEvidenceEnabled:bool(s.attackEvidenceEnabled,true),
    attackEvidenceDangerousAttacksEnabled:bool(s.attackEvidenceDangerousAttacksEnabled,true),attackEvidenceDangerousAttacksMin:Math.round(clamp(s.attackEvidenceDangerousAttacksMin,1,1,999)),
    attackEvidenceShotsEnabled:bool(s.attackEvidenceShotsEnabled,true),attackEvidenceShotsMin:Math.round(clamp(s.attackEvidenceShotsMin,1,1,999)),
    attackEvidenceShotsOnTargetEnabled:bool(s.attackEvidenceShotsOnTargetEnabled,true),attackEvidenceShotsOnTargetMin:Math.round(clamp(s.attackEvidenceShotsOnTargetMin,1,1,999)),
    attackEvidenceCornersEnabled:bool(s.attackEvidenceCornersEnabled,true),attackEvidenceCornersMin:Math.round(clamp(s.attackEvidenceCornersMin,1,1,999)),
    attackEvidenceRequirement:enumv(s.attackEvidenceRequirement,['1','2','3','ALL'],'1'),
    goalGapLimited:bool(s.goalGapLimited,false),maxGoalGap:Math.round(clamp(s.maxGoalGap,1,0,20)),confirmationRounds:1,
    signalLimitEnabled:bool(s.signalLimitEnabled,false),maxSignalsPerDay:Math.round(clamp(s.maxSignalsPerDay,10,1,100)),
    sourceFreshnessMaxSeconds:Math.round(clamp(s.sourceFreshnessMaxSeconds,90,15,600)),matchConfidenceMin:Math.round(clamp(s.matchConfidenceMin,85,50,100)),
    requireCoreStats:bool(s.requireCoreStats,true),redCardPolicy:enumv(s.redCardPolicy,['ALLOW','REJECT_SELECTED','REJECT_ANY'],'ALLOW'),
    momentumWeights:{
      attacks:clamp(s.momentumWeights?.attacks??s.weightAttacks,.16,0,20),
      dangerousAttacks:clamp(s.momentumWeights?.dangerousAttacks??s.weightDangerousAttacks,.52,0,20),
      shots:clamp(s.momentumWeights?.shots??s.weightShots,2,0,20),
      shotsOnTarget:clamp(s.momentumWeights?.shotsOnTarget??s.weightShotsOnTarget,4,0,20),
      corners:clamp(s.momentumWeights?.corners??s.weightCorners,1.25,0,20),
      possession:clamp(s.momentumWeights?.possession??s.weightPossession,.07,0,2)
    }
  };
}

function scorePressure(stats,w){let h=0,a=0;for(const [key,weight] of Object.entries(w)){h+=(num(stats?.[key]?.home)||0)*weight;a+=(num(stats?.[key]?.away)||0)*weight;}const total=Math.max(.0001,h+a);return{home:Math.round(h/total*100),away:Math.round(a/total*100)};}
function selectedSide(match,cfg,p){if(cfg.side==='HOME')return'HOME';if(cfg.side==='AWAY')return'AWAY';return p.away>p.home?'AWAY':'HOME';}
function sidePair(pair,side){return side==='AWAY'?{selected:num(pair?.away)||0,opponent:num(pair?.home)||0}:{selected:num(pair?.home)||0,opponent:num(pair?.away)||0};}
function complete(match){return Boolean(match?.quality?.coreStatsComplete);}
function snapshotMatch(snapshot,id){return(snapshot?.matches||[]).find(x=>String(x?.match?.id||x?.id)===String(id));}
function baselineFor(match,side,snapshots,cfg){
  const id=match.match.id;
  for(const snapshot of snapshots){
    const old=snapshotMatch(snapshot,id);
    if(!old||num(old.state?.minute)<cfg.minuteMin||!complete(old))continue;
    return {
      dangerous:sidePair(old.stats?.dangerousAttacks,side).selected,
      shots:sidePair(old.stats?.shots,side).selected,
      sot:sidePair(old.stats?.shotsOnTarget,side).selected,
      corners:sidePair(old.stats?.corners,side).selected
    };
  }
  return {
    dangerous:sidePair(match.stats?.dangerousAttacks,side).selected,
    shots:sidePair(match.stats?.shots,side).selected,
    sot:sidePair(match.stats?.shotsOnTarget,side).selected,
    corners:sidePair(match.stats?.corners,side).selected
  };
}

export function evaluateBase(match,cfgInput,snapshots=[]){
  const cfg=normalizeConfig(cfgInput),p=scorePressure(match.stats,cfg.momentumWeights),side=selectedSide(match,cfg,p),momentum=side==='AWAY'?p.away:p.home;
  const base=baselineFor(match,side,snapshots,cfg);
  const current={dangerous:sidePair(match.stats?.dangerousAttacks,side).selected,shots:sidePair(match.stats?.shots,side).selected,sot:sidePair(match.stats?.shotsOnTarget,side).selected,corners:sidePair(match.stats?.corners,side).selected};
  const evidence={dangerous:current.dangerous-base.dangerous,shots:current.shots-base.shots,sot:current.sot-base.sot,corners:current.corners-base.corners};
  const rules=[
    [cfg.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,cfg.attackEvidenceDangerousAttacksMin],
    [cfg.attackEvidenceShotsEnabled,evidence.shots,cfg.attackEvidenceShotsMin],
    [cfg.attackEvidenceShotsOnTargetEnabled,evidence.sot,cfg.attackEvidenceShotsOnTargetMin],
    [cfg.attackEvidenceCornersEnabled,evidence.corners,cfg.attackEvidenceCornersMin]
  ].filter(x=>x[0]);
  const evidencePassed=rules.filter(x=>x[1]>=x[2]).length;
  const evidenceRequired=cfg.attackEvidenceRequirement==='ALL'?rules.length:Number(cfg.attackEvidenceRequirement);
  const score=sidePair(match.score,side),red=sidePair(match.stats?.redCards,side),goalGap=Math.abs(score.selected-score.opponent);
  const sourceConfidence=complete(match)?100:70;
  const sourceAge=match.source?.collectedAt?Math.max(0,Math.round((Date.now()-Date.parse(match.source.collectedAt))/1000)):null;
  const redOk=cfg.redCardPolicy==='ALLOW'||(cfg.redCardPolicy==='REJECT_SELECTED'?red.selected===0:red.selected===0&&red.opponent===0);
  const gates=[
    ['ENGINE',cfg.engineEnabled,cfg.engineEnabled?'enabled':'disabled'],
    ['MINUTE',num(match.state?.minute)!==null&&match.state.minute>=cfg.minuteMin&&match.state.minute<=cfg.minuteMax,`${match.state?.minute??'?'} / ${cfg.minuteMin}-${cfg.minuteMax}`],
    ['CORE STATS',!cfg.requireCoreStats||complete(match),complete(match)?'complete':'partial'],
    ['SOURCE FRESH',sourceAge===null||sourceAge<=cfg.sourceFreshnessMaxSeconds,sourceAge===null?'n/a':`${sourceAge}s`],
    ['MOMENTUM',momentum>=cfg.momentumMin,`${momentum}% / ≥${cfg.momentumMin}%`],
    ['EVIDENCE',!cfg.attackEvidenceEnabled||evidencePassed>=evidenceRequired,`${evidencePassed}/${rules.length} need ${cfg.attackEvidenceRequirement}`],
    ['GOAL GAP',!cfg.goalGapLimited||goalGap<=cfg.maxGoalGap,`${goalGap} / max ${cfg.maxGoalGap}`],
    ['RED CARD',redOk,`${red.selected}-${red.opponent}`],
    ['SOURCE QUALITY',sourceConfidence>=cfg.matchConfidenceMin,`${sourceConfidence}% / ≥${cfg.matchConfidenceMin}%`]
  ];
  const pass=gates.every(x=>x[1]);
  return{pass,side,momentum,pressure:p,evidence,evidencePassed,evidenceRequired,gates,sourceConfidence,sourceAge,entryScore:{home:match.score.home,away:match.score.away}};
}

export function evaluateFinal(match,cfgInput,snapshots=[],realMarket=null){
  const cfg=normalizeConfig(cfgInput),base=evaluateBase(match,cfg,snapshots),rawLine=num(realMarket?.ah?.line),selectedLine=rawLine===null?null:(base.side==='AWAY'?-rawLine:rawLine),odds=num(realMarket?.ah?.[base.side==='AWAY'?'away':'home']),age=num(realMarket?.marketAgeSeconds),mappingConfidence=num(realMarket?.matchConfidence),mappingPct=mappingConfidence===null?0:Math.round(mappingConfidence*1000)/10;
  const marketOk=realMarket?.status==='MATCH';
  const mappingOk=marketOk&&mappingPct>=cfg.matchConfidenceMin;
  const ageOk=age!==null&&age<=cfg.realMarketMaxAgeSeconds;
  const oddsOk=odds!==null&&odds>=cfg.oddsMin&&(cfg.oddsMax===null||odds<=cfg.oddsMax);
  const lineOk=selectedLine!==null&&selectedLine>=cfg.ahMin&&(cfg.ahMax===null||selectedLine<=cfg.ahMax);
  const marketGates=[
    ['REAL MARKET',marketOk,realMarket?.status||'NOT_FOUND'],
    ['MARKET MATCH',mappingOk,`${mappingPct}% / ≥${cfg.matchConfidenceMin}%`],
    ['PRICE AGE',ageOk,age===null?'n/a':`${age}s / ≤${cfg.realMarketMaxAgeSeconds}s`],
    ['AH / ODDS',oddsOk&&lineOk,odds===null?'waiting':`${selectedLine>=0?'+':''}${selectedLine} @ ${odds}`]
  ];
  const gates=[...base.gates,...marketGates],pass=gates.every(x=>x[1]);
  return{...base,pass,decision:pass?'SIGNAL':base.pass?'PRICE_WAIT':base.momentum>=Math.max(1,cfg.momentumMin-7)?'CLOSE':'WATCHING',gates,rawLine,selectedLine,line:selectedLine,odds,bookmaker:realMarket?.ah?.bookmaker||'1xbet',marketAgeSeconds:age,matchConfidence:mappingConfidence??0,matchConfidencePct:mappingPct,oddsUpdatedAt:realMarket?.ah?.updatedAt||null};
}
