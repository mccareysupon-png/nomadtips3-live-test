export const core = String.raw`
var PHASE2_OVER_SOURCE = "LIVE_OVER_EARLY_V1";
function phase2IsEarly(s) {
  return s?.status === "SETTLED" && s?.settlementSource === PHASE2_OVER_SOURCE;
}
function phase2Market(s) {
  return ["ft_over", "ht_over", "ft_corner_over", "ht_corner_over"].includes(s?.market) &&
    String(s?.selection || "").toUpperCase() === "OVER";
}
function phase2LiveFixture(s, f) {
  if (!phase2Market(s) || !f || !isLive(f) || isFinished(f)) return null;
  const def = MARKET_RULES[s.market];
  if (def?.period !== "HT") return f;
  if (isHalfComplete(f)) return null;
  const minute = num(f.minute);
  if (minute === null || minute < 0 || minute > 45) return null;
  const data = def.basis === "corners" ? f.corners : f.goals;
  const home = num(data?.home), away = num(data?.away);
  if (home === null || away === null || home < 0 || away < 0) return null;
  return { ...f, [def.basis]: { ...data, halfHome: home, halfAway: away } };
}
function phase2EntryAlreadyWon(s) {
  const data = s.market?.includes("corner") ? s.entryCorners : (s.entryScore ?? s.scoreAt);
  const home = num(data?.home), away = num(data?.away);
  if (home === null || away === null || home < 0 || away < 0) return true;
  return settleOu(home + away, s.line, "OVER") === "WIN";
}
`;
