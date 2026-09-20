from pathlib import Path

p = Path('workers/nomadtips3-engine-343/src/index.js')
s = p.read_text()

old_version = "const VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard';"
new_version = "const VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1';"
if old_version not in s:
    raise SystemExit('CURRENT_ENGINE_VERSION_NOT_FOUND')
s = s.replace(old_version, new_version, 1)

old_constants = """const MAX_SIGNALS=1600;\nconst MAX_ODDS_FIXTURES_PER_SCAN=4;\nconst UI_ODDS_CACHE_MS=60_000;"""
new_constants = """const MAX_SIGNALS=1600;\nconst MAX_ODDS_FIXTURES_PER_SCAN=4;\n// Settlement recovery is deliberately throttled so final-score repair cannot become an API storm.\nconst MAX_SETTLEMENT_RECOVERY_PER_SCAN=2;\nconst SETTLEMENT_RECOVERY_UNRESOLVED_MIN_AGE_MS=90*60_000;\nconst SETTLEMENT_RECOVERY_PENDING_MIN_AGE_MS=120*60_000;\nconst SETTLEMENT_RECOVERY_RETRY_MS=30*60_000;\nconst UI_ODDS_CACHE_MS=60_000;"""
if old_constants not in s:
    raise SystemExit('CONSTANT_ANCHOR_NOT_FOUND')
s = s.replace(old_constants, new_constants, 1)

fetch_anchor = "async function fetchFullOdds(fixtureId,env){"
recovery_helpers = r"""function recoveryScore(v){return v&&typeof v==='object'?{home:num(v.home),away:num(v.away),halfHome:num(v.half_home??v.halfHome),halfAway:num(v.half_away??v.halfAway)}:{home:null,away:null,halfHome:null,halfAway:null}}
function recoveryCards(v){const side=x=>x&&typeof x==='object'?{yellow:num(x.yellow),red:num(x.red)}:null;return {home:side(v?.home),away:side(v?.away)}}
function recoveryBoardState(status,statusCode){const x=`${status||''} ${statusCode||''}`.toLowerCase();if(/unknown|postpon|cancel|canceled|abandon|suspend/.test(x))return'unknown';if(/finished|full_time|full time|\bft\b|ended|\bfull\b|after extra|\baet\b|penalties|\bpen\b/.test(x))return'finished';if(/in_play|in play|live|half|first|second|\b1h\b|\b2h\b/.test(x)||/^\d+$/.test(String(statusCode||'')))return'live';return'scheduled'}
function normalizeRecoveryFixture(payload,fallbackId){const f=payload?.data?.id!==undefined?payload.data:(payload?.data?.data??payload?.fixture??payload?.data??payload),status=String(f?.status?.name??f?.status??''),statusCode=String(f?.status_code??f?.status?.code??f?.status?.short??''),fixtureId=String(f?.id??f?.fixture_id??f?.fixture?.id??fallbackId);return {fixtureId,status,statusCode,statusReason:f?.status_reason??f?.status?.reason??null,boardState:recoveryBoardState(status,statusCode),minute:num(f?.minute??f?.elapsed??f?.status?.minute??f?.status?.elapsed),goals:recoveryScore(f?.goals??f?.score),corners:recoveryScore(f?.corners),cards:recoveryCards(f?.cards)}}
async function fetchSettlementRecoveryFixture(fixtureId,env){if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}if(!r.ok){const e=new Error(`5USD_FIXTURE_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(r.headers.get('retry-after'));throw e}if(!j||typeof j!=='object')throw new Error('5USD_FIXTURE_SHAPE');return normalizeRecoveryFixture(j,fixtureId)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

"""
if fetch_anchor not in s:
    raise SystemExit('FETCH_ANCHOR_NOT_FOUND')
s = s.replace(fetch_anchor, recovery_helpers + fetch_anchor, 1)

