/**
 * BALL46 multi-provider final-score evidence router.
 * PREPARATION ONLY. Pure/read-only: no network, DB, state mutation or settlement.
 *
 * Caller obligations: persist sourceIds at fixture discovery; pass collector-side
 * receivedAt (never a provider timestamp); use an atomic PENDING guard in the
 * existing settlement owner; never derive corners from score evidence.
 */
export const DEFAULT_PROVIDERS = Object.freeze({
  "5usd": Object.freeze({ capabilities: ["FT_SCORE"], minSamples: 1, minGapMs: 0 }),
  goaloo: Object.freeze({ capabilities: ["FT_SCORE"], minSamples: 2, minGapMs: 60_000 })
});

const name = value => String(value ?? "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, " ").trim().replace(/\s+/g, " ");
const timestamp = value => {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN;
  return Date.parse(value);
};
const scoreKey = o => o.score.home + ":" + o.score.away;
const validScore = s => s && Number.isInteger(s.home) && Number.isInteger(s.away)
  && s.home >= 0 && s.home <= 30 && s.away >= 0 && s.away <= 30;
const toRecord = (source, o) => ({
  source, sourceFixtureId: String(o.sourceFixtureId), receivedAt: o.receivedAt,
  score: { home: o.score.home, away: o.score.away }, phase: o.phase
});
const reject = reason => ({ ok: false, reason });

export function validateObservation(fixture, o, providers = DEFAULT_PROVIDERS) {
  if (!fixture || !o || typeof o !== "object") return reject("INVALID_INPUT");
  const policy = providers[o.source];
  if (!policy || !Array.isArray(policy.capabilities) || !policy.capabilities.includes("FT_SCORE"))
    return reject("UNREGISTERED_OR_UNSUPPORTED_SOURCE");
  if (!fixture.fixtureId || !fixture.sourceIds || !fixture.sourceIds[o.source])
    return reject("NO_PERSISTED_PROVIDER_MAPPING");
  if (String(o.sourceFixtureId || "") !== String(fixture.sourceIds[o.source]))
    return reject("PROVIDER_FIXTURE_ID_MISMATCH");
  if (!name(fixture.home) || !name(fixture.away) || !name(fixture.league) ||
      !name(o.home) || !name(o.away) || !name(o.league))
    return reject("IDENTITY_INCOMPLETE");
  if (name(o.home) !== name(fixture.home) || name(o.away) !== name(fixture.away))
    return reject("TEAM_MISMATCH");
  if (name(o.league) !== name(fixture.league)) return reject("LEAGUE_MISMATCH");
  const kickoff = timestamp(fixture.kickoffUtc), sourceKickoff = timestamp(o.kickoffUtc);
  if (!Number.isFinite(kickoff) || !Number.isFinite(sourceKickoff))
    return reject("KICKOFF_TIMEZONE_UNKNOWN");
  if (Math.abs(sourceKickoff - kickoff) > 30 * 60_000)
    return reject("KICKOFF_MISMATCH");
  if (o.phase !== "FT" || o.scoreScope !== "REGULATION_90")
    return reject("NOT_VERIFIED_REGULATION_FT");
  if (!validScore(o.score)) return reject("SCORE_INVALID");
  const received = timestamp(o.receivedAt);
  if (!Number.isFinite(received) || received < kickoff + 90 * 60_000)
    return reject("PREMATURE_OR_UNTRUSTED_RECEIPT");
  if (!Number.isInteger(policy.minSamples) || policy.minSamples < 1 ||
      !Number.isFinite(policy.minGapMs) || policy.minGapMs < 0)
    return reject("INVALID_PROVIDER_POLICY");
  return { ok: true, receivedAtMs: received, record: toRecord(o.source, o) };
}

function earliestStableEvidence(records, policy) {
  const sorted = [...records].sort((a, b) => a.receivedAtMs - b.receivedAtMs);
  let group = [], key = null;
  for (const entry of sorted) {
    const next = scoreKey(entry.record);
    if (next !== key) { group = []; key = next; }
    // Deduplicate identical timestamps: each sample must be a distinct poll.
    if (group.length && entry.receivedAtMs === group[group.length - 1].receivedAtMs) continue;
    group.push(entry);
    if (group.length >= policy.minSamples &&
        entry.receivedAtMs - group[0].receivedAtMs >= policy.minGapMs) {
      return { source: entry.record.source, verifiedAt: entry.receivedAtMs,
        receivedAt: entry.record.receivedAt, score: entry.record.score,
        samples: group.length, evidence: group.map(x => x.record) };
    }
  }
  return null;
}

/**
 * Observations from providers are considered independently. Winner is the
 * earliest result that met that provider's validation and stability policy.
 * HOLD on tied, contradictory FT evidence. This function never settles.
 */
export function evaluateResultRace({
  fixture, signalStatus, observations = [],
  providers = DEFAULT_PROVIDERS, existingSettlement = null
} = {}) {
  if (existingSettlement || signalStatus !== "PENDING")
    return { state: "NO_ACTION", reason: "NOT_PENDING_OR_ALREADY_SETTLED", writes: 0 };
  if (!fixture?.sourceIds || !Array.isArray(observations))
    return { state: "HOLD", reason: "MISSING_FIXTURE_OR_OBSERVATIONS", writes: 0 };
  const accepted = new Map(), rejected = [];
  for (const obs of observations) {
    const v = validateObservation(fixture, obs, providers);
    if (!v.ok) { rejected.push({ source: obs?.source || null, reason: v.reason }); continue; }
    const bucket = accepted.get(obs.source) || [];
    bucket.push(v);
    accepted.set(obs.source, bucket);
  }
  const eligible = [...accepted.entries()].map(([source, records]) =>
    earliestStableEvidence(records, providers[source])
  ).filter(Boolean).sort((a, b) => a.verifiedAt - b.verifiedAt);
  if (!eligible.length)
    return { state: "HOLD", reason: "NO_VERIFIED_FT", candidateSources: [...accepted.keys()],
      rejected, writes: 0 };
  const first = eligible[0], tie = eligible.filter(x => x.verifiedAt === first.verifiedAt);
  if (tie.some(x => scoreKey(x) !== scoreKey(first)))
    return { state: "HOLD", reason: "SIMULTANEOUS_CONFLICT", eligible, rejected, writes: 0 };
  const conflictsAfterFirst = eligible.filter(x => x.verifiedAt > first.verifiedAt &&
    scoreKey(x) !== scoreKey(first)).map(x => x.source);
  return {
    state: "READY_FOR_EXISTING_SETTLEMENT",
    fixtureId: String(fixture.fixtureId),
    metric: "FT_SCORE", winner: first, conflictsAfterFirst, rejected,
    requiresAtomicPendingCheck: true,
    settlementOwner: "BALL46_EXISTING_ENGINE",
    writes: 0
  };
}
