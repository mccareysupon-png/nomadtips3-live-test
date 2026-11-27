export const transitions = String.raw`
function phase2Win(s, f, at) {
  if (s.result !== "WIN") { s.previousResult = s.result || "PENDING"; s.reconciledAt = at; }
  s.status = "SETTLED"; s.result = "WIN";
  s.finalScore = clone(f.goals); s.finalCorners = clone(f.corners); s.finalCards = clone(f.cards);
  s.settledAt = at; s.settlementError = null;
  s.settlementSource = PHASE2_OVER_SOURCE; s.settlementRevision = SETTLEMENT_REVISION;
}
function phase2Reopen(s, at) {
  s.previousResult = "WIN"; s.reconciledAt = at;
  s.status = "PENDING"; s.result = "PENDING";
  s.settledAt = null; s.finalScore = null; s.finalCorners = null; s.finalCards = null;
  s.settlementSource = "LIVE_OVER_REVERTED_V1"; s.settlementError = null;
}
function phase2ConfirmFinal(s, f, result, at) {
  if (s.result !== result) { s.previousResult = s.result; s.reconciledAt = at; }
  s.status = "SETTLED"; s.result = result;
  s.finalScore = clone(f.goals); s.finalCorners = clone(f.corners); s.finalCards = clone(f.cards);
  s.settlementError = null; s.settlementSource = "LIVE_OVER_FINAL_CONFIRMED_V1";
  s.settlementRevision = SETTLEMENT_REVISION;
}
`;
