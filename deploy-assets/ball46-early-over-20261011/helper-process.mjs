export const processLive = String.raw`
function phase2ApplyLive(signals, fixtures, snapshotAt, stale) {
  const changed = [], at = now();
  if (stale) return changed;
  for (const s of signals) {
    if (!s?.id || !s.fixtureId || !phase2Market(s)) continue;
    const f = fixtures.get(String(s.fixtureId));
    if (!f) continue;
    if (phase2IsEarly(s)) {
      if (periodCompleteForSignal(s, f)) {
        const result = settleMarketSignal(s, f);
        if (result) { phase2ConfirmFinal(s, f, result, at); changed.push(s); }
      } else {
        const live = phase2LiveFixture(s, f);
        if (live) {
          const result = settleMarketSignal(s, live);
          if (result && result !== "WIN") { phase2Reopen(s, at); changed.push(s); }
        }
      }
      continue;
    }
    if (s.status !== "PENDING") continue;
    if (!Number.isFinite(Number(snapshotAt)) || Number(snapshotAt) <= Number(s.createdAt || 0)) continue;
    if (phase2EntryAlreadyWon(s)) continue;
    const live = phase2LiveFixture(s, f);
    if (!live || settleMarketSignal(s, live) !== "WIN") continue;
    phase2Win(s, live, at); changed.push(s);
  }
  return changed;
}
`;
