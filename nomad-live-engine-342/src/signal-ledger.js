export const SIGNAL_SCHEMA_VERSION='342-signal-v1';
const MAX_M88_AGE_MS=60000;
const MAX_TOTALCORNER_AGE_MS=120000;
const MAX_LOCK_AGE_MS=180000;
const MAX_FUTURE_MS=10000;

const finite=v=>{
  if(v===null||v===undefined||v===''||typeof v==='boolean') return null;
  const x=Number(v);
  return Number.isFinite(x)?x:null;
};
const clean=v=>String(v??'').trim();
const observedMs=value=>{
  const x=finite(value);
  if(x!==null) return x;
  const ms=Date.parse(String(value||''));
  return Number.isFinite(ms)?ms:null;
};
const scorePair=value=>{
  if(Array.isArray(value)&&value.length>=2) return {home:finite(value[0]),away:finite(value[1])};
  if(value&&typeof value==='object') return {home:finite(value.home),away:finite(value.away)};
  return {home:null,away:null};
};
const explicitSignedNonZero=raw=>{
  const text=clean(raw).replaceAll('−','-').replaceAll('＋','+');
  if(!text) return false;
  const parts=text.split('/').map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return false;
  return parts.every(part=>{
    const v=finite(part);
    if(v===0) return true;
    return v!==null&&/^[+-]/.test(part);
  });
};

export function signalKeyFor(matchId,selection='HOME'){
  return `3.42:${clean(matchId)}:${String(selection||'HOME').toUpperCase()}`;
}

export function validateSignalPayload(input,clockMs=Date.now()){
  const errors=[];
  const body=input&&typeof input==='object'?input:{};
  const matchId=clean(body.matchId||body.sourceMatchId);
  const home=clean(body.home);
  const away=clean(body.away);
  const league=clean(body.league)||null;
  const selection=String(body.selection||'HOME').toUpperCase();
  const entryMinute=finite(body.entryMinute??body.minute);
  const entryScore=scorePair(body.entryScore??body.score);
  const lockedAtMs=observedMs(body.lockedAt??body.ts??clockMs);
  const configVersion=clean(body.configVersion)||'browser-342-v1';
  const reason=clean(body.reason)||'TOTALCORNER EVENT PASS + M88 PRICE CONFIRMED';
  const evidence=body.evidence&&typeof body.evidence==='object'?body.evidence:{};
  const m88=evidence.m88&&typeof evidence.m88==='object'?evidence.m88:(body.m88||{});
  const totalCorner=evidence.totalCorner&&typeof evidence.totalCorner==='object'?evidence.totalCorner:(body.totalCorner||{});

  if(!matchId) errors.push('matchId_required');
  if(!home) errors.push('home_required');
  if(!away) errors.push('away_required');
  if(selection!=='HOME') errors.push('selection_must_be_HOME');
  if(entryMinute===null||entryMinute<1||entryMinute>130) errors.push('entryMinute_invalid');
  if(entryScore.home===null||entryScore.away===null||entryScore.home<0||entryScore.away<0) errors.push('entryScore_invalid');
  if(lockedAtMs===null||lockedAtMs>clockMs+MAX_FUTURE_MS||clockMs-lockedAtMs>MAX_LOCK_AGE_MS) errors.push('lockedAt_not_fresh');

  const m88Status=String(m88.status||'').toUpperCase();
  const m88Book=String(m88.book||m88.source||'M88').toUpperCase();
  const m88ObservedAt=observedMs(m88.observedAt);
  const decodedHomeLine=finite(m88.decodedHomeLine??body.line);
  const rawHomeLine=clean(m88.rawHomeLine??body.rawLine);
  const homeOddsDecimal=finite(m88.homeOddsDecimal??body.odds);
  const homeOddsRaw=finite(m88.homeOddsRaw??body.rawOdds);
  const oddsFormat=String(m88.oddsFormat||body.oddsFormat||'HK').toUpperCase();

  if(m88Book!=='M88') errors.push('m88_source_invalid');
  if(m88Status!=='VALID') errors.push('m88_status_not_VALID');
  if(m88ObservedAt===null||m88ObservedAt>clockMs+MAX_FUTURE_MS||clockMs-m88ObservedAt>MAX_M88_AGE_MS) errors.push('m88_observation_not_fresh');
  if(decodedHomeLine===null) errors.push('m88_home_line_invalid');
  if(decodedHomeLine!==null&&decodedHomeLine!==0&&!explicitSignedNonZero(rawHomeLine)) errors.push('m88_nonzero_line_requires_explicit_sign');
  if(homeOddsDecimal===null||homeOddsDecimal<1) errors.push('m88_decimal_odds_invalid');

  const tcSource=String(totalCorner.source||totalCorner.name||'TotalCorner').toUpperCase();
  const tcObservedAt=observedMs(totalCorner.observedAt??totalCorner.capturedAt);
  if(tcSource!=='TOTALCORNER') errors.push('totalcorner_source_invalid');
  if(tcObservedAt===null||tcObservedAt>clockMs+MAX_FUTURE_MS||clockMs-tcObservedAt>MAX_TOTALCORNER_AGE_MS) errors.push('totalcorner_observation_not_fresh');

  const signalKey=clean(body.signalKey)||signalKeyFor(matchId,selection);
  return {
    ok:errors.length===0,
    errors,
    value:errors.length?null:{
      schemaVersion:SIGNAL_SCHEMA_VERSION,
      signalKey,matchId,league,home,away,selection,entryMinute,entryScore,
      homeAh:decodedHomeLine,
      rawHomeAh:rawHomeLine||null,
      oddsDecimal:homeOddsDecimal,
      oddsRaw:homeOddsRaw,
      oddsFormat,
      bookmaker:'M88',
      eventSource:'TotalCorner',
      m88ObservedAt:new Date(m88ObservedAt).toISOString(),
      totalCornerObservedAt:new Date(tcObservedAt).toISOString(),
      configVersion,reason,
      lockedAt:new Date(lockedAtMs).toISOString(),
      evidence:{
        m88:{...m88,book:'M88',status:m88Status,observedAt:m88ObservedAt,decodedHomeLine,rawHomeLine,homeOddsDecimal,homeOddsRaw,oddsFormat},
        totalCorner:{...totalCorner,source:'TotalCorner',observedAt:tcObservedAt},
        nomad:body.nomad&&typeof body.nomad==='object'?body.nomad:{reason,configVersion},
      },
    }
  };
}

