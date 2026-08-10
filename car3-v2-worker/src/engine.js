import { apiFetch } from './api.js';
import {
  LIVE_STATUSES, TERMINAL, VOID_STATUS, completeStatistics, fixtureSummary, inRange,
  marketsFor, momentum, normalizeFinal, normalizeStatistics, num, resultForSignal,
  selectedSides, swapStats
} from './football.js';
import {
  SIGNAL_LIMIT, activeConfig, claimLock, cleanupStates, cycleCount, ensureSchema,
  existingSignals, insertSignal, pendingSignals, releaseLock, saveState, settleSignal,
  statesFor, statusPayload
} from './db.js';

function keyFor(id, side) { return `${Number(id)}:${side}`; }

async function settlePending(env) {
  const pending = await pendingSignals(env);
  if (!pending.length) return { pending:0, settled:0, upstreamCalls:0 };
  const ids = [...new Set(pending.map(row=>Number(row.fixture_id)).filter(Number.isInteger))];
  const fixtures = new Map();
  let upstreamCalls = 0;
  for (let i=0; i<ids.length; i+=20) {
    const group = ids.slice(i,i+20);
    const { payload, upstream } = await apiFetch(`/fixtures?ids=${group.join('-')}`,env,55);
    if (upstream) upstreamCalls += 1;
    for (const item of payload?.response || []) {
      const fixture = normalizeFinal(item);
      if (fixture.id) fixtures.set(fixture.id,fixture);
    }
  }
  let settled = 0;
  for (const row of pending) {
    const fixture = fixtures.get(Number(row.fixture_id));
    if (!fixture || !TERMINAL.has(fixture.status)) continue;
    const isVoid = VOID_STATUS.has(fixture.status) || fixture.home===null || fixture.away===null;
    await settleSignal(env,row,fixture,isVoid?'NEUTRAL':resultForSignal(row,fixture),isVoid);
    settled += 1;
  }
  return { pending:pending.length, settled, upstreamCalls };
}

async function collectLive(env, config) {
  let upstreamCalls = 0;
  const { payload:livePayload, upstream:liveUpstream } = await apiFetch('/fixtures?live=all',env,50);
  if (liveUpstream) upstreamCalls += 1;
  const live = (livePayload?.response || []).map(fixtureSummary).filter(m=>LIVE_STATUSES.has(m.status));
  const preliminary = live.filter(m => {
    if (!m.id || m.minute===null || m.homeScore===null || m.awayScore===null) return false;
    if (m.minute<config.minuteMin || m.minute>config.minuteMax) return false;
    if (config.goalGapLimited && Math.abs(m.homeScore-m.awayScore)>config.maxGoalGap) return false;
    return true;
  });

  const stats = new Map();
  const ids = preliminary.map(m=>m.id);
  for (let i=0; i<ids.length; i+=20) {
    const group = ids.slice(i,i+20);
    const { payload, upstream } = await apiFetch(`/fixtures?ids=${group.join('-')}`,env,55);
    if (upstream) upstreamCalls += 1;
    for (const item of payload?.response || []) {
      const id = Number(item?.fixture?.id);
      if (id) stats.set(id,normalizeStatistics(item?.statistics));
    }
  }
  const statEligible = preliminary.map(match=>({match,stats:stats.get(match.id)||{}})).filter(row=>completeStatistics(row.stats));

  const odds = new Map();
  if (statEligible.length) {
    const { payload, upstream } = await apiFetch('/odds/live',env,50);
    if (upstream) upstreamCalls += 1;
    const wanted = new Set(statEligible.map(row=>row.match.id));
    for (const item of payload?.response || []) {
      const id = Number(item?.fixture?.id ?? item?.fixtureId ?? item?.id);
      if (wanted.has(id)) odds.set(id,item);
    }
  }
  return { live, preliminary, statEligible, odds, upstreamCalls };
}

function candidatesFrom(collected, config) {
  const candidates = [];
  for (const row of collected.statEligible) {
    for (const side of selectedSides(config)) {
      const away = side==='AWAY';
      const selectedTeam = away ? row.match.away : row.match.home;
      const opponent = away ? row.match.home : row.match.away;
      const selectedScore = away ? row.match.awayScore : row.match.homeScore;
      const opponentScore = away ? row.match.homeScore : row.match.awayScore;
      const stats = away ? swapStats(row.stats) : row.stats;
      const markets = marketsFor(collected.odds.get(row.match.id),selectedTeam,side);
      const selectedOdds = config.market==='AH' ? markets.ahOdds : markets.win;
      if (!inRange(selectedOdds,config.oddsMin,config.oddsMax)) continue;
      if (!inRange(markets.ah,config.ahMin,config.ahMax)) continue;
      if ((num(stats?.red_cards?.home)||0) > (num(stats?.red_cards?.away)||0)) continue;
      candidates.push({row,side,selectedTeam,opponent,selectedScore,opponentScore,stats,markets,selectedOdds});
    }
  }
  return candidates;
}

