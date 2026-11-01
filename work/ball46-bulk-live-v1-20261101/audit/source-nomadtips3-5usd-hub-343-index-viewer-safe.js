var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index-v2.js
var VERSION = "nomad343-5usd-hub-v5-last-good-continuity";
var API_BASE = "https://api.5dollarfootballapi.com/v1";
var DEFAULT_LIVE_REFRESH_SECONDS = 120;
var TODAY_REFRESH_MS = 12e4;
var STALE_MS = 18e4;
var TIMEOUT_MS = 15e3;
var TODAY_PAGE_SIZE = 50;
var LIVE_PAGE_SIZE = 500;
var TODAY_MAX_PAGES = 4;
var LIVE_MAX_PAGES = 1;
var MAX_PROVIDER_REQUESTS_PER_TODAY_REFRESH = 5;
var CHUNK_BYTES = 72e3;
var PRESET_SECONDS = /* @__PURE__ */ new Set([2, 3, 6, 15, 30, 60, 120]);
var AUTO_RETURN_MINUTES = /* @__PURE__ */ new Set([0, 30, 60, 120]);
var ACCOUNT_LIMIT_PER_MINUTE = 40;
var encoder = new TextEncoder();
var now = /* @__PURE__ */ __name(() => Date.now(), "now");
var finite = /* @__PURE__ */ __name((v) => v === null || v === void 0 || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v), "finite");
var text = /* @__PURE__ */ __name((v) => v === null || v === void 0 ? null : String(v), "text");
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set(["https://www.nomadtips3.com", "https://nomadtips3.com", "https://mccareysupon-png.github.io", "http://localhost:8787", "http://127.0.0.1:8787"]);
function headers(request) {
  const origin = request.headers.get("origin") || "";
  const h = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": "GET,PUT,OPTIONS", "access-control-allow-headers": "content-type", vary: "Origin" });
  h.set("access-control-allow-origin", ALLOWED_ORIGINS.has(origin) ? origin : "https://www.nomadtips3.com");
  return h;
}
__name(headers, "headers");
function json(request, body, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: headers(request) });
}
__name(json, "json");
function pair(v) {
  if (!v || typeof v !== "object") return null;
  const home = finite(v.home), away = finite(v.away);
  return home === null && away === null ? null : { home, away };
}
__name(pair, "pair");
function score(v) {
  if (!v || typeof v !== "object") return null;
  return { home: finite(v.home), away: finite(v.away), halfHome: finite(v.half_home ?? v.halfHome), halfAway: finite(v.half_away ?? v.halfAway) };
}
__name(score, "score");
function cards(v) {
  if (!v || typeof v !== "object") return null;
  const side = /* @__PURE__ */ __name((x) => x && typeof x === "object" ? { yellow: finite(x.yellow), red: finite(x.red) } : null, "side");
  return { home: side(v.home), away: side(v.away) };
}
__name(cards, "cards");
function team(f, side) {
  const r = f?.teams?.[side] ?? f?.[`${side}_team`] ?? f?.[side] ?? {};
  return { id: text(r?.id ?? f?.[`${side}_id`] ?? null), name: text(r?.name ?? f?.[`${side}_name`] ?? null) };
}
__name(team, "team");
function league(f) {
  const r = f?.league ?? f?.competition ?? {};
  return { id: text(r?.id ?? f?.league_id ?? f?.competition_id ?? null), name: text(r?.name ?? f?.league_name ?? f?.competition_name ?? null), country: text(r?.country?.name ?? r?.country ?? f?.country ?? null) };
}
__name(league, "league");
function statistics(r) {
  if (!r || typeof r !== "object") return null;
  const out = { attacks: pair(r.attacks), dangerousAttacks: pair(r.dangerous_attacks ?? r.dangerousAttacks), shotsOnTarget: pair(r.shots_on_target ?? r.shotsOnTarget), shotsOffTarget: pair(r.shots_off_target ?? r.shotsOffTarget), possession: pair(r.possession) };
  if (!Object.values(out).some(Boolean)) return null;
  const h = r.first_half ?? r.half;
  out.half = h && typeof h === "object" ? { attacks: pair(h.attacks), dangerousAttacks: pair(h.dangerous_attacks ?? h.dangerousAttacks), shotsOnTarget: pair(h.shots_on_target ?? h.shotsOnTarget), shotsOffTarget: pair(h.shots_off_target ?? h.shotsOffTarget), possession: pair(h.possession) } : null;
  return out;
}
__name(statistics, "statistics");
function fixtureId(f) {
  return text(f?.id ?? f?.fixture_id ?? f?.fixture?.id ?? null);
}
__name(fixtureId, "fixtureId");
function kickoffUtc(f) {
  return text(f?.kickoff_utc ?? f?.kickoffUtc ?? f?.start_time ?? f?.kickoff ?? f?.date ?? null);
}
__name(kickoffUtc, "kickoffUtc");
function plainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
__name(plainObject, "plainObject");
function deepKeep(base, extra) {
  if (extra === null || extra === void 0 || extra === "") return base;
  if (base === null || base === void 0) return extra;
  if (Array.isArray(base) || Array.isArray(extra)) return Array.isArray(extra) && extra.length ? extra : base;
  if (plainObject(base) && plainObject(extra)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(extra)) out[k] = deepKeep(out[k], v);
    return out;
  }
  return extra;
}
__name(deepKeep, "deepKeep");
function bookmakerKey(v, i = 0) {
  return String(v?.id ?? v?.slug ?? v?.name ?? v?.bookmaker?.id ?? v?.bookmaker?.slug ?? v?.bookmaker?.name ?? `#${i}`).toLowerCase().replace(/[\s_-]/g, "");
}
__name(bookmakerKey, "bookmakerKey");
function mergeBookmakers(base, extra) {
  const out = Array.isArray(base) ? base.map((x) => plainObject(x) ? { ...x } : x) : [];
  const pos = new Map(out.map((x, i) => [bookmakerKey(x, i), i]));
  for (const [i, row] of (Array.isArray(extra) ? extra : []).entries()) {
    const key = bookmakerKey(row, i), at = pos.get(key);
    if (at === void 0) {
      pos.set(key, out.length);
      out.push(row);
    } else out[at] = deepKeep(out[at], row);
  }
  return out;
}
__name(mergeBookmakers, "mergeBookmakers");
function providerOddsRaw(f) {
  const out = {};
  if (f?.bookmakers !== void 0 && f?.bookmakers !== null) out.bookmakers = f.bookmakers;
  if (f?.bet365 !== void 0 && f?.bet365 !== null) out.bet365 = f.bet365;
  if (f?.markets !== void 0 && f?.markets !== null) out.markets = f.markets;
  if (f?.odds !== void 0 && f?.odds !== null) out.odds = f.odds;
  return Object.keys(out).length ? out : null;
}
__name(providerOddsRaw, "providerOddsRaw");
function mergeProviderOdds(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === void 0 || v === "") continue;
    out[k] = k === "bookmakers" && Array.isArray(v) ? mergeBookmakers(out[k], v) : deepKeep(out[k], v);
  }
  return out;
}
__name(mergeProviderOdds, "mergeProviderOdds");
function sameJson(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}
__name(sameJson, "sameJson");
function continuityState(base, extra, mergedOdds) {
  const baseOdds = base?.providerOdds ?? null, extraOdds = extra?.providerOdds ?? null;
  const usedLastGood = Boolean(baseOdds) && (!extraOdds || !sameJson(mergedOdds, extraOdds));
  const freshAt = extraOdds ? extra?.providerOddsUpdatedAt ?? now() : base?.providerOddsFreshAt ?? base?.providerOddsUpdatedAt ?? null;
  const heldSince = usedLastGood ? base?.providerOddsHeldSince ?? base?.providerOddsFreshAt ?? base?.providerOddsUpdatedAt ?? freshAt ?? now() : null;
  return { usedLastGood, freshAt, heldSince };
}
__name(continuityState, "continuityState");
function boardState(status, statusCode) {
  const s = `${status || ""} ${statusCode || ""}`.toLowerCase();
  if (/unknown/.test(s)) return "unknown";
  if (/finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s)) return "finished";
  if (/in_play|in play|live|half/.test(s) || /^\d+$/.test(String(statusCode || ""))) return "live";
  return "scheduled";
}
__name(boardState, "boardState");
function normalize(f) {
  const id = fixtureId(f), status = text(f?.status?.name ?? f?.status ?? null), statusReason = text(f?.status_reason ?? f?.status?.reason ?? null), statusCode = text(f?.status_code ?? f?.status?.code ?? f?.status?.short ?? null), minute = finite(f?.minute ?? f?.elapsed ?? f?.status?.minute ?? f?.status?.elapsed ?? statusCode), kickoff = kickoffUtc(f), odds = providerOddsRaw(f), oddsAt = odds ? now() : null;
  return { fixtureId: id, league: league(f), home: team(f, "home"), away: team(f, "away"), kickoffUtc: kickoff, kickoffAt: kickoff && Number.isFinite(Date.parse(kickoff)) ? Date.parse(kickoff) : finite(f?.kickoff_ts ?? f?.start_time) ? finite(f?.kickoff_ts ?? f?.start_time) * 1e3 : null, status, statusReason, statusCode, boardState: boardState(status, statusCode), minute, goals: score(f?.goals ?? f?.score), corners: score(f?.corners), cards: cards(f?.cards), statistics: statistics(f?.statistics ?? f?.stats ?? null), events: Array.isArray(f?.events) ? f.events : null, providerOdds: odds, providerOddsUpdatedAt: oddsAt, providerOddsFreshAt: oddsAt, providerOddsHeld: false, providerOddsHeldSince: null };
}
__name(normalize, "normalize");
function extract(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}
__name(extract, "extract");
function pageInfo(payload) {
  const p = payload?.pagination ?? payload?.meta?.pagination ?? payload?.meta ?? {};
  const raw = p?.has_more ?? p?.hasMore ?? payload?.has_more ?? payload?.hasMore ?? false;
  return { hasMore: raw === true || raw === 1 || raw === "1" || raw === "true" };
}
__name(pageInfo, "pageInfo");
async function fetchJson(url, key) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ac.signal, headers: { accept: "application/json", authorization: `Bearer ${key}` } });
    const raw = await r.text();
    let j = null;
    try {
      j = JSON.parse(raw);
    } catch {
    }
    if (!r.ok) {
      const e = new Error(`provider:HTTP_${r.status}`);
      e.status = r.status;
      e.retryAfter = finite(r.headers.get("retry-after"));
      throw e;
    }
    if (!j || typeof j !== "object") throw new Error("provider:INVALID_JSON");
    return j;
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("provider:TIMEOUT");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchJson, "fetchJson");
async function fetchPages(env, query, perPage, maxPages, startPage = 1) {
  if (!env.FIVEDOLLAR_API_KEY) throw new Error("provider:FIVEDOLLAR_API_KEY_MISSING");
  const rows = [];
  let page = startPage, hasMore = false;
  do {
    const join = query ? `&${query}` : "";
    const j = await fetchJson(`${API_BASE}/fixtures?per_page=${perPage}&page=${page}${join}`, env.FIVEDOLLAR_API_KEY);
    rows.push(...extract(j));
    hasMore = pageInfo(j).hasMore;
    page += 1;
  } while (hasMore && page < startPage + maxPages);
  return { rows, requests: page - startPage, guardHit: hasMore && page >= startPage + maxPages, nextPage: hasMore ? page : 1 };
}
__name(fetchPages, "fetchPages");
function bangkokWindow(ms = now()) {
  const shift = 7 * 36e5, d = new Date(ms + shift);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - shift;
  return { startMs: start, endMs: start + 864e5, start: Math.floor(start / 1e3), end: Math.floor((start + 864e5) / 1e3) };
}
__name(bangkokWindow, "bangkokWindow");
async function fetchLive(env) {
  const include = "odds,events,stats";
  const live = await fetchPages(env, `status=live&include=${include}`, LIVE_PAGE_SIZE, LIVE_MAX_PAGES);
  return { live, include };
}
__name(fetchLive, "fetchLive");
async function fetchTodayAndLive(env, startPage = 1) {
  const w = bangkokWindow(), include = "odds,events,stats";
  const today = await fetchPages(env, `start_time=${w.start}&end_time=${w.end}&status=all&include=${include}`, TODAY_PAGE_SIZE, TODAY_MAX_PAGES, startPage);
  const live = await fetchPages(env, `status=live&include=${include}`, LIVE_PAGE_SIZE, LIVE_MAX_PAGES);
  const requests = today.requests + live.requests;
  if (requests > MAX_PROVIDER_REQUESTS_PER_TODAY_REFRESH) throw new Error(`provider:REQUEST_BUDGET_${requests}`);
  return { today, live, window: w, include, requestBudget: MAX_PROVIDER_REQUESTS_PER_TODAY_REFRESH };
}
__name(fetchTodayAndLive, "fetchTodayAndLive");
function merge(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  const providerOdds = mergeProviderOdds(base.providerOdds, extra.providerOdds);
  const continuity = continuityState(base, extra, providerOdds);
  return { ...base, ...extra, league: { ...base.league || {}, ...extra.league || {} }, home: { ...base.home || {}, ...extra.home || {} }, away: { ...base.away || {}, ...extra.away || {} }, kickoffUtc: extra.kickoffUtc ?? base.kickoffUtc, kickoffAt: extra.kickoffAt ?? base.kickoffAt, goals: extra.goals ?? base.goals, corners: extra.corners ?? base.corners, cards: extra.cards ?? base.cards, statistics: extra.statistics ?? base.statistics, events: extra.events ?? base.events, providerOdds, providerOddsUpdatedAt: continuity.freshAt ?? base.providerOddsUpdatedAt ?? null, providerOddsFreshAt: continuity.freshAt, providerOddsHeld: continuity.usedLastGood, providerOddsHeldSince: continuity.heldSince };
}
__name(merge, "merge");
function chunks(rows) {
  const out = [];
  let cur = [];
  for (const row of rows) {
    const next = [...cur, row];
    if (cur.length && encoder.encode(JSON.stringify(next)).byteLength > CHUNK_BYTES) {
      out.push(cur);
      cur = [row];
    } else cur = next;
  }
  if (cur.length || !out.length) out.push(cur);
  return out;
}
__name(chunks, "chunks");
function presetSeconds(value, fallback = DEFAULT_LIVE_REFRESH_SECONDS) {
  const n = Math.round(Number(value));
  return PRESET_SECONDS.has(n) ? n : fallback;
}
__name(presetSeconds, "presetSeconds");
function autoMinutes(value, fallback = 0) {
  const n = Math.round(Number(value));
  return AUTO_RETURN_MINUTES.has(n) ? n : fallback;
}
__name(autoMinutes, "autoMinutes");
function reqPerMinute(seconds) {
  return Math.round(60 / Math.max(1, Number(seconds) || 1) * 10) / 10;
}
__name(reqPerMinute, "reqPerMinute");
var FiveUsdHub = class {
  static {
    __name(this, "FiveUsdHub");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.refreshPromise = null;
  }
  async meta() {
    return await this.ctx.storage.get("meta") || null;
  }
  async state() {
    return await this.ctx.storage.get("state") || { lastAttemptAt: null, lastSuccessAt: null, lastError: null, lastRateLimitAt: null, retryAfterSec: null };
  }
  async readRows(meta) {
    if (!meta) return [];
    const out = [];
    for (let i = 0; i < Number(meta.chunkCount || 0); i++) {
      const raw = await this.ctx.storage.get(`snapshot:${meta.snapshotId}:${i}`);
      if (!raw) continue;
      try {
        const rows = JSON.parse(raw);
        if (Array.isArray(rows)) out.push(...rows);
      } catch {
      }
    }
    return out;
  }
  async control() {
    const stored = await this.ctx.storage.get("bulkLiveControl") || {};
    let control = { liveRefreshSeconds: presetSeconds(stored.liveRefreshSeconds), autoReturnMinutes: autoMinutes(stored.autoReturnMinutes), autoReturnAt: finite(stored.autoReturnAt), returnRefreshSeconds: 120, updatedAt: finite(stored.updatedAt) };
    if (control.autoReturnAt !== null && now() >= control.autoReturnAt) {
      control = { liveRefreshSeconds: 120, autoReturnMinutes: 0, autoReturnAt: null, returnRefreshSeconds: 120, updatedAt: now() };
      await this.ctx.storage.put("bulkLiveControl", control);
    }
    return control;
  }
  async setControl(raw = {}) {
    const current = await this.control();
    const liveRefreshSeconds = presetSeconds(raw.liveRefreshSeconds, current.liveRefreshSeconds);
    const autoReturnMinutes = autoMinutes(raw.autoReturnMinutes, 0);
    const control = { liveRefreshSeconds, autoReturnMinutes, autoReturnAt: autoReturnMinutes > 0 && liveRefreshSeconds !== 120 ? now() + autoReturnMinutes * 6e4 : null, returnRefreshSeconds: 120, updatedAt: now() };
    await this.ctx.storage.put("bulkLiveControl", control);
    await this.scheduleNext(control, 750);
    return control;
  }
  async scheduleNext(control = null, delayMs = null) {
    const c = control || await this.control();
    const wait = Math.max(1500, Number(delayMs ?? c.liveRefreshSeconds * 1e3));
    const at = now() + wait;
    await this.ctx.storage.setAlarm(at);
    return at;
  }
  async writeSnapshot(rows, detail = {}) {
    const oldMeta = await this.meta(), dataChunks = chunks(rows), snapshotId = now().toString(36);
    for (let i = 0; i < dataChunks.length; i++) await this.ctx.storage.put(`snapshot:${snapshotId}:${i}`, JSON.stringify(dataChunks[i]));
    const counts = { scheduled: rows.filter((x) => x.boardState === "scheduled").length, live: rows.filter((x) => x.boardState === "live").length, finished: rows.filter((x) => x.boardState === "finished").length, unknown: rows.filter((x) => x.boardState === "unknown").length };
    const continuityHeldFixtures = rows.filter((x) => x.boardState === "live" && x.providerOddsHeld === true).length;
    const meta = { version: VERSION, fetchedAt: now(), snapshotId, chunkCount: dataChunks.length, fixtureCount: rows.length, counts, continuityEnabled: true, continuityHeldFixtures, providerRequestCount: Number(detail.providerRequestCount || 0), providerRequestBudget: MAX_PROVIDER_REQUESTS_PER_TODAY_REFRESH, todayRequests: Number(detail.todayRequests ?? oldMeta?.todayRequests ?? 0), liveRequests: Number(detail.liveRequests ?? 1), guardHit: detail.refreshKind === "LIVE" ? Boolean(oldMeta?.guardHit || detail.guardHit) : Boolean(detail.guardHit), todayPageCursor: Number(detail.todayPageCursor ?? oldMeta?.todayPageCursor ?? 1), include: detail.include || oldMeta?.include || "odds,events,stats", todayWindow: detail.todayWindow ?? oldMeta?.todayWindow ?? null, todayFetchedAt: detail.todayFetchedAt ?? oldMeta?.todayFetchedAt ?? null, liveFetchedAt: detail.liveFetchedAt ?? now(), refreshKind: detail.refreshKind || "LIVE" };
    await this.ctx.storage.put("meta", meta);
    if (oldMeta?.snapshotId && oldMeta.snapshotId !== snapshotId) {
      for (let i = 0; i < Number(oldMeta.chunkCount || 0); i++) await this.ctx.storage.delete(`snapshot:${oldMeta.snapshotId}:${i}`);
    }
    return meta;
  }
  async markSuccess(at, meta) {
    await this.ctx.storage.put("state", { lastAttemptAt: at, lastSuccessAt: meta.fetchedAt, lastError: null, lastRateLimitAt: null, retryAfterSec: null });
  }
  async markError(at, error) {
    const previous = await this.state(), status = Number(error?.status || 0), retryAfter = finite(error?.retryAfter);
    await this.ctx.storage.put("state", { ...previous, lastAttemptAt: at, lastError: String(error?.message || error), lastRateLimitAt: status === 429 ? at : previous.lastRateLimitAt, retryAfterSec: status === 429 ? retryAfter ?? 10 : previous.retryAfterSec });
  }
  async refreshToday() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const attempt = now(), oldMeta = await this.meta(), oldRows = await this.readRows(oldMeta);
      try {
        /* B46_FINAL_BULK_PAGES_20261017: rotate results pages, keep API count unchanged. */
        const todayWindow=bangkokWindow();
        const savedCursor=Number(oldMeta?.todayWindow?.start)===todayWindow.start?Number(oldMeta?.todayPageCursor):1;
        const nextStart=Number.isSafeInteger(savedCursor)&&savedCursor>=1&&savedCursor<=200?savedCursor:1;
        const p = await fetchTodayAndLive(this.env,nextStart), map = /* @__PURE__ */ new Map();
        for (const raw of p.today.rows) {
          const n = normalize(raw);
          if (n.fixtureId) map.set(n.fixtureId, n);
        }
        for (const old of oldRows) {
          if(!old?.fixtureId)continue;
          if(map.has(old.fixtureId)){map.set(old.fixtureId,merge(old,map.get(old.fixtureId)));continue;}
          const kickoffAt=Number(old.kickoffAt),t=now();
          if(old.boardState==="finished"&&Number.isFinite(kickoffAt)&&kickoffAt>=t-72*3600*1000&&kickoffAt<t+3600000)map.set(old.fixtureId,old);
        }
        for (const raw of p.live.rows) {
          const n = normalize(raw);
          if (n.fixtureId) map.set(n.fixtureId, merge(map.get(n.fixtureId), n));
        }
        const rows = [...map.values()].sort((a, b) => (a.kickoffAt ?? 0) - (b.kickoffAt ?? 0)), fetched = now(), meta = await this.writeSnapshot(rows, { providerRequestCount: p.today.requests + p.live.requests, todayRequests: p.today.requests, liveRequests: p.live.requests, guardHit: Boolean(p.today.guardHit || p.live.guardHit), todayPageCursor: p.today.nextPage, include: p.include, todayWindow: { start: p.window.start, end: p.window.end, timeZone: "Asia/Bangkok" }, todayFetchedAt: fetched, liveFetchedAt: fetched, refreshKind: "TODAY+LIVE" });
        await this.markSuccess(attempt, meta);
        await this.scheduleNext(await this.control());
        return meta;
      } catch (e) {
        await this.markError(attempt, e);
        if (oldMeta) return oldMeta;
        throw e;
      }
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
  async refreshLive(force = false) {
    const control = await this.control(), oldMeta = await this.meta();
    if (!force && oldMeta?.liveFetchedAt && now() - Number(oldMeta.liveFetchedAt) < control.liveRefreshSeconds * 1e3) return oldMeta;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const attempt = now(), oldRows = await this.readRows(oldMeta);
      try {
        const p = await fetchLive(this.env), map = /* @__PURE__ */ new Map(), oldById = new Map(oldRows.filter((x) => x?.fixtureId).map((x) => [x.fixtureId, x]));
        for (const old of oldRows) {
          if (old.boardState !== "live" && old.fixtureId) map.set(old.fixtureId, old);
        }
        for (const raw of p.live.rows) {
          const n = normalize(raw);
          if (n.fixtureId) map.set(n.fixtureId, merge(oldById.get(n.fixtureId), n));
        }
        const rows = [...map.values()].sort((a, b) => (a.kickoffAt ?? 0) - (b.kickoffAt ?? 0)), meta = await this.writeSnapshot(rows, { providerRequestCount: p.live.requests, liveRequests: p.live.requests, guardHit: p.live.guardHit, include: p.include, liveFetchedAt: now(), refreshKind: "LIVE" });
        await this.markSuccess(attempt, meta);
        return meta;
      } catch (e) {
        await this.markError(attempt, e);
        if (oldMeta) return oldMeta;
        throw e;
      }
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
  async refreshIfDue() {
    const control = await this.control(), m = await this.meta();
    if (!m) return this.refreshToday();
    if (!m.todayFetchedAt || now() - Number(m.todayFetchedAt) >= TODAY_REFRESH_MS) return this.refreshToday();
    if (!m.liveFetchedAt || now() - Number(m.liveFetchedAt) >= control.liveRefreshSeconds * 1e3) return this.refreshLive();
    return m;
  }
  async snapshot() {
    let m = await this.meta();
    try {
      m = await this.refreshIfDue();
    } catch {
    }
    m = await this.meta();
    const s = await this.state(), control = await this.control();
    if (!m) return { ok: false, version: VERSION, error: s.lastError || "NO_SNAPSHOT" };
    const rows = await this.readRows(m), ageMs = Math.max(0, now() - m.fetchedAt);
    return { ok: true, version: VERSION, provider: "5DollarFootballAPI", fetchedAt: m.fetchedAt, ageMs, stale: ageMs > STALE_MS, fixtureCount: rows.length, counts: m.counts, continuityEnabled: m.continuityEnabled === true, continuityHeldFixtures: Number(m.continuityHeldFixtures || 0), providerRequestCount: m.providerRequestCount, providerRequestBudget: m.providerRequestBudget, todayRequests: m.todayRequests, liveRequests: m.liveRequests, guardHit: m.guardHit, include: m.include, todayWindow: m.todayWindow, todayFetchedAt: m.todayFetchedAt, liveFetchedAt: m.liveFetchedAt, refreshKind: m.refreshKind, control, lastAttemptAt: s.lastAttemptAt, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError, lastRateLimitAt: s.lastRateLimitAt, retryAfterSec: s.retryAfterSec, fixtures: rows };
  }
  async health() {
    const m = await this.meta(), s = await this.state(), control = await this.control(), ageMs = m?.fetchedAt ? Math.max(0, now() - m.fetchedAt) : null, alarmAt = await this.ctx.storage.getAlarm();
    return { ok: Boolean(m), component: "5USD_HUB", version: VERSION, fixtureCount: m?.fixtureCount ?? 0, counts: m?.counts ?? { scheduled: 0, live: 0, finished: 0, unknown: 0 }, continuityEnabled: m?.continuityEnabled === true, continuityHeldFixtures: Number(m?.continuityHeldFixtures || 0), fetchedAt: m?.fetchedAt ?? null, ageMs, stale: ageMs === null || ageMs > STALE_MS, refreshMs: control.liveRefreshSeconds * 1e3, todayRefreshMs: TODAY_REFRESH_MS, providerRequestCount: m?.providerRequestCount ?? 0, providerRequestBudget: m?.providerRequestBudget ?? MAX_PROVIDER_REQUESTS_PER_TODAY_REFRESH, include: m?.include ?? "odds,events,stats", control, estimatedBulkRequestsPerMinute: reqPerMinute(control.liveRefreshSeconds), accountLimitPerMinute: ACCOUNT_LIMIT_PER_MINUTE, nextAlarmAt: alarmAt, lastError: s.lastError, lastRateLimitAt: s.lastRateLimitAt, retryAfterSec: s.retryAfterSec };
  }
  async settings() {
    const health = await this.health();
    return { ok: true, ...health, presets: [120, 60, 30, 15, 6, 3, 2], autoReturnOptions: [0, 30, 60, 120], notes: { bulk: "1 \u0E23\u0E2D\u0E1A = 1 request \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A live board \u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 500 \u0E04\u0E39\u0E48", today: "Today/Schedule \u0E41\u0E22\u0E01\u0E23\u0E2D\u0E1A 120 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35 \u0E44\u0E21\u0E48\u0E40\u0E23\u0E48\u0E07\u0E15\u0E32\u0E21 Bulk Live", continuity: "Last Known Good odds are preserved centrally for fixtures that remain live; null/empty/omitted markets cannot erase the previous good price.", limit: "Ultra 40 requests/min \u0E15\u0E48\u0E2D account" } };
  }
  async alarm() {
    const control = await this.control();
    try {
      await this.refreshLive(true);
    } catch {
    }
    const s = await this.state();
    const retry = s.lastError && s.retryAfterSec ? Math.max(control.liveRefreshSeconds, Number(s.retryAfterSec)) * 1e3 : null;
    await this.scheduleNext(await this.control(), retry);
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === "/_internal/today-refresh" && request.method === "POST") {
      try {
        const m = await this.refreshToday();
        await this.scheduleNext(await this.control());
        return new Response(JSON.stringify({ ok: true, meta: m, health: await this.health() }), { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 502, headers: { "content-type": "application/json" } });
      }
    }
    if (u.pathname === "/_internal/live-refresh" && request.method === "POST") {
      try {
        await this.refreshLive(true);
        return new Response(JSON.stringify(await this.health()), { headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 502, headers: { "content-type": "application/json" } });
      }
    }
    if (u.pathname === "/snapshot" && request.method === "GET") return new Response(JSON.stringify(await this.snapshot()), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/health" && request.method === "GET") return new Response(JSON.stringify(await this.health()), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/control" && request.method === "GET") return new Response(JSON.stringify(await this.settings()), { headers: { "content-type": "application/json" } });
    if (u.pathname === "/control" && request.method === "PUT") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "INVALID_CONTROL" }), { status: 400, headers: { "content-type": "application/json" } });
      const control = await this.setControl(body);
      return new Response(JSON.stringify({ ok: true, control, health: await this.health() }), { headers: { "content-type": "application/json" } });
    }
    return new Response("Not found", { status: 404 });
  }
};
function stub(env) {
  return env.HUB.get(env.HUB.idFromName("global"));
}
__name(stub, "stub");
function internalRequest(request, path) {
  const u = new URL(request.url);
  u.protocol = "https:";
  u.hostname = "hub.internal";
  u.pathname = path;
  return new Request(u, request);
}
__name(internalRequest, "internalRequest");
var index_v2_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json(request, null, 204);
    const u = new URL(request.url), s = stub(env);
    if (request.method === "GET" && u.pathname === "/snapshot") {
      const r = await s.fetch("https://hub.internal/snapshot");
      return json(request, await r.json(), r.status);
    }
    if (request.method === "GET" && (u.pathname === "/health" || u.pathname === "/status")) {
      const r = await s.fetch("https://hub.internal/health");
      return json(request, await r.json(), r.status);
    }
    if ((request.method === "GET" || request.method === "PUT") && u.pathname === "/control") {
      const r = await s.fetch(internalRequest(request, "/control"));
      return json(request, await r.json(), r.status);
    }
    return json(request, { ok: false, version: VERSION, error: "NOT_FOUND" }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stub(env).fetch("https://hub.internal/_internal/today-refresh", { method: "POST" }));
  }
};

