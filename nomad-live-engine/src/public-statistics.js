const finite=value=>Number.isFinite(Number(value));

export const PUBLIC_STATS_EPOCH_VERSION=1;

export function publicSignalKey(signal){
  if(signal?.matchId==null||!finite(signal?.lockedAt)) return null;
  return JSON.stringify([String(signal.matchId),Number(signal.lockedAt)]);
}

export function isPendingSignal(signal){
  return !signal?.settlement||signal.settlement?.result==='PENDING';
}

export function createPublicStatsEpoch(signals=[],startedAt=Date.now()){
  const seedKeys=signals
    .filter(isPendingSignal)
    .map(publicSignalKey)
    .filter(Boolean);
  return {
    version:PUBLIC_STATS_EPOCH_VERSION,
    startedAt:Number(startedAt),
    seedKeys:[...new Set(seedKeys)],
  };
}

export function selectPublicStatsSignals(signals=[],epoch){
  if(!epoch||epoch.version!==PUBLIC_STATS_EPOCH_VERSION||!finite(epoch.startedAt)) return [];
  const seedKeys=new Set(Array.isArray(epoch.seedKeys)?epoch.seedKeys:[]);
  return signals.filter(signal=>{
    const key=publicSignalKey(signal);
    if(key&&seedKeys.has(key)) return true;
    return finite(signal?.lockedAt)&&Number(signal.lockedAt)>=Number(epoch.startedAt);
  });
}

export function summarizePublicStats(signals=[]){
  const settled=signals.filter(item=>item?.settlement&&item.settlement?.result!=='PENDING');
  const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
  const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
  const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
  const profit=settled.reduce((total,item)=>total+(Number(item.settlement?.profit)||0),0);
  const avgOdds=signals.length?signals.reduce((total,item)=>total+(Number(item?.odds)||0),0)/signals.length:0;
  return {
    totalSignals:signals.length,
    settled:settled.length,
    wins,losses,pushes,
    winRate:settled.length?wins/settled.length*100:0,
    avgOdds,
    profit,
    roi:settled.length?profit/settled.length*100:0,
    records:[...signals].sort((a,b)=>Number(b?.lockedAt||0)-Number(a?.lockedAt||0)),
  };
}
