import assert from 'node:assert/strict';

// Exact adapter captured from active Production; Engine service code is not patched.
export const before = "async function engineBoardResponse(request, env) {\n  const engineResponse = await env.ENGINE.fetch(engineRequest(request, \"/board\"));\n  const engineBoard = engineResponse.ok ? await engineResponse.clone().json().catch(() => null) : null;\n  const engineHasOdds = boardHasBookmakerOdds(engineBoard);\n  if (engineResponse.ok && engineBoard?.ok === true && engineHasOdds) {\n    const enriched2 = await enrichBoardWithCachedFullMarket(engineBoard, env);\n    if (!enriched2.changed) return engineResponse;\n    return Response.json(enriched2.board, { headers: { \"cache-control\": \"no-store\", \"x-ball46-board-source\": \"engine-plus-central-full-market-cache\" } });\n  }\n  const hubResponse = await env.HUB.fetch(hubRequest(request, \"/snapshot\"));\n  if (!hubResponse.ok) return engineResponse;\n  const hub = await hubResponse.json().catch(() => null);\n  if (!hub || hub.ok !== true || !Array.isArray(hub.fixtures)) return engineResponse;\n  const hubHasOdds = boardHasBookmakerOdds(hub);\n  if (engineResponse.ok && !hubHasOdds) return engineResponse;\n  const fallbackBoard = {\n    ...hub,\n    version: \"ball46-board-fallback-john-continuity-v2-odds-aware\",\n    engineBoardFallback: true,\n    engineBoardFallbackReason: engineResponse.ok ? \"ENGINE_BOARD_ODDS_EMPTY\" : \"ENGINE_BOARD_ERROR\",\n    engineBoardStatus: engineResponse.status,\n    engineBoardHasOdds: engineHasOdds,\n    hubBoardHasOdds: hubHasOdds,\n    hubVersion: hub.version,\n    hubFetchedAt: hub.fetchedAt ?? null,\n    hubAgeMs: hub.ageMs ?? null,\n    referee: { mode: \"HUB_SNAPSHOT_FALLBACK\", externalRequestsAdded: 0, requests: 0, queued: 0, errors: [] }\n  };\n  const enriched = await enrichBoardWithCachedFullMarket(fallbackBoard, env);\n  return Response.json(enriched.board, { headers: { \"cache-control\": \"no-store\", \"x-ball46-board-source\": enriched.changed ? \"hub-plus-central-full-market-cache\" : \"hub-snapshot-fallback\" } });\n}\n";
export const after = before
  .replace('  const engineResponse = await env.ENGINE.fetch(engineRequest(request, "/board"));\n  const engineBoard = engineResponse.ok ? await engineResponse.clone().json().catch(() => null) : null;', `  let engineResponse, engineReadFailure = null;
  const unavailable = code => Response.json({ ok: false, error: code }, {
    status: 503, headers: { "cache-control": "no-store" }
  });
  try {
    engineResponse = await env.ENGINE.fetch(engineRequest(request, "/board"));
  } catch {
    engineReadFailure = "ENGINE_BOARD_FETCH_FAILED";
    console.error("B46_BOARD_ENGINE_FETCH_FAILED");
    engineResponse = unavailable(engineReadFailure);
  }
  let engineBoard = null;
  if (engineResponse.ok) {
    try { engineBoard = await engineResponse.clone().json(); }
    catch {
      engineReadFailure = "ENGINE_BOARD_INVALID_JSON";
      console.error("B46_BOARD_ENGINE_INVALID_JSON");
      engineResponse = unavailable(engineReadFailure);
    }
  }`)
  .replace('  const hubResponse = await env.HUB.fetch(hubRequest(request, "/snapshot"));\n  if (!hubResponse.ok) return engineResponse;\n  const hub = await hubResponse.json().catch(() => null);\n  if (!hub || hub.ok !== true || !Array.isArray(hub.fixtures)) return engineResponse;', `  let hub;
  try {
    const hubResponse = await env.HUB.fetch(hubRequest(request, "/snapshot"));
    if (!hubResponse.ok) return engineResponse;
    hub = await hubResponse.json();
  } catch {
    console.error("B46_BOARD_HUB_SNAPSHOT_READ_FAILED");
    return engineResponse;
  }
  // Recover only from the existing fresh cache; never fetch providers or relabel stale data.
  if (!hub || hub.ok !== true || !Array.isArray(hub.fixtures) ||
      hub.cacheOnly !== true || hub.externalRequestsAdded !== 0 || hub.stale !== false ||
      !Number.isFinite(hub.fetchedAt) || hub.fetchedAt <= 0 ||
      !Number.isFinite(hub.ageMs) || hub.ageMs < 0) return engineResponse;`)
  .replace('engineBoardFallbackReason: engineResponse.ok ? "ENGINE_BOARD_ODDS_EMPTY" : "ENGINE_BOARD_ERROR",', 'engineBoardFallbackReason: engineReadFailure || (engineResponse.ok ? "ENGINE_BOARD_ODDS_EMPTY" : "ENGINE_BOARD_ERROR"),');

assert.notEqual(after, before);
export function patchMain(main) {
  assert.equal(main.split(before).length, 2, 'BOARD_ADAPTER_SOURCE_DRIFT');
  const next = main.replace(before, () => after);
  assert.equal(next.replace(after, () => before), main, 'UNRELATED_SOURCE_CHANGED');
  return next;
}