async function sha256(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function shortId(prefix,value){return `${prefix}_${(await sha256(value)).slice(0,24)}`;}

export function publicSignalRow(row){
  if(!row) return null;
  return {
    signalId:row.signal_id,
    signalKey:row.signal_key,
    schemaVersion:row.schema_version,
    matchId:row.source_match_id,
    league:row.league,
    home:row.home,
    away:row.away,
    selection:row.selection,
    entryMinute:row.entry_minute,
    entryScore:[row.entry_score_home,row.entry_score_away],
    line:row.home_ah,
    rawLine:row.raw_home_ah,
    odds:row.odds_decimal,
    rawOdds:row.odds_raw,
    oddsFormat:row.odds_format,
    bookmaker:row.bookmaker,
    eventSource:row.event_source,
    configVersion:row.config_version,
    reason:row.reason,
    status:row.result_grade||row.status,
    lockedAt:row.locked_at,
    finalScore:row.final_score_home==null?null:[row.final_score_home,row.final_score_away],
    resultGrade:row.result_grade||null,
    plUnits:row.pl_units==null?null:Number(row.pl_units),
    settledAt:row.settled_at||null,
  };
}

export async function lockSignal(db,v){
  const signalId=await shortId('sig',v.signalKey);
  const tcEvidenceId=await shortId('ev',`${v.signalKey}:TOTALCORNER:${v.totalCornerObservedAt}`);
  const m88EvidenceId=await shortId('ev',`${v.signalKey}:M88:${v.m88ObservedAt}`);
  const nomadEvidenceId=await shortId('ev',`${v.signalKey}:NOMAD:${v.lockedAt}`);
  const auditId=await shortId('audit',`${v.signalKey}:LOCKED`);

  const statements=[
    db.prepare(`INSERT OR IGNORE INTO signals(
      signal_id,signal_key,schema_version,source_match_id,league,home,away,selection,
      entry_minute,entry_score_home,entry_score_away,home_ah,raw_home_ah,odds_decimal,
      odds_raw,odds_format,bookmaker,event_source,m88_observed_at,totalcorner_observed_at,
      config_version,reason,status,locked_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      signalId,v.signalKey,v.schemaVersion,v.matchId,v.league,v.home,v.away,v.selection,
      v.entryMinute,v.entryScore.home,v.entryScore.away,v.homeAh,v.rawHomeAh,v.oddsDecimal,
      v.oddsRaw,v.oddsFormat,v.bookmaker,v.eventSource,v.m88ObservedAt,v.totalCornerObservedAt,
      v.configVersion,v.reason,'PENDING',v.lockedAt
    ),
    db.prepare(`INSERT OR IGNORE INTO signal_evidence(evidence_id,signal_id,source,captured_at,payload_json) VALUES(?,?,?,?,?)`)
      .bind(tcEvidenceId,signalId,'TOTALCORNER',v.totalCornerObservedAt,JSON.stringify(v.evidence.totalCorner)),
    db.prepare(`INSERT OR IGNORE INTO signal_evidence(evidence_id,signal_id,source,captured_at,payload_json) VALUES(?,?,?,?,?)`)
      .bind(m88EvidenceId,signalId,'M88',v.m88ObservedAt,JSON.stringify(v.evidence.m88)),
    db.prepare(`INSERT OR IGNORE INTO signal_evidence(evidence_id,signal_id,source,captured_at,payload_json) VALUES(?,?,?,?,?)`)
      .bind(nomadEvidenceId,signalId,'NOMAD',v.lockedAt,JSON.stringify(v.evidence.nomad)),
    db.prepare(`INSERT OR IGNORE INTO signal_audit(audit_id,signal_id,action,event_at,details_json) VALUES(?,?,?,?,?)`)
      .bind(auditId,signalId,'LOCKED',v.lockedAt,JSON.stringify({signalKey:v.signalKey,schemaVersion:v.schemaVersion}))
  ];
  const results=await db.batch(statements);
  const created=Number(results?.[0]?.meta?.changes||0)>0;
  const row=await db.prepare(`
    SELECT s.*,st.final_score_home,st.final_score_away,st.result_grade,st.pl_units,st.settled_at
    FROM signals s LEFT JOIN settlements st ON st.signal_id=s.signal_id
    WHERE s.signal_key=? LIMIT 1
  `).bind(v.signalKey).first();
  return {created,row:publicSignalRow(row)};
}

export async function listSignals(db,{limit=50,before=null}={}){
  const size=Math.max(1,Math.min(100,Number(limit)||50));
  let result;
  if(before){
    result=await db.prepare(`
      SELECT s.*,st.final_score_home,st.final_score_away,st.result_grade,st.pl_units,st.settled_at
      FROM signals s LEFT JOIN settlements st ON st.signal_id=s.signal_id
      WHERE s.locked_at < ?
      ORDER BY s.locked_at DESC, s.signal_id DESC
      LIMIT ?
    `).bind(before,size).all();
  }else{
    result=await db.prepare(`
      SELECT s.*,st.final_score_home,st.final_score_away,st.result_grade,st.pl_units,st.settled_at
      FROM signals s LEFT JOIN settlements st ON st.signal_id=s.signal_id
      ORDER BY s.locked_at DESC, s.signal_id DESC
      LIMIT ?
    `).bind(size).all();
  }
  const rows=(result?.results||[]).map(publicSignalRow);
  return {rows,nextCursor:rows.length===size?rows[rows.length-1]?.lockedAt:null};
}

export async function databaseHealth(db){
  const row=await db.prepare('SELECT 1 AS ok').first();
  return Boolean(row?.ok===1||row?.ok==='1');
}
