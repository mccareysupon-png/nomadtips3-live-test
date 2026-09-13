const finite=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value));
const DEFAULT_MAX_AGE_MS=90_000;
const FUTURE_SKEW_MS=5_000;

export function assessFiveUsdQuoteFreshness(quote,{at=Date.now(),maxAgeMs=DEFAULT_MAX_AGE_MS}={}){
  const limit=finite(maxAgeMs)&&Number(maxAgeMs)>=0?Number(maxAgeMs):DEFAULT_MAX_AGE_MS;
  const ready=quote?.status==='AH READY'&&quote?.bookmakerVerified===true;
  const nativeAt=finite(quote?.sourceUpdatedAt)?Number(quote.sourceUpdatedAt):null;
  const nativeDeclared=nativeAt!==null&&String(quote?.timestampKind||'').toLowerCase()==='provider_native';
  const fabricatedNative=nativeAt!==null&&!nativeDeclared;
  const observedAt=finite(quote?.observedAt)?Number(quote.observedAt):null;
  const lastSeenAt=finite(quote?.lastSeenAt)?Number(quote.lastSeenAt):observedAt;
  const basis=nativeDeclared?'PROVIDER_NATIVE':'OBSERVED';
  const basisAt=nativeDeclared?nativeAt:lastSeenAt;
  const future=basisAt!==null&&basisAt>Number(at)+FUTURE_SKEW_MS;
  const ageMs=basisAt===null?null:Math.max(0,Number(at)-basisAt);
  const stale=ageMs===null||ageMs>limit;
  const fingerprint=typeof quote?.priceFingerprint==='string'&&quote.priceFingerprint.length>0?quote.priceFingerprint:null;
  const lastChangedAt=finite(quote?.lastChangedAt)?Number(quote.lastChangedAt):null;
  const changedAfterSeen=lastChangedAt!==null&&lastSeenAt!==null&&lastChangedAt>lastSeenAt+FUTURE_SKEW_MS;

  let reason=null;
  if(!ready) reason='QUOTE_NOT_READY';
  else if(fabricatedNative) reason='FABRICATED_SOURCE_TIMESTAMP';
  else if(basisAt===null) reason='FRESHNESS_TIME_MISSING';
  else if(future) reason='FRESHNESS_TIME_IN_FUTURE';
  else if(changedAfterSeen) reason='LAST_CHANGED_AFTER_LAST_SEEN';
  else if(!fingerprint) reason='PRICE_FINGERPRINT_MISSING';
  else if(stale) reason='QUOTE_STALE';

  return {
    fresh:reason===null,
    eligible:reason===null,
    reason,
    freshnessBasis:basis,
    basisAt,
    ageMs,
    maxAgeMs:limit,
    observedAt,
    lastSeenAt,
    lastChangedAt,
    sourceUpdatedAt:nativeAt,
    priceFingerprint:fingerprint,
    timestampKind:quote?.timestampKind??null,
  };
}

export function attachFiveUsdFreshness(referees,{at=Date.now(),maxAgeMs=DEFAULT_MAX_AGE_MS}={}){
  return (Array.isArray(referees)?referees:[]).map(quote=>({
    ...quote,
    freshness:assessFiveUsdQuoteFreshness(quote,{at,maxAgeMs}),
  }));
}

export function summarizeFiveUsdFreshness(referees,{at=Date.now(),maxAgeMs=DEFAULT_MAX_AGE_MS}={}){
  const rows=attachFiveUsdFreshness(referees,{at,maxAgeMs});
  const eligible=rows.filter(row=>row.freshness.eligible);
  return {
    checkedAt:at,
    maxAgeMs,
    total:rows.length,
    ready:rows.filter(row=>row.status==='AH READY').length,
    fresh:eligible.length,
    stale:rows.filter(row=>row.freshness.reason==='QUOTE_STALE').length,
    invalid:rows.length-eligible.length,
    rows,
  };
}
