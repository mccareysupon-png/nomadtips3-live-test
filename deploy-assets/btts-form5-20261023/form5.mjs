/* BALL46 BTTS Form5 v1 — deterministic pre-match signal model.
 * No odds, bookmakers, player positions, or historical league ranks are assumed.
 * Needs EXACTLY five completed earlier games per team, stored with time-cutoff.
 * This is a prediction experiment, not a profitability/ROI claim.
 */
const finite = (n) => n !== null && n !== undefined && n !== '' && typeof n !== 'boolean' && Number.isFinite(Number(n)) ? Number(n) : null;
const asId = (v) => String(v ?? '').trim();
const parseTime = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
    const n = Number(v), ms = n < 100000000000 ? n * 1000 : n;
    return Number.isFinite(ms) ? ms : null;
  }
  const p = Date.parse(String(v)); return Number.isFinite(p) ? p : null;
};
export function pickForm5(teamId, fixtures, cutoffUtc) {
  const id = asId(teamId), cutoff = parseTime(cutoffUtc);
  if (!id || !Number.isFinite(cutoff)) return { ok: false, reason: 'INVALID_TEAM_OR_CUTOFF', fixtures: [] };
  if (!Array.isArray(fixtures)) return { ok: false, reason: 'NO_HISTORY', fixtures: [] };
  const seen = new Set(), valid = [];
  for (const f of fixtures) {
    const fid = asId(f?.fixtureId ?? f?.id);
    const kickoff = parseTime(f?.kickoffUtc ?? f?.kickoff_utc ?? f?.kickoff_ts ?? f?.kickoffAt);
    const homeId = asId(f?.teams?.home?.id ?? f?.home?.id ?? f?.home_id);
    const awayId = asId(f?.teams?.away?.id ?? f?.away?.id ?? f?.away_id);
    const code = String(f?.status?.short ?? f?.status?.name ?? f?.status_code ?? f?.status ?? f?.boardState ?? '').toLowerCase();
    const isFinished = /^(ft|full|full_time|finished|ended|complete|completed)$/.test(code);
    // Exclude extra time, awarded games, cancellations, forfeits and incomplete status.
    const bad = /aet|penalt|award|forfeit|cancel|abandon|postpon|suspend/.test(JSON.stringify([f?.status,f?.status_reason,f?.statusReason,f?.status_code]).toLowerCase());
    const home = finite(f?.goals?.home ?? f?.score?.home), away = finite(f?.goals?.away ?? f?.score?.away);
    if (!fid || seen.has(fid) || !isFinished || bad || !Number.isFinite(kickoff) || kickoff >= cutoff ||
       (id !== homeId && id !== awayId) || home === null || away === null || home < 0 || away < 0 ||
       !Number.isInteger(home) || !Number.isInteger(away)) continue;
    seen.add(fid);
    valid.push({ fixtureId: fid, kickoffUtc: new Date(kickoff).toISOString(),
      scored: id === homeId ? home : away,
      conceded: id === homeId ? away : home,
      score: [home, away], homeId, awayId });
  }
  valid.sort((a,b)=> Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc) || a.fixtureId.localeCompare(b.fixtureId));
  if (valid.length < 5) return { ok: false, reason: 'INSUFFICIENT_FINISHED_HISTORY', observed: valid.length, fixtures: valid };
  const rows=valid.slice(0,5);
  return { ok: true, count: 5, scoredGames: rows.filter(x=>x.scored>0).length,
    concededGames: rows.filter(x=>x.conceded>0).length,
    noGoalGames: rows.filter(x=>x.scored===0).length,
    bttsGames: rows.filter(x=>x.scored>0&&x.conceded>0).length,
    fixtures: rows };
}
export function evaluateBTTSForm5(input, homeFixtures, awayFixtures, issuedAt=Date.now()) {
  const fid=asId(input?.fixtureId ?? input?.id);
  const kickoff=parseTime(input?.kickoffUtc ?? input?.kickoff_utc ?? input?.kickoffAt ?? input?.kickoff_ts);
  const homeId=asId(input?.home?.id ?? input?.teams?.home?.id),awayId=asId(input?.away?.id ?? input?.teams?.away?.id);
  const now=parseTime(issuedAt);
  const base={model:'B46_BTTS_FORM5_V1', fixtureId:fid, homeTeamId:homeId, awayTeamId:awayId, kickoffUtc:kickoff!==null?new Date(kickoff).toISOString():null,
    selection:null, market:null, status:'NO_SIGNAL', reason:'', odds:null, bookmaker:null };
  if(!fid||!homeId||!awayId||homeId===awayId||!Number.isFinite(kickoff)||!Number.isFinite(now))return {...base,reason:'INVALID_FIXTURE'};
  if(kickoff<=now)return {...base,reason:'KICKOFF_ALREADY_STARTED'};
  const home=pickForm5(homeId,homeFixtures,kickoff),away=pickForm5(awayId,awayFixtures,kickoff);
  if(!home.ok||!away.ok)return {...base,reason:!home.ok?'HOME_'+home.reason:'AWAY_'+away.reason,homeForm:home,awayForm:away};
  const yes=home.scoredGames>=4&&away.scoredGames>=4&&home.concededGames>=3&&away.concededGames>=3;
  const no=home.noGoalGames>=3||away.noGoalGames>=3;
  const selection=yes?'YES':no?'NO':null;
  return {...base,selection,market:selection==='YES'?'ft_btts_yes':selection==='NO'?'ft_btts_no':null,
    status:selection?'PENDING':'NO_SIGNAL',
    reason:selection?(selection==='YES'?'BOTH_ATTACK_4_AND_DEFENSE_3':'TEAM_SCORELESS_3'):'NEUTRAL',
    homeForm:home,awayForm:away,
    issuedAt:new Date(now).toISOString(),
    // Deterministic ID ensures one pick per fixture regardless of scans.
    id:'btts-form5-v1:'+fid };
}
export function settleBTTSForm5(signal, finalFixture,settledAt=Date.now()){
  if(!signal || signal.status!=='PENDING' || !['YES','NO'].includes(signal.selection))return{ok:false,reason:'NOT_PENDING'};
  if(asId(finalFixture?.fixtureId??finalFixture?.id)!==asId(signal.fixtureId))return{ok:false,reason:'FIXTURE_MISMATCH'};
  const status=String(finalFixture?.status_code??finalFixture?.status?.short??finalFixture?.status??finalFixture?.boardState??'').toLowerCase();
  if(!/^(ft|full|full_time|finished|ended|complete|completed)$/.test(status))return{ok:false,reason:'NOT_FINAL'};
  const gh=finite(finalFixture?.goals?.home??finalFixture?.score?.home),ga=finite(finalFixture?.goals?.away??finalFixture?.score?.away);
  if(gh===null||ga===null||gh<0||ga<0||!Number.isInteger(gh)||!Number.isInteger(ga))return{ok:false,reason:'MISSING_VALID_FT_SCORE'};
  const both=gh>0&&ga>0;
  return{ok:true,result:(signal.selection==='YES'===both)?'WIN':'LOSS',finalScore:{home:gh,away:ga},settledAt:new Date(parseTime(settledAt)).toISOString(),id:signal.id};
}
export function aggregateBTTS(rows){
 const settled=rows.filter(x=>x.status==='SETTLED'&&['WIN','LOSS'].includes(x.result));
 const win=settled.filter(x=>x.result==='WIN').length,loss=settled.length-win;
 return {settled:settled.length,win,loss,winRate:settled.length?Math.round(win/settled.length*1000)/10:null,
  pending:rows.filter(x=>x.status==='PENDING').length,
  byMarket:{ft_btts_yes:settled.filter(x=>x.market==='ft_btts_yes').length,
    ft_btts_no:settled.filter(x=>x.market==='ft_btts_no').length}};
}