old_map = """      const histories={},board=[],seen=new Set(signals.map(s=>`${s.fixtureId}:${s.market}:${strategyOf(s)}`));const at=Number(hub.fetchedAt||now());\n      const fixtureMap=new Map();for(const f of hub.fixtures||[])fixtureMap.set(String(f.fixtureId),f);\n      for(const f of hub.fixtures||[]){"""
new_map = """      const histories={},board=[],seen=new Set(signals.map(s=>`${s.fixtureId}:${s.market}:${strategyOf(s)}`));const at=Number(hub.fetchedAt||now());\n      const fixtureMap=new Map();for(const f of hub.fixtures||[])fixtureMap.set(String(f.fixtureId),f);for(const f of hub.settlements||[])fixtureMap.set(String(f.fixtureId),f);\n      // Recover terminal state for old unresolved signals and stale pending signals without touching Odds.\n      const recoveryState=await this.ctx.storage.get('settlementRecovery')||{},recoveryById=new Map();\n      for(const sig of signals){\n        if(!['PENDING','UNRESOLVED'].includes(sig.status))continue;\n        const id=String(sig.fixtureId||''),created=Number(sig.createdAt||0);if(!id||!created)continue;\n        const age=startedAt-created,current=fixtureMap.get(id);\n        const eligible=sig.status==='UNRESOLVED'?age>=SETTLEMENT_RECOVERY_UNRESOLVED_MIN_AGE_MS:(!current&&age>=SETTLEMENT_RECOVERY_PENDING_MIN_AGE_MS);\n        if(!eligible)continue;\n        const cur=recoveryById.get(id)||{fixtureId:id,newestCreatedAt:0,oldestCreatedAt:created};cur.newestCreatedAt=Math.max(cur.newestCreatedAt,created);cur.oldestCreatedAt=Math.min(cur.oldestCreatedAt,created);recoveryById.set(id,cur);\n      }\n      const recoveryCandidates=[...recoveryById.values()].filter(x=>startedAt-Number(recoveryState[x.fixtureId]?.lastAttemptAt||0)>=SETTLEMENT_RECOVERY_RETRY_MS).sort((a,b)=>b.newestCreatedAt-a.newestCreatedAt),recoverySelected=recoveryCandidates.slice(0,MAX_SETTLEMENT_RECOVERY_PER_SCAN);\n      let settlementRecoveryRequests=0,settlementRecoveryRecovered=0,settlementRecoveryErrors=[];\n      for(let i=0;i<recoverySelected.length;i++){const id=recoverySelected[i].fixtureId;try{settlementRecoveryRequests++;const f=await fetchSettlementRecoveryFixture(id,this.env);recoveryState[id]={lastAttemptAt:now(),state:f.boardState,status:f.status,statusCode:f.statusCode};if(isFinished(f)||isUnknown(f)){fixtureMap.set(id,f);settlementRecoveryRecovered++;recoveryState[id].recoveredAt=now()}}catch(e){recoveryState[id]={lastAttemptAt:now(),state:'ERROR',error:String(e?.message||e)};settlementRecoveryErrors.push({fixtureId:id,error:String(e?.message||e)});if(i+1<recoverySelected.length)await sleep(800)}}\n      await this.ctx.storage.put('settlementRecovery',Object.fromEntries(Object.entries(recoveryState).sort((a,b)=>Number(b[1]?.lastAttemptAt||0)-Number(a[1]?.lastAttemptAt||0)).slice(0,500)));\n      for(const f of hub.fixtures||[]){"""
if old_map not in s:
    raise SystemExit('FIXTURE_MAP_ANCHOR_NOT_FOUND')
s = s.replace(old_map, new_map, 1)

old_store = """      await this.ctx.storage.put('histories',histories);await this.ctx.storage.put('signals',signals.slice(-MAX_SIGNALS));await this.ctx.storage.put('board',{ok:true,version:VERSION,hubVersion:hub.version,hubFetchedAt:hub.fetchedAt,hubAgeMs:hub.ageMs,stale:hub.stale,counts:hub.counts,fixtures:board,runState:run,referee:{maxFixturesPerScan:MAX_ODDS_FIXTURES_PER_SCAN,requests:refereeRequests,queued:Math.max(0,fixtureCandidates.length-selected.length),errors:refereeErrors}});\n      const meta={ok:true,startedAt,finishedAt:now(),fixtureCount:board.length,liveCount:board.filter(isLive).length,signalCount:signals.filter(s=>s.status==='PENDING').length,unresolvedCount:signals.filter(s=>s.status==='UNRESOLVED').length,reconciled,refereeRequests,refereeQueued:Math.max(0,fixtureCandidates.length-selected.length),lastError:null};await this.ctx.storage.put('lastScan',meta);return meta;"""
new_store = """      await this.ctx.storage.put('histories',histories);await this.ctx.storage.put('signals',signals.slice(-MAX_SIGNALS));await this.ctx.storage.put('board',{ok:true,version:VERSION,hubVersion:hub.version,hubFetchedAt:hub.fetchedAt,hubAgeMs:hub.ageMs,stale:hub.stale,counts:hub.counts,fixtures:board,runState:run,referee:{maxFixturesPerScan:MAX_ODDS_FIXTURES_PER_SCAN,requests:refereeRequests,queued:Math.max(0,fixtureCandidates.length-selected.length),errors:refereeErrors},settlementRecovery:{maxPerScan:MAX_SETTLEMENT_RECOVERY_PER_SCAN,unresolvedMinAgeMs:SETTLEMENT_RECOVERY_UNRESOLVED_MIN_AGE_MS,pendingMinAgeMs:SETTLEMENT_RECOVERY_PENDING_MIN_AGE_MS,retryMs:SETTLEMENT_RECOVERY_RETRY_MS,requests:settlementRecoveryRequests,recovered:settlementRecoveryRecovered,queued:Math.max(0,recoveryCandidates.length-recoverySelected.length),errors:settlementRecoveryErrors}});\n      const meta={ok:true,startedAt,finishedAt:now(),fixtureCount:board.length,liveCount:board.filter(isLive).length,signalCount:signals.filter(s=>s.status==='PENDING').length,unresolvedCount:signals.filter(s=>s.status==='UNRESOLVED').length,reconciled,refereeRequests,refereeQueued:Math.max(0,fixtureCandidates.length-selected.length),settlementRecoveryRequests,settlementRecoveryRecovered,settlementRecoveryQueued:Math.max(0,recoveryCandidates.length-recoverySelected.length),settlementRecoveryErrors,lastError:null};await this.ctx.storage.put('lastScan',meta);return meta;"""
if old_store not in s:
    raise SystemExit('STORE_ANCHOR_NOT_FOUND')
s = s.replace(old_store, new_store, 1)

required = [
    new_version,
    'MAX_SETTLEMENT_RECOVERY_PER_SCAN=2',
    'fetchSettlementRecoveryFixture',
    "sig.status==='UNRESOLVED'?age>=SETTLEMENT_RECOVERY_UNRESOLVED_MIN_AGE_MS",
    'settlementRecoveryRequests',
]
for marker in required:
    if marker not in s:
        raise SystemExit('MISSING_MARKER:' + marker)

p.write_text(s)
print('BALL46_SETTLEMENT_RECOVERY_PATCH_PASS')
