import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, evaluateResultRace, validateObservation } from "../router.mjs";

const fixture = Object.freeze({
  fixtureId: "BALL46-0001", home: "Alpha FC", away: "Beta United",
  league: "Premier Example", kickoffUtc: "2026-10-17T12:00:00Z",
  sourceIds: { "5usd": "50001", goaloo: "30001", future: "70001" }
});
const providers = {
  ...DEFAULT_PROVIDERS,
  future: { capabilities: ["FT_SCORE"], minSamples: 2, minGapMs: 30_000 }
};
const make = (source, time, score = { home: 2, away: 0 }, fields = {}) => ({
  source, sourceFixtureId: fixture.sourceIds[source],
  home: fixture.home, away: fixture.away, league: fixture.league,
  kickoffUtc: fixture.kickoffUtc, phase: "FT", scoreScope: "REGULATION_90",
  score, receivedAt: time, ...fields
});
const race = (observations, settings = {}) => evaluateResultRace({
  fixture, signalStatus: "PENDING", observations, providers, ...settings
});

test("5USD can win result race without waiting for Goaloo", () => {
  const r = race([
    make("5usd", "2026-10-17T13:32:00Z"),
    make("goaloo", "2026-10-17T13:31:00Z"),
    make("goaloo", "2026-10-17T13:33:00Z")
  ]);
  assert.equal(r.state, "READY_FOR_EXISTING_SETTLEMENT");
  assert.equal(r.winner.source, "5usd");
  assert.equal(r.writes, 0);
});

test("Goaloo wins when stable FT is verified before 5USD arrives", () => {
  const r = race([
    make("goaloo", "2026-10-17T13:30:00Z"),
    make("goaloo", "2026-10-17T13:31:30Z"),
    make("5usd", "2026-10-17T13:32:00Z")
  ]);
  assert.equal(r.winner.source, "goaloo");
  assert.equal(r.winner.samples, 2);
});

test("future source can be registered without router code edits", () => {
  const r = race([
    make("future", "2026-10-17T13:31:00Z"),
    make("future", "2026-10-17T13:31:35Z"),
    make("5usd", "2026-10-17T13:33:00Z")
  ]);
  assert.equal(r.winner.source, "future");
});

test("unknown future provider blocks until configured", () => {
  const obs = make("future", "2026-10-17T13:31:00Z");
  assert.equal(validateObservation(fixture, obs).reason, "UNREGISTERED_OR_UNSUPPORTED_SOURCE");
});

test("unpersisted source mapping blocks new provider", () => {
  const obs = make("future", "2026-10-17T13:31:00Z");
  const x = { ...fixture, sourceIds: { "5usd": "50001", goaloo: "30001" } };
  assert.equal(validateObservation(x, obs, providers).reason, "NO_PERSISTED_PROVIDER_MAPPING");
});

test("source id mismatch rejected, even when names and kickoff match", () => {
  const x = make("goaloo", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { sourceFixtureId: "99999" });
  assert.equal(validateObservation(fixture, x, providers).reason, "PROVIDER_FIXTURE_ID_MISMATCH");
});

test("swapped home and away rejected", () => {
  const o = make("goaloo", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { home: fixture.away, away: fixture.home });
  assert.equal(validateObservation(fixture, o, providers).reason, "TEAM_MISMATCH");
});

test("league mismatch rejected", () => {
  const o = make("goaloo", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { league: "Another League" });
  assert.equal(validateObservation(fixture, o, providers).reason, "LEAGUE_MISMATCH");
});

test("kickoff difference greater than 30m rejected", () => {
  const o = make("goaloo", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { kickoffUtc: "2026-10-17T13:00:00Z" });
  assert.equal(validateObservation(fixture, o, providers).reason, "KICKOFF_MISMATCH");
});

test("non-offset raw kickoff or missing UTC rejected", () => {
  const o = make("goaloo", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { kickoffUtc: "2026-10-17 12:00:00" });
  assert.equal(validateObservation(fixture, o, providers).reason, "KICKOFF_TIMEZONE_UNKNOWN");
});

