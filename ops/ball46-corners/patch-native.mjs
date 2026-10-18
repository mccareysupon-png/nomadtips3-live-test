/**
 * BALL46 5USD Corners-only patch generator — OFFLINE, NO DEPLOY.
 * Accepts the currently running Cloudflare Worker source as text.
 * Fails closed if upstream structure changed.
 */
const MARK='B46_CORNERS_FAIR_QUEUE_AND_RECHECK_20261018';
const CURSOR_KEY='b46:corner:verified-history-cursor:v1';

export function roundRobinWindow(keys, cursor, budget) {
  if(!Number.isInteger(budget)||budget<0)throw Error('INVALID_BUDGET');
  const distinct=[...new Set(keys.map(String))];
  if(!distinct.length||!budget)return [];
  const start=((Math.trunc(Number(cursor)||0)%distinct.length)+distinct.length)%distinct.length;
  const result=[];
  for(let i=0;i<Math.min(budget,distinct.length);i++)result.push(distinct[(start+i)%distinct.length]);
  return result;
}
function once(source,from,to,label){
  const parts=source.split(from);
  if(parts.length!==2)throw Error('UNSAFE_ANCHOR_'+label+'_COUNT_'+(parts.length-1));
  return parts.join(to);
}

const FAIR_QUEUE_BLOCK=[
  '      /* B46_CORNERS_FAIR_QUEUE_AND_RECHECK_20261018:',
  '         Only eligible Corners groups compete for the existing 2 HTTP calls',
  '         per scan. Persist cursor to prevent fixture-list starvation.',
  '         Non-Corners order, settings and odds/referee code stay intact. */',
  '      const b46CornerCandidateKeys=[];',
  '      const b46CornerSeenKeys=new Set();',
  '      for(const cf of hub.fixtures||[]){',
  '        if(!isLive(cf)||hub.stale===true)continue;',
  '        const fixtureId=String(cf.fixtureId);',
  '        for(const mk of MARKET_KEYS){',
  '          if(!isVerifiedCornerMarket(mk)||!run[mk]||seen.has(fixtureId+":"+mk))continue;',
  '          const pre=preCandidatesForRule(mk,cf,histories[fixtureId]||[],settings[mk]);',
  '          if(!pre.candidates?.length)continue;',
  '          const spec=cornerHistorySpec(mk);',
  '          if(!spec)continue;',
  '          const ck=fixtureId+"|"+spec.market;',
  '          if(!b46CornerSeenKeys.has(ck)){',
  '            b46CornerSeenKeys.add(ck);',
  '            b46CornerCandidateKeys.push(ck);',
  '          }',
  '        }',
  '      }',
  '      const b46CornerCursorRaw=Number(await this.ctx.storage.get("b46:corner:verified-history-cursor:v1")||0);',
  '      const b46CornerCursor=Number.isFinite(b46CornerCursorRaw)&&b46CornerCursorRaw>=0?Math.trunc(b46CornerCursorRaw):0;',
  '      const b46CornerBudgetWindow=new Set();',
  '      for(let n=0;n<Math.min(BALL46_CORNER_TICK_REQUESTS_PER_SCAN,b46CornerCandidateKeys.length);n++){',
  '        b46CornerBudgetWindow.add(b46CornerCandidateKeys[(b46CornerCursor+n)%b46CornerCandidateKeys.length]);',
  '      }'
].join('\n');

export function patchNative(source){
  if(typeof source!=='string'||source.length<60000)throw Error('NATIVE_SOURCE_TOO_SHORT');
  if(source.includes(MARK))throw Error('ALREADY_PATCHED');
  for(const signature of [
    'nomad343-engine-v5-best19-referee','signal-ledger-v2-longterm',
    'BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2','CORNER_HISTORY_BUDGET',
    'CORNER_LIVE_PRICE_UNVERIFIED','async autoReconcileMissingFinals()',
    'async scan() {','async function fetchVerifiedCornerOnly'
  ])if(!source.includes(signature))throw Error('INCOMPATIBLE_NATIVE_SOURCE_'+signature);
  const scanStart=source.indexOf('  async scan() {');
  const recheckStart=source.indexOf('  async autoReconcileMissingFinals() {');
  if(scanStart<0||recheckStart<scanStart)throw Error('UNEXPECTED_NATIVE_METHOD_ORDER');
  let next=source;
  const refAnchor='const refereeScanOrder=orderedRefereeFixtures.slice(refereeRotationOffset).concat(orderedRefereeFixtures.slice(0,refereeRotationOffset));';
  next=once(next,refAnchor,refAnchor+'\n'+FAIR_QUEUE_BLOCK,'REFEREE_SCAN_ORDER');
  const oldBudget='if (cornerTickRequests>=BALL46_CORNER_TICK_REQUESTS_PER_SCAN) {';
  next=once(next,oldBudget,'if (!b46CornerBudgetWindow.has(cacheKey)||cornerTickRequests>=BALL46_CORNER_TICK_REQUESTS_PER_SCAN) {','CORNER_BUDGET_GATE');
  const storageAnchor='      await writeWorkingHistories(this.ctx, histories);';
  next=once(next,storageAnchor,'      if(b46CornerCandidateKeys.length){\n        await this.ctx.storage.put("'+CURSOR_KEY+'",b46CornerCursor+Math.min(BALL46_CORNER_TICK_REQUESTS_PER_SCAN,b46CornerCandidateKeys.length));\n      }\n'+storageAnchor,'CURSOR_STORAGE');
  const start=next.indexOf('  async autoReconcileMissingFinals() {');
  const end=next.indexOf('\n  async scan() {',start);
  if(start<0||end<0||end-start<1500)throw Error('RECOVERY_METHOD_UNEXPECTED');
  let recovery=next.slice(start,end);
  const old='(sig?.status !== "PENDING" && !phase2IsEarly(sig))';
  const count=recovery.split(old).length-1;
  if(count!==2)throw Error('RECOVERY_PENDING_GATE_COUNT_'+count);
  const allow='(sig?.status !== "PENDING" && !(isVerifiedCornerMarket(sig?.market) && sig?.status === "UNRESOLVED") && !phase2IsEarly(sig))';
  recovery=recovery.split(old).join(allow);
  // A finished match can remain listed in HUB with missing corners:
  // give only native UNRESOLVED Corners a direct 5USD final recheck.
  const boardGate='if (boardIds.has(id)) continue;';
  if(recovery.split(boardGate).length!==2)throw Error('RECOVERY_BOARD_GATE_CHANGED');
  recovery=recovery.replace(boardGate,'if (boardIds.has(id) && !(isVerifiedCornerMarket(sig?.market) && sig?.status === "UNRESOLVED")) continue;');
  next=next.slice(0,start)+recovery+next.slice(end);
  for(const signature of [
    'var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2',
    'var BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3',
    'FINAL_RECHECK_MAX_PER_SCAN = 3',
    'FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3',
    'signal-ledger-v2-longterm'
  ])if(!next.includes(signature))throw Error('CONTRACT_CHANGED_'+signature);
  return next;
}