// src/index-rich-odds.js
var API_BASE2 = "https://api.5dollarfootballapi.com/v1";
var ACCOUNT_LIMIT_PER_MINUTE2 = 40;
var RICH_CACHE_MS = 2e4;
var RICH_MAX_PROVIDER_CALLS_PER_MINUTE = 15;
var RESERVED_HEADROOM_PER_MINUTE = 8;
var TIMEOUT_MS2 = 15e3;
var now2 = /* @__PURE__ */ __name(() => Date.now(), "now");
var finite2 = /* @__PURE__ */ __name((v) => v === null || v === void 0 || v === "" || !Number.isFinite(Number(v)) ? null : Number(v), "finite");
function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra
    }
  });
}
__name(response, "response");
function safeFixtureId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,96}$/.test(id) ? id : null;
}
__name(safeFixtureId, "safeFixtureId");
async function hubHealth(env) {
  try {
    const stub2 = env.HUB.get(env.HUB.idFromName("global"));
    const r = await stub2.fetch("https://hub.internal/health");
    const j = await r.json();
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}
__name(hubHealth, "hubHealth");
async function providerJson(url, key) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS2);
  try {
    const r = await fetch(url, {
      cache: "no-store",
      signal: ac.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${key}`
      }
    });
    const text2 = await r.text();
    let payload = null;
    try {
      payload = JSON.parse(text2);
    } catch {
    }
    if (!r.ok) {
      const err = new Error(`provider:HTTP_${r.status}`);
      err.status = r.status;
      err.retryAfter = finite2(r.headers.get("retry-after"));
      err.payload = payload;
      throw err;
    }
    if (!payload || typeof payload !== "object") throw new Error("provider:INVALID_JSON");
    return {
      payload,
      rateLimitLimit: finite2(r.headers.get("x-ratelimit-limit")),
      rateLimitRemaining: finite2(r.headers.get("x-ratelimit-remaining")),
      rateLimitReset: finite2(r.headers.get("x-ratelimit-reset"))
    };
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("provider:TIMEOUT");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
__name(providerJson, "providerJson");
var RichOddsGate = class {
  static {
    __name(this, "RichOddsGate");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.inflight = /* @__PURE__ */ new Map();
  }
  async currentBudget() {
    const health = await hubHealth(this.env);
    const bulkRpm = Math.max(0, Number(health?.estimatedBulkRequestsPerMinute || 0));
    const available = Math.max(0, Math.floor(ACCOUNT_LIMIT_PER_MINUTE2 - bulkRpm - RESERVED_HEADROOM_PER_MINUTE));
    return {
      bulkRpm,
      richBudget: Math.min(RICH_MAX_PROVIDER_CALLS_PER_MINUTE, available),
      accountLimit: ACCOUNT_LIMIT_PER_MINUTE2,
      reservedHeadroom: RESERVED_HEADROOM_PER_MINUTE
    };
  }
  async callWindow() {
    const cutoff = now2() - 6e4;
    const stored = await this.ctx.storage.get("richProviderCalls");
    const calls = Array.isArray(stored) ? stored.filter((ts) => Number(ts) > cutoff) : [];
    return calls;
  }
  async recordCall(calls, at) {
    const next = [...calls, at].slice(-120);
    await this.ctx.storage.put("richProviderCalls", next);
  }
  async loadRich(id) {
    const at = now2();
    const cached = await this.ctx.storage.get(`rich:${id}`);
    if (cached?.fetchedAt && at - Number(cached.fetchedAt) < RICH_CACHE_MS && cached?.payload) {
      return {
        ok: true,
        fixtureId: id,
        cache: "HIT",
        fetchedAt: Number(cached.fetchedAt),
        ageMs: Math.max(0, at - Number(cached.fetchedAt)),
        provider: cached.payload,
        guard: cached.guard || null
      };
    }
    const blockedUntil = finite2(await this.ctx.storage.get("richBlockedUntil"));
    if (blockedUntil && at < blockedUntil) {
      const retry = Math.max(1, Math.ceil((blockedUntil - at) / 1e3));
      const err = new Error("RICH_ODDS_PROVIDER_BACKOFF");
      err.status = 429;
      err.retryAfter = retry;
      throw err;
    }
    const budget = await this.currentBudget();
    const calls = await this.callWindow();
    if (budget.richBudget <= 0 || calls.length >= budget.richBudget) {
      const oldest = calls[0] || at;
      const retry = Math.max(1, Math.ceil((6e4 - (at - oldest)) / 1e3));
      const err = new Error("RICH_ODDS_GUARD");
      err.status = 429;
      err.retryAfter = retry;
      err.guard = { ...budget, richCallsLast60s: calls.length };
      throw err;
    }
    if (!this.env.FIVEDOLLAR_API_KEY) {
      const err = new Error("FIVEDOLLAR_API_KEY_MISSING");
      err.status = 503;
      throw err;
    }
    await this.recordCall(calls, at);
    try {
      const result = await providerJson(`${API_BASE2}/fixtures/${encodeURIComponent(id)}/odds`, this.env.FIVEDOLLAR_API_KEY);
      const guard = {
        ...budget,
        richCallsLast60s: calls.length + 1,
        providerRemaining: result.rateLimitRemaining,
        providerLimit: result.rateLimitLimit,
        providerReset: result.rateLimitReset
      };
      const entry = { fetchedAt: now2(), payload: result.payload, guard };
      await this.ctx.storage.put(`rich:${id}`, entry);
      return {
        ok: true,
        fixtureId: id,
        cache: "MISS",
        fetchedAt: entry.fetchedAt,
        ageMs: 0,
        provider: result.payload,
        guard
      };
    } catch (err) {
      if (Number(err?.status) === 429) {
        const retry = Math.max(1, Number(err?.retryAfter || 5));
        await this.ctx.storage.put("richBlockedUntil", now2() + retry * 1e3);
      }
      throw err;
    }
  }
  async fetch(request) {
    if (request.method !== "GET") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    const url = new URL(request.url);
    const id = safeFixtureId(url.searchParams.get("fixture_id") || url.searchParams.get("fixtureId") || url.searchParams.get("id"));
    if (!id) return response({ ok: false, error: "INVALID_FIXTURE_ID" }, 400);
    if (this.inflight.has(id)) return this.inflight.get(id);
    const task = this.loadRich(id).then((body) => response(body, 200, { "x-nomad-rich-cache": body.cache })).catch((err) => {
      const status = Number(err?.status || 502);
      const retry = finite2(err?.retryAfter);
      return response({
        ok: false,
        fixtureId: id,
        error: String(err?.message || err),
        retryAfterSec: retry,
        guard: err?.guard || null
      }, status, retry ? { "retry-after": String(retry) } : {});
    }).finally(() => this.inflight.delete(id));
    this.inflight.set(id, task);
    return task;
  }
};
function richStub(env) {
  return env.RICH_GATE.get(env.RICH_GATE.idFromName("global"));
}
__name(richStub, "richStub");
var index_rich_odds_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/rich-odds") {
      const internal = new URL(request.url);
      internal.protocol = "https:";
      internal.hostname = "rich-odds.internal";
      internal.pathname = "/rich-odds";
      return richStub(env).fetch(new Request(internal, request));
    }
    return index_v2_default.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return index_v2_default.scheduled(event, env, ctx);
  }
};

// src/index-viewer-safe.js
var VERSION2 = "nomad343-5usd-hub-v6-viewer-cache-only";
var STALE_MS2 = 18e4;
var EMPTY_LIVE_HOLD_MS = 6e5;
var now3 = /* @__PURE__ */ __name(() => Date.now(), "now");
var FiveUsdHub2 = class extends FiveUsdHub {
  static {
    __name(this, "FiveUsdHub");
  }
  async writeSnapshot(rows, detail = {}) {
    const oldMeta = await this.meta();
    const incomingLive = Array.isArray(rows) ? rows.filter((row) => row?.boardState === "live").length : 0;
    if (detail?.refreshKind === "LIVE" && Number(oldMeta?.counts?.live || 0) > 0 && incomingLive === 0) {
      const key = "viewerSafeEmptyLiveSince";
      let since = Number(await this.ctx.storage.get(key) || 0);
      if (!since) {
        since = now3();
        await this.ctx.storage.put(key, since);
      }
      if (now3() - since < EMPTY_LIVE_HOLD_MS) return oldMeta;
      await this.ctx.storage.delete(key);
    } else {
      await this.ctx.storage.delete("viewerSafeEmptyLiveSince");
    }
    return super.writeSnapshot(rows, detail);
  }
  // Viewer reads are strictly cache-only. No refreshIfDue(), no provider request,
  // no per-viewer fan-out. Cron/alarm refreshes are the only producer path.
  async snapshot() {
    const m = await this.meta();
    const s = await this.state();
    const control = await this.control();
    if (!m) {
      return {
        ok: false,
        version: VERSION2,
        provider: "5DollarFootballAPI",
        cacheOnly: true,
        viewerRefreshEnabled: false,
        externalRequestsAdded: 0,
        error: s.lastError || "NO_SNAPSHOT",
        fixtures: []
      };
    }
    const rows = await this.readRows(m);
    const ageMs = Math.max(0, now3() - Number(m.fetchedAt || 0));
    return {
      ok: true,
      version: VERSION2,
      provider: "5DollarFootballAPI",
      cacheOnly: true,
      viewerRefreshEnabled: false,
      externalRequestsAdded: 0,
      fetchedAt: m.fetchedAt,
      ageMs,
      stale: ageMs > STALE_MS2,
      fixtureCount: rows.length,
      counts: m.counts,
      continuityEnabled: m.continuityEnabled === true,
      continuityHeldFixtures: Number(m.continuityHeldFixtures || 0),
      providerRequestCount: m.providerRequestCount,
      providerRequestBudget: m.providerRequestBudget,
      todayRequests: m.todayRequests,
      liveRequests: m.liveRequests,
      guardHit: m.guardHit,
      include: m.include,
      todayWindow: m.todayWindow,
      todayFetchedAt: m.todayFetchedAt,
      liveFetchedAt: m.liveFetchedAt,
      refreshKind: m.refreshKind,
      control,
      lastAttemptAt: s.lastAttemptAt,
      lastSuccessAt: s.lastSuccessAt,
      lastError: s.lastError,
      lastRateLimitAt: s.lastRateLimitAt,
      retryAfterSec: s.retryAfterSec,
      fixtures: rows
    };
  }
  async health() {
    const h = await super.health();
    return {
      ...h,
      version: VERSION2,
      cacheOnlyViewer: true,
      viewerRefreshEnabled: false,
      externalRequestsPerViewer: 0
    };
  }
};
function viewerBlockedResponse() {
  return new Response(JSON.stringify({
    ok: false,
    version: VERSION2,
    error: "VIEWER_RICH_ODDS_DISABLED_USE_BULK_SNAPSHOT",
    cacheOnly: true,
    externalRequestsAdded: 0
  }), {
    status: 410,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
__name(viewerBlockedResponse, "viewerBlockedResponse");
var index_viewer_safe_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/rich-odds") return viewerBlockedResponse();
    return index_rich_odds_default.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return index_rich_odds_default.scheduled(event, env, ctx);
  }
};
export {
  FiveUsdHub2 as FiveUsdHub,
  RichOddsGate,
  index_viewer_safe_default as default
};
//# sourceMappingURL=index-viewer-safe.js.map