export async function runCycle(env) {
  await ensureSchema(env);
  const started = Date.now();
  if (!(await claimLock(env,started))) return {ok:true,skipped:'LOCKED'};
  try {
    const config = await activeConfig(env);
    const beforeCount = await cycleCount(env,started);
    const settledBefore = await settlePending(env);
    if (beforeCount>=SIGNAL_LIMIT) {
      const pendingLeft = Math.max(0,settledBefore.pending-settledBefore.settled);
      const snapshot = {mode:pendingLeft?'SETTLING_PENDING_RESULTS':'DAILY_SLEEP',signalCapturePaused:true,cycleCount:beforeCount,cycleLimit:SIGNAL_LIMIT,pendingResults:pendingLeft,upstreamCallsThisRun:settledBefore.upstreamCalls};
      await releaseLock(env,true,snapshot);
      return {ok:true,...snapshot};
    }

    const collected = await collectLive(env,config);
    const candidates = candidatesFrom(collected,config);
    const keys = candidates.map(c=>keyFor(c.row.match.id,c.side));
    const [states,existing] = await Promise.all([statesFor(env,keys),existingSignals(env,keys)]);
    let count = beforeCount;
    let newSignals = 0;
    let momentumReady = 0;
    const sample = [];

    for (const c of candidates) {
      const key = keyFor(c.row.match.id,c.side);
      const previous = states.get(key)||null;
      const calc = momentum(c.stats,previous);
      if (calc) momentumReady += 1;
      const pass = Boolean(calc && calc.selected>=config.momentumMin && (!config.attackEvidenceEnabled || Number(calc.evidence||0)>=1));
      const streak = pass ? Number(previous?.streak||0)+1 : 0;
      let triggered = existing.has(key) || Boolean(previous && Number(previous.triggered));

      if (!triggered && pass && streak>=config.confirmationRounds && count<SIGNAL_LIMIT) {
        const inserted = await insertSignal(env,{key,fixtureId:c.row.match.id,side:c.side,market:config.market,selectedTeam:c.selectedTeam,opponent:c.opponent,actualHome:c.row.match.home,actualAway:c.row.match.away,league:c.row.match.league,country:c.row.match.country,minute:Number(c.row.match.minute||0),selectedScore:c.selectedScore,opponentScore:c.opponentScore,actualHomeScore:c.row.match.homeScore,actualAwayScore:c.row.match.awayScore,momentum:calc.selected,selectedOdds:c.selectedOdds,ahLine:c.markets.ah,ahOdds:c.markets.ahOdds});
        if (inserted) { triggered=true; count+=1; newSignals+=1; }
      }
      await saveState(env,{key,fixtureId:c.row.match.id,side:c.side,stats:c.stats,percent:calc?.selected??null,streak,triggered,minute:Number(c.row.match.minute||0)});
      sample.push({fixtureId:c.row.match.id,side:c.side,selectedTeam:c.selectedTeam,opponent:c.opponent,minute:c.row.match.minute,score:`${c.selectedScore}-${c.opponentScore}`,momentum:calc?.selected??null,evidence:calc?.evidence??null,streak,market:config.market,selectedOdds:c.selectedOdds,ahLine:c.markets.ah,ahOdds:c.markets.ahOdds,triggered});
    }

    await cleanupStates(env);
    const settledAfter = await settlePending(env);
    const pendingLeft = Math.max(0,settledAfter.pending-settledAfter.settled);
    const snapshot = {mode:count>=SIGNAL_LIMIT?(pendingLeft?'SETTLING_PENDING_RESULTS':'DAILY_SLEEP'):'SCANNING',signalCapturePaused:count>=SIGNAL_LIMIT,cycleCount:count,cycleLimit:SIGNAL_LIMIT,allLive:collected.live.length,minuteWindow:collected.preliminary.length,completeStats:collected.statEligible.length,candidates:candidates.length,momentumReady,newSignals,pendingResults:pendingLeft,upstreamCallsThisRun:collected.upstreamCalls+settledBefore.upstreamCalls+settledAfter.upstreamCalls,sample:sample.slice(0,30),completedAt:new Date().toISOString()};
    await releaseLock(env,true,snapshot);
    return {ok:true,...snapshot};
  } catch (error) {
    await releaseLock(env,false,null,error?.message||String(error));
    throw error;
  }
}

export async function status(env) {
  await ensureSchema(env);
  return statusPayload(env);
}