test("no result from nonfinal or extra-time scope", () => {
  const noFt = make("5usd", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { phase: "2H" });
  const aet = make("5usd", "2026-10-17T13:31:00Z", { home: 2, away: 0 }, { scoreScope: "AET" });
  assert.equal(validateObservation(fixture, noFt, providers).reason, "NOT_VERIFIED_REGULATION_FT");
  assert.equal(validateObservation(fixture, aet, providers).reason, "NOT_VERIFIED_REGULATION_FT");
});

test("bad or implausible scores rejected", () => {
  assert.equal(validateObservation(fixture, make("5usd", "2026-10-17T13:31:00Z", { home: null, away: 0 }), providers).reason, "SCORE_INVALID");
  assert.equal(validateObservation(fixture, make("5usd", "2026-10-17T13:31:00Z", { home: 99, away: 0 }), providers).reason, "SCORE_INVALID");
});

test("premature FT at 70th minute rejected", () => {
  const o = make("5usd", "2026-10-17T13:10:00Z");
  assert.equal(validateObservation(fixture, o, providers).reason, "PREMATURE_OR_UNTRUSTED_RECEIPT");
});

test("Goaloo one snapshot is insufficient", () => {
  const r = race([make("goaloo", "2026-10-17T13:31:00Z")]);
  assert.equal(r.state, "HOLD");
});

test("Goaloo duplicated poll timestamp is insufficient", () => {
  const r = race([
    make("goaloo", "2026-10-17T13:31:00Z"),
    make("goaloo", "2026-10-17T13:31:00Z")
  ]);
  assert.equal(r.state, "HOLD");
});

test("Goaloo changed score resets stability window", () => {
  const r = race([
    make("goaloo", "2026-10-17T13:30:00Z", { home: 2, away: 0 }),
    make("goaloo", "2026-10-17T13:31:10Z", { home: 2, away: 1 })
  ]);
  assert.equal(r.state, "HOLD");
});

test("Goaloo stable observations with insufficient elapsed gap hold", () => {
  const r = race([
    make("goaloo", "2026-10-17T13:31:00Z"),
    make("goaloo", "2026-10-17T13:31:30Z")
  ]);
  assert.equal(r.state, "HOLD");
});

test("already settled signals are never eligible", () => {
  const r = race([make("5usd", "2026-10-17T13:32:00Z")], { signalStatus: "SETTLED" });
  assert.equal(r.state, "NO_ACTION");
});

test("existing settlement always protects against replacing winner", () => {
  const r = race([make("5usd", "2026-10-17T13:32:00Z")], { existingSettlement: { source: "goaloo" } });
  assert.equal(r.state, "NO_ACTION");
});

test("different scores at exactly same first-verification time cause HOLD", () => {
  const r = race([
    make("5usd", "2026-10-17T13:33:00Z", { home: 2, away: 0 }),
    make("future", "2026-10-17T13:32:00Z", { home: 1, away: 0 }),
    make("future", "2026-10-17T13:33:00Z", { home: 1, away: 0 })
  ]);
  assert.equal(r.state, "HOLD");
  assert.equal(r.reason, "SIMULTANEOUS_CONFLICT");
});

test("later conflicting result is logged; never overrides first eligible", () => {
  const r = race([
    make("5usd", "2026-10-17T13:31:00Z", { home: 2, away: 0 }),
    make("goaloo", "2026-10-17T13:32:00Z", { home: 1, away: 0 }),
    make("goaloo", "2026-10-17T13:33:10Z", { home: 1, away: 0 })
  ]);
  assert.equal(r.winner.source, "5usd");
  assert.deepEqual(r.conflictsAfterFirst, ["goaloo"]);
});

test("read-only result has no corners or judgement side effects", () => {
  const r = race([make("5usd", "2026-10-17T13:31:00Z")]);
  assert.equal(r.metric, "FT_SCORE");
  assert.equal(r.settlementOwner, "BALL46_EXISTING_ENGINE");
  assert.equal(r.requiresAtomicPendingCheck, true);
  assert.equal(r.writes, 0);
  assert.equal(Object.hasOwn(r, "winLoss"), false);
  assert.equal(Object.hasOwn(r, "corners"), false);
});
