var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index-bulk.js
import { DurableObject } from "cloudflare:workers";

// src/market-core.js
var MARKET_RULES = Object.freeze({
  ft_1x2: { label: "1X2 \xB7 Full Time", group: "FULL TIME", provider: "1x2", aliases: ["1x2"], kind: "1X2", period: "FT", sideMode: true },
  ft_ah: { label: "Asian Handicap \xB7 Full Time", group: "FULL TIME", provider: "asian", aliases: ["asian_handicap", "asian"], kind: "AH", period: "FT", sideMode: true },
  ft_over: { label: "Goals OVER \xB7 Full Time", group: "FULL TIME", provider: "goalline", aliases: ["goal_line", "goalline"], kind: "OU", period: "FT", selection: "OVER", basis: "goals", gap: true },
  ft_under: { label: "Goals UNDER \xB7 Full Time", group: "FULL TIME", provider: "goalline", aliases: ["goal_line", "goalline"], kind: "OU", period: "FT", selection: "UNDER", basis: "goals" },
  ht_1x2: { label: "1X2 \xB7 1st Half", group: "FIRST HALF", provider: "1x2_half", aliases: ["1x2_half"], kind: "1X2", period: "HT", sideMode: true },
  ht_ah: { label: "Asian Handicap \xB7 1st Half", group: "FIRST HALF", provider: "asian_half", aliases: ["asian_handicap_half", "asian_half"], kind: "AH", period: "HT", sideMode: true },
  ht_over: { label: "Goals OVER \xB7 1st Half", group: "FIRST HALF", provider: "goalline_half", aliases: ["goal_line_half", "goalline_half"], kind: "OU", period: "HT", selection: "OVER", basis: "goals", gap: true },
  ht_under: { label: "Goals UNDER \xB7 1st Half", group: "FIRST HALF", provider: "goalline_half", aliases: ["goal_line_half", "goalline_half"], kind: "OU", period: "HT", selection: "UNDER", basis: "goals" },
  ft_corner_over: { label: "Corners OVER \xB7 Full Time", group: "CORNERS", provider: "corner", aliases: ["corner_line", "corner"], kind: "OU", period: "FT", selection: "OVER", basis: "corners", gap: true },
  ft_corner_under: { label: "Corners UNDER \xB7 Full Time", group: "CORNERS", provider: "corner", aliases: ["corner_line", "corner"], kind: "OU", period: "FT", selection: "UNDER", basis: "corners" },
  ht_corner_over: { label: "Corners OVER \xB7 1st Half", group: "CORNERS", provider: "corner_half", aliases: ["corner_line_half", "corner_half"], kind: "OU", period: "HT", selection: "OVER", basis: "corners", gap: true },
  ht_corner_under: { label: "Corners UNDER \xB7 1st Half", group: "CORNERS", provider: "corner_half", aliases: ["corner_line_half", "corner_half"], kind: "OU", period: "HT", selection: "UNDER", basis: "corners" },
  ft_corner_ah: { label: "Corner Asian Handicap", group: "CORNERS", provider: "corner_asian", aliases: ["corner_asian"], kind: "AH", period: "FT", sideMode: true, basis: "corners" },
  ft_cards_over: { label: "Cards OVER \xB7 Full Time", group: "CARDS & BTTS", provider: "cards", aliases: ["card_line", "cards"], kind: "OU", period: "FT", selection: "OVER", basis: "cards", gap: true },
  ft_cards_under: { label: "Cards UNDER \xB7 Full Time", group: "CARDS & BTTS", provider: "cards", aliases: ["card_line", "cards"], kind: "OU", period: "FT", selection: "UNDER", basis: "cards" },
  ft_cards_ah: { label: "Card Asian Handicap", group: "CARDS & BTTS", provider: "cards_asian", aliases: ["card_asian", "cards_asian"], kind: "AH", period: "FT", sideMode: true, basis: "cards" },
  ft_btts_yes: { label: "BTTS \xB7 YES", group: "CARDS & BTTS", provider: "btts", aliases: ["btts"], kind: "BTTS", period: "FT", selection: "YES" },
  ft_btts_no: { label: "BTTS \xB7 NO", group: "CARDS & BTTS", provider: "btts", aliases: ["btts"], kind: "BTTS", period: "FT", selection: "NO" }
});
var MARKET_KEYS = Object.freeze(Object.keys(MARKET_RULES));
var num = /* @__PURE__ */ __name((v) => v === null || v === void 0 || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v), "num");
var pair = /* @__PURE__ */ __name((v) => v && typeof v === "object" ? { home: num(v.home), away: num(v.away) } : { home: null, away: null }, "pair");
var halfPair = /* @__PURE__ */ __name((v) => v && typeof v === "object" ? { home: num(v.halfHome ?? v.half_home), away: num(v.halfAway ?? v.half_away) } : { home: null, away: null }, "halfPair");
var pairReady = /* @__PURE__ */ __name((p) => num(p?.home) !== null && num(p?.away) !== null, "pairReady");
function splitAsianLine(line) {
  const n = Number(line);
  if (!Number.isFinite(n)) return [];
  const q = Math.round(n * 4) / 4;
  if (Math.abs(n - q) > 1e-6) return [];
  if (Math.abs(q * 2 - Math.round(q * 2)) < 1e-8) return [q];
  return [Math.floor(q * 2) / 2, Math.ceil(q * 2) / 2];
}
__name(splitAsianLine, "splitAsianLine");
function combineAsianParts(parts) {
  if (!parts.length) return null;
  if (parts.every((x) => x === "WIN")) return "WIN";
  if (parts.every((x) => x === "LOSS")) return "LOSS";
  if (parts.every((x) => x === "PUSH")) return "PUSH";
  if (parts.includes("WIN") && parts.includes("PUSH") && !parts.includes("LOSS")) return "HALF_WIN";
  if (parts.includes("LOSS") && parts.includes("PUSH") && !parts.includes("WIN")) return "HALF_LOSS";
  return parts.includes("WIN") ? "HALF_WIN" : "HALF_LOSS";
}
__name(combineAsianParts, "combineAsianParts");
function settleOu(total, line, selection) {
  if (!Number.isFinite(Number(total)) || !Number.isFinite(Number(line))) return null;
  const t = Number(total), sel = String(selection || "").toUpperCase(), parts = splitAsianLine(line);
  if (!parts.length || !["OVER", "UNDER"].includes(sel)) return null;
  return combineAsianParts(parts.map((l) => {
    if (sel === "OVER") return t > l ? "WIN" : t < l ? "LOSS" : "PUSH";
    return t < l ? "WIN" : t > l ? "LOSS" : "PUSH";
  }));
}
__name(settleOu, "settleOu");
function settleAh(homeValue, awayValue, line, selection) {
  if (!Number.isFinite(Number(homeValue)) || !Number.isFinite(Number(awayValue)) || !Number.isFinite(Number(line))) return null;
  const sel = String(selection || "").toUpperCase(), parts = splitAsianLine(line);
  if (!parts.length || !["HOME", "AWAY"].includes(sel)) return null;
  const base = sel === "HOME" ? Number(homeValue) - Number(awayValue) : Number(awayValue) - Number(homeValue);
  return combineAsianParts(parts.map((l) => base + l > 0 ? "WIN" : base + l < 0 ? "LOSS" : "PUSH"));
}
__name(settleAh, "settleAh");
function settle1x2(homeValue, awayValue, selection) {
  const h = num(homeValue), a = num(awayValue), sel = String(selection || "").toUpperCase();
  if (h === null || a === null || !["HOME", "DRAW", "AWAY"].includes(sel)) return null;
  if (sel === "DRAW") return h === a ? "WIN" : "LOSS";
  if (sel === "HOME") return h > a ? "WIN" : "LOSS";
  return a > h ? "WIN" : "LOSS";
}
__name(settle1x2, "settle1x2");
function cardPointsSide(v) {
  if (!v || typeof v !== "object") return null;
  const yellow = num(v.yellow), red = num(v.red);
  if (yellow === null && red === null) return null;
  return (yellow ?? 0) + 2 * (red ?? 0);
}
__name(cardPointsSide, "cardPointsSide");
function cardPointsPair(cards) {
  return { home: cardPointsSide(cards?.home), away: cardPointsSide(cards?.away) };
}
__name(cardPointsPair, "cardPointsPair");
function periodPair(v, period, { entryFallback = false } = {}) {
  if (period !== "HT") return pair(v);
  const half = halfPair(v);
  if (pairReady(half)) return half;
  return entryFallback ? pair(v) : half;
}
__name(periodPair, "periodPair");
function basisPair(f, def, { entryFallback = false } = {}) {
  if (def.basis === "corners") return periodPair(f?.corners, def.period, { entryFallback });
  if (def.basis === "cards") return cardPointsPair(f?.cards);
  return periodPair(f?.goals, def.period, { entryFallback });
}
__name(basisPair, "basisPair");
function subtractPair(finalPair, entryPair) {
  const fh = num(finalPair?.home), fa = num(finalPair?.away), eh = num(entryPair?.home), ea = num(entryPair?.away);
  if ([fh, fa, eh, ea].some((v) => v === null)) return { home: null, away: null };
  const home = fh - eh, away = fa - ea;
  if (home < 0 || away < 0) return { home: null, away: null };
  return { home, away };
}
__name(subtractPair, "subtractPair");
function settleMarketSignal(signal, fixture) {
  const def = MARKET_RULES[signal?.market];
  if (!def || !fixture) return null;
  if (def.kind === "1X2") {
    const p = basisPair(fixture, { basis: "goals", period: def.period });
    return settle1x2(p.home, p.away, signal.selection);
  }
  if (def.kind === "AH") {
    let p = basisPair(fixture, def);
    if ((def.basis || "goals") === "goals") {
      const entryFixture = { goals: signal?.entryScore ?? signal?.scoreAt ?? null };
      const entry = basisPair(entryFixture, { basis: "goals", period: def.period }, { entryFallback: true });
      p = subtractPair(p, entry);
    }
    return settleAh(p.home, p.away, signal.line, signal.selection);
  }
  if (def.kind === "OU") {
    const p = basisPair(fixture, def);
    if (!pairReady(p)) return null;
    return settleOu(Number(p.home) + Number(p.away), signal.line, signal.selection);
  }
  if (def.kind === "BTTS") {
    const p = pair(fixture?.goals), h = num(p.home), a = num(p.away), sel = String(signal.selection || "").toUpperCase();
    if (h === null || a === null || !["YES", "NO"].includes(sel)) return null;
    const yes = h > 0 && a > 0;
    return sel === "YES" ? yes ? "WIN" : "LOSS" : yes ? "LOSS" : "WIN";
  }
  return null;
}
__name(settleMarketSignal, "settleMarketSignal");
function lineGap(line, currentTotal) {
  const l = Number(line), t = Number(currentTotal);
  if (!Number.isFinite(l) || !Number.isFinite(t)) return null;
  return Math.round((l - t) * 100) / 100;
}
__name(lineGap, "lineGap");
function gapPass(line, currentTotal, maxGap) {
  const gap = lineGap(line, currentTotal), cap = Number(maxGap);
  if (gap === null || !Number.isFinite(cap)) return false;
  if (cap >= 999) return gap >= 0;
  return gap >= 0 && gap <= cap + 1e-9;
}
__name(gapPass, "gapPass");

// src/index-bulk.js
var VERSION = "nomad343-engine-v4-bulk-only";
var REVISION = "343-bulk-snapshot-only-20260915";
var MIN_SCAN_GAP_MS = 6e4;
var HISTORY_MS = 180 * 6e4;
var MAX_HISTORY_ROWS = 180;
var MAX_SIGNALS = 1600;
var SETTLEMENT_REVISION = "bet365-rules-v2";
var num2 = /* @__PURE__ */ __name((v) => v === null || v === void 0 || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v), "num");
var clone = /* @__PURE__ */ __name((v) => v === void 0 ? null : JSON.parse(JSON.stringify(v)), "clone");
var now = /* @__PURE__ */ __name(() => Date.now(), "now");
var pair2 = /* @__PURE__ */ __name((v) => v && typeof v === "object" ? { home: num2(v.home), away: num2(v.away) } : { home: null, away: null }, "pair");
var COMMON_HIGH = { shotOnTarget: 1, shotOff: 1, corner: 1, attackPct: 55, dangerousAttackPct: 55, possessionPct: 50, evidenceRequired: 3, oddsMin: 1.5, oddsMax: 9, minuteFrom: 55, minuteTo: 88, rollingWindowMinutes: 10 };
var COMMON_LOW = { shotOnTarget: 1, shotOff: 1, corner: 1, attackPct: 45, dangerousAttackPct: 45, possessionPct: 50, evidenceRequired: 3, oddsMin: 1.5, oddsMax: 9, minuteFrom: 55, minuteTo: 88, rollingWindowMinutes: 10 };
var HALF_HIGH = { ...COMMON_HIGH, minuteFrom: 20, minuteTo: 45 };
var HALF_LOW = { ...COMMON_LOW, minuteFrom: 20, minuteTo: 45 };
var DEFAULTS = {
  ft_1x2: { ...COMMON_HIGH, sideMode: "BOTH", scoreTrailingMax: 1 },
  ft_ah: { ...COMMON_HIGH, sideMode: "BOTH", lineMin: -10, lineMax: 10 },
  ft_over: { ...COMMON_HIGH, lineMin: 0.5, lineGapMax: 0.5 },
  ft_under: { ...COMMON_LOW, lineMin: 0.5, lineMax: 20 },
  ht_1x2: { ...HALF_HIGH, sideMode: "BOTH", scoreTrailingMax: 1 },
  ht_ah: { ...HALF_HIGH, sideMode: "BOTH", lineMin: -10, lineMax: 10 },
  ht_over: { ...HALF_HIGH, lineMin: 0.5, lineGapMax: 0.5 },
  ht_under: { ...HALF_LOW, lineMin: 0.5, lineMax: 20 },
  ft_corner_over: { ...COMMON_HIGH, lineMin: 0.5, lineGapMax: 0.5 },
  ft_corner_under: { ...COMMON_LOW, lineMin: 0.5, lineMax: 30 },
  ht_corner_over: { ...HALF_HIGH, lineMin: 0.5, lineGapMax: 0.5 },
  ht_corner_under: { ...HALF_LOW, lineMin: 0.5, lineMax: 20 },
  ft_corner_ah: { ...COMMON_HIGH, sideMode: "BOTH", lineMin: -20, lineMax: 20 },
  ft_cards_over: { ...COMMON_HIGH, lineMin: 0.5, lineGapMax: 0.5 },
  ft_cards_under: { ...COMMON_LOW, lineMin: 0.5, lineMax: 30 },
  ft_cards_ah: { ...COMMON_HIGH, sideMode: "BOTH", lineMin: -20, lineMax: 20 },
  ft_btts_yes: { ...COMMON_HIGH },
  ft_btts_no: { ...COMMON_LOW }
};
var DEFAULT_RUN = Object.fromEntries(MARKET_KEYS.map((k) => [k, false]));
function migrateLegacySettings(raw = {}) {
  const out = { ...raw };
  if (raw.oneXtwo && !out.ft_1x2) out.ft_1x2 = { ...raw.oneXtwo };
  if (raw.ah && !out.ft_ah) out.ft_ah = { ...raw.ah };
  if (raw.over && !out.ft_over) out.ft_over = { ...raw.over, lineGapMax: num2(raw.over.lineGapMax) ?? 0.5 };
  if (raw.under && !out.ft_under) out.ft_under = { ...raw.under };
  return out;
}
__name(migrateLegacySettings, "migrateLegacySettings");
function migrateLegacyRun(raw = {}) {
  const out = { ...raw };
  if (Object.prototype.hasOwnProperty.call(raw, "oneXtwo") && !Object.prototype.hasOwnProperty.call(out, "ft_1x2")) out.ft_1x2 = Boolean(raw.oneXtwo);
  if (Object.prototype.hasOwnProperty.call(raw, "ah") && !Object.prototype.hasOwnProperty.call(out, "ft_ah")) out.ft_ah = Boolean(raw.ah);
  if (Object.prototype.hasOwnProperty.call(raw, "over") && !Object.prototype.hasOwnProperty.call(out, "ft_over")) out.ft_over = Boolean(raw.over);
  if (Object.prototype.hasOwnProperty.call(raw, "under") && !Object.prototype.hasOwnProperty.call(out, "ft_under")) out.ft_under = Boolean(raw.under);
  return out;
}
__name(migrateLegacyRun, "migrateLegacyRun");
function sanitizeSettings(raw = {}) {
  const src = migrateLegacySettings(raw), out = {};
  for (const key of MARKET_KEYS) {
    const base = DEFAULTS[key] || COMMON_HIGH, c = { ...base, ...src[key] || {} };
    if ("lineGapMax" in c && ![0.5, 1, 1.5, 2, 2.5, 999].includes(Number(c.lineGapMax))) c.lineGapMax = base.lineGapMax ?? 0.5;
    c.evidenceRequired = Math.max(1, Math.min(6, Math.round(num2(c.evidenceRequired) ?? base.evidenceRequired ?? 3)));
    c.minuteFrom = Math.max(0, Math.min(120, Math.round(num2(c.minuteFrom) ?? base.minuteFrom ?? 0)));
    c.minuteTo = Math.max(c.minuteFrom, Math.min(120, Math.round(num2(c.minuteTo) ?? base.minuteTo ?? 120)));
    c.rollingWindowMinutes = Math.max(2, Math.min(30, Math.round(num2(c.rollingWindowMinutes) ?? 10)));
    c.oddsMin = Math.max(1.01, num2(c.oddsMin) ?? 1.5);
    c.oddsMax = Math.max(c.oddsMin, num2(c.oddsMax) ?? 9);
    if ("sideMode" in base) {
      const m = String(c.sideMode || base.sideMode).toUpperCase();
      c.sideMode = ["HOME", "AWAY", "DRAW", "BOTH", "ALL"].includes(m) ? m : base.sideMode;
    }
    out[key] = c;
  }
  return out;
}
__name(sanitizeSettings, "sanitizeSettings");
function sanitizeRun(raw = {}) {
  const src = migrateLegacyRun(raw);
  return Object.fromEntries(MARKET_KEYS.map((k) => [k, Boolean(src[k] ?? DEFAULT_RUN[k])]));
}
__name(sanitizeRun, "sanitizeRun");
function fixtureStatus(f) {
  return String(f?.boardState ?? f?.status ?? f?.statusCode ?? "").toLowerCase();
}
__name(fixtureStatus, "fixtureStatus");
function isLive(f) {
  const s = fixtureStatus(f);
  return f?.boardState === "live" || /live|in_play|in play|playing|first|second|\b1h\b|\b2h\b|\bhalf\b/.test(s);
}
__name(isLive, "isLive");
function isFinished(f) {
  const s = fixtureStatus(f);
  return f?.boardState === "finished" || /finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s);
}
__name(isFinished, "isFinished");
function isHalfComplete(f) {
  if (isFinished(f)) return true;
  const raw = `${f?.status ?? ""} ${f?.statusCode ?? ""}`.toLowerCase(), minute = num2(f?.minute);
  return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw) || minute !== null && minute >= 46;
}
__name(isHalfComplete, "isHalfComplete");
function periodEligible(f, def, cfg) {
  const minute = num2(f?.minute);
  if (minute === null || minute < Number(cfg.minuteFrom) || minute > Number(cfg.minuteTo)) return false;
  if (def.period === "HT" && isHalfComplete(f)) return false;
  return true;
}
__name(periodEligible, "periodEligible");
function periodCompleteForSignal(s, f) {
  const def = MARKET_RULES[s?.market];
  if (!def) return false;
  return def.period === "HT" ? isHalfComplete(f) : isFinished(f);
}
__name(periodCompleteForSignal, "periodCompleteForSignal");
function cardPair(cards) {
  return cardPointsPair(cards);
}
__name(cardPair, "cardPair");
function totalPair(p) {
  const h = num2(p?.home), a = num2(p?.away);
  return h === null || a === null ? null : h + a;
}
__name(totalPair, "totalPair");
function currentBasisTotal(f, basis) {
  if (basis === "goals") return totalPair(pair2(f?.goals));
  if (basis === "corners") return totalPair(pair2(f?.corners));
  if (basis === "cards") return totalPair(cardPair(f?.cards));
  return null;
}
__name(currentBasisTotal, "currentBasisTotal");
function metricSnapshot(f, at) {
  return { at, minute: num2(f.minute), shotsOnTarget: pair2(f.statistics?.shotsOnTarget), shotsOffTarget: pair2(f.statistics?.shotsOffTarget), corners: pair2(f.corners), attacks: pair2(f.statistics?.attacks), dangerousAttacks: pair2(f.statistics?.dangerousAttacks), possession: pair2(f.statistics?.possession), goals: pair2(f.goals), cards: cardPair(f.cards) };
}
__name(metricSnapshot, "metricSnapshot");
function delta(a, b) {
  a = num2(a);
  b = num2(b);
  return a === null || b === null || a < b ? null : a - b;
}
__name(delta, "delta");
function deltaPair(cur, old) {
  return { home: delta(cur?.home, old?.home), away: delta(cur?.away, old?.away) };
}
__name(deltaPair, "deltaPair");
function sharePair(p) {
  const h = num2(p?.home), a = num2(p?.away);
  if (h === null || a === null || h + a <= 0) return { home: null, away: null };
  return { home: h / (h + a) * 100, away: a / (h + a) * 100 };
}
__name(sharePair, "sharePair");
function rolling(history, minutes) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const cur = history[history.length - 1], target = cur.at - Number(minutes || 10) * 6e4;
  let old = null;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].at <= target) {
      old = history[i];
      break;
    }
  }
  if (!old) return null;
  return { fromAt: old.at, toAt: cur.at, fromMinute: old.minute, toMinute: cur.minute, shotsOnTarget: deltaPair(cur.shotsOnTarget, old.shotsOnTarget), shotsOffTarget: deltaPair(cur.shotsOffTarget, old.shotsOffTarget), corners: deltaPair(cur.corners, old.corners), attacks: deltaPair(cur.attacks, old.attacks), dangerousAttacks: deltaPair(cur.dangerousAttacks, old.dangerousAttacks), possession: cur.possession };
}
__name(rolling, "rolling");
var PRESSURE_WEIGHTS = { attacks: 20, dangerousAttacks: 30, shotsOnTarget: 20, shotsOffTarget: 10, corners: 10, possession: 10 };
function pressurePoint(history, index, minutes = 10) {
  const cur = history[index];
  if (!cur) return null;
  const target = Number(cur.at || 0) - Number(minutes || 10) * 6e4;
  let old = null;
  for (let i = index - 1; i >= 0; i--) {
    if (Number(history[i]?.at || 0) <= target) {
      old = history[i];
      break;
    }
  }
  if (!old && index > 0) old = history[0];
  const parts = [];
  const add = /* @__PURE__ */ __name((key, p) => {
    const s = sharePair(p);
    if (s.home === null || s.away === null) return;
    parts.push({ weight: PRESSURE_WEIGHTS[key], home: s.home / 100, away: s.away / 100 });
  }, "add");
  if (old) {
    add("attacks", deltaPair(cur.attacks, old.attacks));
    add("dangerousAttacks", deltaPair(cur.dangerousAttacks, old.dangerousAttacks));
    add("shotsOnTarget", deltaPair(cur.shotsOnTarget, old.shotsOnTarget));
    add("shotsOffTarget", deltaPair(cur.shotsOffTarget, old.shotsOffTarget));
    add("corners", deltaPair(cur.corners, old.corners));
  }
  add("possession", cur.possession);
  const total = parts.reduce((s, x) => s + x.weight, 0);
  let home = 50;
  if (total) home = parts.reduce((s, x) => s + x.home * x.weight, 0) / total * 100;
  const away = 100 - home;
  return { at: num2(cur.at), minute: num2(cur.minute), home: Math.round(home * 10) / 10, away: Math.round(away * 10) / 10, windowMinutes: old ? Math.max(1, Math.round((Number(cur.at || 0) - Number(old.at || 0)) / 6e4)) : 0 };
}
__name(pressurePoint, "pressurePoint");
function pressureSeries(history, minutes = 10) {
  return (Array.isArray(history) ? history : []).map((_, i) => pressurePoint(history, i, minutes)).filter(Boolean);
}
__name(pressureSeries, "pressureSeries");
function sideValue(p, side) {
  return num2(side === "HOME" ? p?.home : p?.away);
}
__name(sideValue, "sideValue");
function evidenceSide(roll, cfg, side, low = false) {
  if (!roll) return { pass: false, count: 0, required: Number(cfg.evidenceRequired || 3), side, mode: low ? "LOW" : "HIGH", items: [], strength: 0, reason: "WARMING" };
  const values = [
    ["shotOnTarget", sideValue(roll.shotsOnTarget, side), num2(cfg.shotOnTarget)],
    ["shotOff", sideValue(roll.shotsOffTarget, side), num2(cfg.shotOff)],
    ["corner", sideValue(roll.corners, side), num2(cfg.corner)],
    ["attackPct", sideValue(sharePair(roll.attacks), side), num2(cfg.attackPct)],
    ["dangerousAttackPct", sideValue(sharePair(roll.dangerousAttacks), side), num2(cfg.dangerousAttackPct)],
    ["possessionPct", sideValue(roll.possession, side), num2(cfg.possessionPct)]
  ];
  const items = values.map(([key, value, threshold]) => ({ key, value, threshold, pass: value !== null && threshold !== null && (low ? value <= threshold : value >= threshold) }));
  const count = items.filter((x) => x.pass).length, required = Number(cfg.evidenceRequired || 3);
  return { pass: count >= required, count, required, side, mode: low ? "LOW" : "HIGH", items, strength: count * 100 + items.filter((x) => x.pass).reduce((s, x) => s + Math.abs((x.value - x.threshold) / Math.max(1, Math.abs(x.threshold))), 0) };
}
__name(evidenceSide, "evidenceSide");
function selectionsFor(key, cfg) {
  const def = MARKET_RULES[key];
  if (def.selection) return [def.selection];
  if (def.kind === "AH") {
    const m = String(cfg.sideMode || "BOTH").toUpperCase();
    return m === "HOME" ? ["HOME"] : m === "AWAY" ? ["AWAY"] : ["HOME", "AWAY"];
  }
  if (def.kind === "1X2") {
    const m = String(cfg.sideMode || "BOTH").toUpperCase();
    if (m === "HOME") return ["HOME"];
    if (m === "AWAY") return ["AWAY"];
    if (m === "DRAW") return ["DRAW"];
    if (m === "ALL") return ["HOME", "DRAW", "AWAY"];
    return ["HOME", "AWAY"];
  }
  return [];
}
__name(selectionsFor, "selectionsFor");
function evidenceForSelection(key, selection, roll, cfg) {
  const def = MARKET_RULES[key], sel = String(selection).toUpperCase();
  if (def.kind === "1X2" || def.kind === "AH") {
    if (sel === "DRAW") {
      const h2 = evidenceSide(roll, cfg, "HOME", false), a2 = evidenceSide(roll, cfg, "AWAY", false);
      return { pass: h2.pass && a2.pass, count: Math.min(h2.count, a2.count), required: h2.required, side: "BOTH", mode: "BALANCED_HIGH", items: [...h2.items, ...a2.items], strength: Math.min(h2.strength, a2.strength) };
    }
    return evidenceSide(roll, cfg, sel, false);
  }
  if (def.kind === "BTTS") {
    if (sel === "YES") {
      const h3 = evidenceSide(roll, cfg, "HOME", false), a3 = evidenceSide(roll, cfg, "AWAY", false);
      return { pass: h3.pass && a3.pass, count: Math.min(h3.count, a3.count), required: h3.required, side: "BOTH", mode: "BOTH_HIGH", items: [...h3.items, ...a3.items], strength: Math.min(h3.strength, a3.strength) };
    }
    const h2 = evidenceSide(roll, cfg, "HOME", true), a2 = evidenceSide(roll, cfg, "AWAY", true);
    return h2.strength >= a2.strength ? h2 : a2;
  }
  if (sel === "UNDER") {
    const h2 = evidenceSide(roll, cfg, "HOME", true), a2 = evidenceSide(roll, cfg, "AWAY", true);
    return h2.strength >= a2.strength ? h2 : a2;
  }
  const h = evidenceSide(roll, cfg, "HOME", false), a = evidenceSide(roll, cfg, "AWAY", false);
  return h.strength >= a.strength ? h : a;
}
__name(evidenceForSelection, "evidenceForSelection");
function scoreTrailingPass(f, selection, max) {
  if (!["HOME", "AWAY"].includes(selection)) return true;
  const h = num2(f.goals?.home), a = num2(f.goals?.away);
  if (h === null || a === null) return false;
  const def = selection === "HOME" ? a - h : h - a;
  return def <= Number(max ?? 99);
}
__name(scoreTrailingPass, "scoreTrailingPass");
function preCandidatesForRule(key, f, history, cfg) {
  const def = MARKET_RULES[key];
  if (!periodEligible(f, def, cfg)) return { state: "TIME", candidates: [] };
  const roll = rolling(history, cfg.rollingWindowMinutes);
  if (!roll) return { state: "WARMING", candidates: [] };
  const rows = [];
  for (const selection of selectionsFor(key, cfg)) {
    const ev = evidenceForSelection(key, selection, roll, cfg);
    if (!ev.pass) continue;
    if (def.kind === "1X2" && !scoreTrailingPass(f, selection, cfg.scoreTrailingMax)) continue;
    rows.push({ market: key, selection, evidence: ev, rolling: roll, strength: ev.strength });
  }
  return { state: rows.length ? "EVIDENCE_PASS" : "EVIDENCE", candidates: rows };
}
__name(preCandidatesForRule, "preCandidatesForRule");
function oddsRoot(payload) {
  const books = payload?.data?.bookmakers ?? payload?.bookmakers;
  if (Array.isArray(books)) {
    const b = books.find((x) => String(x?.slug ?? x?.bookmaker?.slug ?? x?.name ?? x?.bookmaker?.name ?? "").toLowerCase().replace(/[\s_-]/g, "").includes("bet365"));
    const root = b?.odds ?? b?.markets ?? b?.data?.odds ?? b?.data?.markets;
    if (root) return root;
  }
  if (payload?.bet365 && typeof payload.bet365 === "object") return payload.bet365.odds ?? payload.bet365.markets ?? payload.bet365;
  return payload?.data?.odds ?? payload?.odds ?? payload?.markets ?? payload?.data ?? null;
}
__name(oddsRoot, "oddsRoot");
function findMarket(root, def) {
  if (!root || typeof root !== "object") return null;
  for (const k of def.aliases || []) {
    if (root[k] !== void 0 && root[k] !== null) return root[k];
  }
  return null;
}
__name(findMarket, "findMarket");
function stageValue(market, stage) {
  if (!market || typeof market !== "object") return null;
  if (stage === "inplay") return market.inplay ?? market.in_play ?? market.live ?? market.current ?? null;
  return market[stage] ?? null;
}
__name(stageValue, "stageValue");
function stageSnapshot(root, def, stage) {
  const v = stageValue(findMarket(root, def), stage);
  return v && typeof v === "object" ? clone(v) : v ?? null;
}
__name(stageSnapshot, "stageSnapshot");
function priceFor(root, key, selection) {
  const def = MARKET_RULES[key], stage = stageValue(findMarket(root, def), "inplay");
  if (!stage || typeof stage !== "object") return null;
  const sel = String(selection).toUpperCase();
  if (def.kind === "1X2" || def.kind === "BTTS") {
    const odds2 = num2(stage[sel.toLowerCase()]);
    return odds2 === null ? null : { line: null, providerLine: null, odds: odds2 };
  }
  const providerLine = num2(stage.line ?? stage.hdp ?? stage.handicap ?? stage.total);
  if (providerLine === null) return null;
  if (def.kind === "AH") {
    const odds2 = num2(sel === "HOME" ? stage.home ?? stage.home_odds ?? stage.homeOdds : stage.away ?? stage.away_odds ?? stage.awayOdds);
    if (odds2 === null) return null;
    return { line: sel === "HOME" ? providerLine : -providerLine, providerLine, providerLineSide: "HOME", odds: odds2 };
  }
  const odds = num2(sel === "OVER" ? stage.over ?? stage.over_odds ?? stage.overOdds : stage.under ?? stage.under_odds ?? stage.underOdds);
  return odds === null ? null : { line: providerLine, providerLine, odds };
}
__name(priceFor, "priceFor");
function pricePass(key, cfg, price, f) {
  const def = MARKET_RULES[key];
  if (!price || price.odds < Number(cfg.oddsMin) || price.odds > Number(cfg.oddsMax)) return false;
  if (def.kind === "AH") {
    if (price.line === null) return false;
    if (num2(cfg.lineMin) !== null && price.line < Number(cfg.lineMin)) return false;
    if (num2(cfg.lineMax) !== null && price.line > Number(cfg.lineMax)) return false;
  }
  if (def.kind === "OU") {
    if (price.line === null) return false;
    if (num2(cfg.lineMin) !== null && price.line < Number(cfg.lineMin)) return false;
    if (def.selection === "UNDER" && num2(cfg.lineMax) !== null && price.line > Number(cfg.lineMax)) return false;
    if (def.gap) {
      const total = currentBasisTotal(f, def.basis);
      if (!gapPass(price.line, total, cfg.lineGapMax)) return false;
    }
  }
  return true;
}
__name(pricePass, "pricePass");
function pickBestPriced(candidates, root, f, settings) {
  const passed = [];
  for (const c of candidates) {
    const price = priceFor(root, c.market, c.selection), cfg = settings[c.market];
    if (!pricePass(c.market, cfg, price, f)) continue;
    passed.push({ ...c, price });
  }
  passed.sort((a, b) => b.strength - a.strength || a.price.odds - b.price.odds);
  return passed[0] || null;
}
__name(pickBestPriced, "pickBestPriced");
function storedFixture(s) {
  return { goals: s?.finalScore ?? null, corners: s?.finalCorners ?? null, cards: s?.finalCards ?? null };
}
__name(storedFixture, "storedFixture");
function reconcileSettled(s) {
  if (s?.status !== "SETTLED") return false;
  const result = settleMarketSignal(s, storedFixture(s));
  if (!result) return false;
  const changed = result !== s.result;
  if (changed) {
    s.previousResult = s.result;
    s.result = result;
    s.reconciledAt = now();
  }
  s.settlementRevision = SETTLEMENT_REVISION;
  return changed;
}
__name(reconcileSettled, "reconcileSettled");
function statsFrom(signals) {
  const rows = signals.filter((s) => s.status === "SETTLED");
  const count = /* @__PURE__ */ __name((r) => rows.filter((x) => x.result === r).length, "count");
  const win = count("WIN"), loss = count("LOSS"), push = count("PUSH"), halfWin = count("HALF_WIN"), halfLoss = count("HALF_LOSS"), denom = win + loss + halfWin + halfLoss;
  const byMarket = Object.fromEntries(MARKET_KEYS.map((k) => [k, rows.filter((x) => x.market === k).length]));
  const byProviderMarket = {};
  for (const s of rows) {
    const p = MARKET_RULES[s.market]?.provider || s.market;
    byProviderMarket[p] = (byProviderMarket[p] || 0) + 1;
  }
  return { total: rows.length, win, loss, push, halfWin, halfLoss, unresolved: signals.filter((s) => s.status === "UNRESOLVED").length, winRate: denom ? Math.round((win + 0.5 * halfWin) / denom * 1e3) / 10 : null, byMarket, byProviderMarket, rows: rows.slice().sort((a, b) => b.createdAt - a.createdAt) };
}
__name(statsFrom, "statsFrom");
var Nomad343Engine = class extends DurableObject {
  static {
    __name(this, "Nomad343Engine");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.scanPromise = null;
  }
  async readSettings() {
    return sanitizeSettings(await this.ctx.storage.get("settings") || {});
  }
  async readRun() {
    return sanitizeRun(await this.ctx.storage.get("runState") || {});
  }
  async scanIfDue() {
    const last = await this.ctx.storage.get("lastScan");
    if (last?.finishedAt && now() - last.finishedAt < MIN_SCAN_GAP_MS) return last;
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.scan().finally(() => {
      this.scanPromise = null;
    });
    return this.scanPromise;
  }
  async scan() {
    const startedAt = now();
    try {
      const hr = await this.env.HUB.fetch("https://hub.internal/snapshot"), hub = await hr.json();
      if (!hub?.ok) throw new Error(hub?.error || "HUB_NOT_READY");
      const settings = await this.readSettings(), run = await this.readRun(), oldHist = await this.ctx.storage.get("histories") || {}, signals = await this.ctx.storage.get("signals") || [];
      const histories = {}, board = [], seen = new Set(signals.filter((s) => s.status === "PENDING").map((s) => `${s.fixtureId}:${s.market}`)), at = Number(hub.fetchedAt || now());
      const fixtureMap = /* @__PURE__ */ new Map();
      for (const f of hub.fixtures || []) fixtureMap.set(String(f.fixtureId), f);
      for (const f of hub.fixtures || []) {
        const id = String(f.fixtureId), arr = Array.isArray(oldHist[id]) ? oldHist[id].slice() : [];
        if (isLive(f)) {
          const snap = metricSnapshot(f, at);
          if (arr.length && arr[arr.length - 1].at === at) arr[arr.length - 1] = snap;
          else arr.push(snap);
        }
        histories[id] = arr.filter((x) => at - x.at <= HISTORY_MS).slice(-MAX_HISTORY_ROWS);
      }
      for (const f of hub.fixtures || []) {
        const id = String(f.fixtureId), analysis = {}, root = oddsRoot(f.providerOdds);
        if (isLive(f)) {
          const marketCandidates = [];
          for (const key of MARKET_KEYS) {
            if (!run[key]) {
              analysis[key] = { state: "STOP" };
              continue;
            }
            if (seen.has(`${id}:${key}`)) {
              analysis[key] = { state: "LOCKED" };
              continue;
            }
            const pre = preCandidatesForRule(key, f, histories[id] || [], settings[key]);
            analysis[key] = { state: pre.state };
            if (pre.candidates.length) marketCandidates.push(...pre.candidates);
          }
          if (marketCandidates.length) {
            if (!root) {
              for (const c of marketCandidates) analysis[c.market] = { state: "NO_BULK_ODDS" };
            } else {
              const grouped = /* @__PURE__ */ new Map();
              for (const c of marketCandidates) {
                if (!grouped.has(c.market)) grouped.set(c.market, []);
                grouped.get(c.market).push(c);
              }
              for (const [key, cands] of grouped) {
                const best = pickBestPriced(cands, root, f, settings);
                if (!best) {
                  analysis[key] = { state: "NO_BULK_PRICE" };
                  continue;
                }
                const def = MARKET_RULES[key], price = best.price, historyPoint = { minute: num2(f.minute), odds: price.odds, line: price.line, providerLine: price.providerLine, bookmaker: "Bet365", observedAt: at };
                const sig = { id: `${id}-${key}-${now().toString(36)}`, fixtureId: id, league: clone(f.league), home: clone(f.home), away: clone(f.away), market: key, marketLabel: def.label, providerMarket: def.provider, period: def.period, selection: best.selection, line: price.line, selectionLine: price.line, providerLine: price.providerLine, providerLineSide: price.providerLineSide ?? null, odds: price.odds, bookmaker: "Bet365", priceStage: "inplay", priceSource: "bulk-snapshot", openingPrice: stageSnapshot(root, def, "opening"), closingPrice: stageSnapshot(root, def, "closing"), inplayPrice: stageSnapshot(root, def, "inplay"), createdAt: now(), entryMinute: num2(f.minute), minute: num2(f.minute), entryScore: clone(f.goals), scoreAt: clone(f.goals), entryCorners: clone(f.corners), entryCards: clone(f.cards), entryStats: clone(f.statistics), statisticsAtEntry: clone(f.statistics), eventHistory: Array.isArray(f.events) ? clone(f.events) : [], bookmakerHistory: [historyPoint], evidence: best.evidence, rolling: best.rolling, status: "PENDING", result: null, finalScore: null, finalCorners: null, finalCards: null, settlementBasis: def.basis || "goals", settlementRevision: SETTLEMENT_REVISION, lineGap: def.gap ? lineGap(price.line, currentBasisTotal(f, def.basis)) : null };
                signals.push(sig);
                seen.add(`${id}:${key}`);
                analysis[key] = { state: "PASS", selection: best.selection, line: price.line, providerLine: price.providerLine, odds: price.odds, evidence: best.evidence, priceSource: "BULK_SNAPSHOT" };
              }
            }
          }
        }
        board.push({ ...f, analysis, fullOdds: root ? clone(root) : null, fullOddsFetchedAt: root ? num2(f.providerOddsUpdatedAt) ?? at : null, fullOddsSource: root ? "BULK_SNAPSHOT" : null });
      }
      let reconciled = 0;
      for (const s of signals) {
        if (s.status === "SETTLED" && reconcileSettled(s)) reconciled++;
      }
      for (const s of signals) {
        if (s.status !== "PENDING") continue;
        const f = fixtureMap.get(String(s.fixtureId));
        if (!f || !periodCompleteForSignal(s, f)) continue;
        const result = settleMarketSignal(s, f);
        if (!result) {
          s.status = "UNRESOLVED";
          s.settlementError = "FINAL_DATA_UNAVAILABLE";
          s.settledAt = s.settledAt || now();
          s.settlementRevision = SETTLEMENT_REVISION;
          continue;
        }
        s.status = "SETTLED";
        s.result = result;
        s.finalScore = clone(f.goals);
        s.finalCorners = clone(f.corners);
        s.finalCards = clone(f.cards);
        s.settledAt = now();
        s.settlementError = null;
        s.settlementRevision = SETTLEMENT_REVISION;
      }
      const capped = signals.slice(-MAX_SIGNALS);
      await this.ctx.storage.put("histories", histories);
      await this.ctx.storage.put("signals", capped);
      await this.ctx.storage.put("board", { ok: true, version: VERSION, revision: REVISION, dataMode: "BULK_SNAPSHOT_ONLY", hubVersion: hub.version, hubFetchedAt: hub.fetchedAt, hubAgeMs: hub.ageMs, stale: hub.stale, counts: hub.counts, fixtures: board, runState: run, referee: { mode: "BULK_SNAPSHOT_ONLY", externalRequestsAdded: 0, requests: 0, queued: 0, errors: [] } });
      const meta = { ok: true, version: VERSION, revision: REVISION, dataMode: "BULK_SNAPSHOT_ONLY", startedAt, finishedAt: now(), fixtureCount: board.length, liveCount: board.filter(isLive).length, signalCount: capped.filter((s) => s.status === "PENDING").length, unresolvedCount: capped.filter((s) => s.status === "UNRESOLVED").length, reconciled, refereeRequests: 0, refereeQueued: 0, externalOddsRequests: 0, lastError: null };
      await this.ctx.storage.put("lastScan", meta);
      return meta;
    } catch (e) {
      const meta = { ok: false, version: VERSION, revision: REVISION, dataMode: "BULK_SNAPSHOT_ONLY", startedAt, finishedAt: now(), externalOddsRequests: 0, lastError: String(e?.message || e) };
      await this.ctx.storage.put("lastScan", meta);
      return meta;
    }
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (!["/settings", "/registry", "/fixture-odds"].includes(u.pathname)) await this.scanIfDue();
    if (u.pathname === "/fixture-odds" && request.method === "GET") {
      const fixtureId = String(u.searchParams.get("fixtureId") || "").trim();
      if (!fixtureId) return Response.json({ ok: false, error: "FIXTURE_ID_REQUIRED" }, { status: 400 });
      const board = await this.ctx.storage.get("board") || { fixtures: [] }, fixture = (board.fixtures || []).find((x) => String(x?.fixtureId ?? "") === fixtureId);
      if (!fixture) return Response.json({ ok: false, error: "FIXTURE_NOT_ON_BOARD" }, { status: 404 });
      const root = oddsRoot(fixture.providerOdds);
      if (!root) return Response.json({ ok: false, fixtureId, error: "ODDS_UNAVAILABLE_IN_BULK_SNAPSHOT", source: "BULK_SNAPSHOT", externalRequestsAdded: 0 }, { status: 404 });
      return Response.json({ ok: true, version: VERSION, revision: REVISION, fixtureId, fullOdds: root, fetchedAt: num2(fixture.providerOddsUpdatedAt) ?? board.hubFetchedAt ?? null, source: "BULK_SNAPSHOT", cached: true, stale: Boolean(board.stale), externalRequestsAdded: 0 }, { headers: { "cache-control": "no-store" } });
    }
    if (u.pathname === "/health") {
      const m = await this.ctx.storage.get("lastScan");
      return Response.json({ ok: Boolean(m?.ok), component: "NOMAD343_ENGINE", version: VERSION, revision: REVISION, dataMode: "BULK_SNAPSHOT_ONLY", externalOddsRequests: 0, ...m });
    }
    if (u.pathname === "/registry") return Response.json({ ok: true, version: VERSION, revision: REVISION, settlementRevision: SETTLEMENT_REVISION, markets: MARKET_RULES, marketKeys: MARKET_KEYS });
    if (u.pathname === "/settings" && request.method === "GET") return Response.json({ ok: true, version: VERSION, settings: await this.readSettings(), runState: await this.readRun(), markets: MARKET_RULES });
    if (u.pathname === "/settings" && request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      const settings = sanitizeSettings({ ...await this.readSettings(), ...body.settings || {} }), run = sanitizeRun({ ...await this.readRun(), ...body.runState || {} });
      await this.ctx.storage.put("settings", settings);
      await this.ctx.storage.put("runState", run);
      return Response.json({ ok: true, settings, runState: run, markets: MARKET_RULES });
    }
    if (u.pathname === "/scan" && request.method === "POST") return Response.json(await this.scan());
    if (u.pathname === "/board") return Response.json(await this.ctx.storage.get("board") || { ok: false, version: VERSION, error: "NO_BOARD" });
    if (u.pathname === "/signals") {
      const s = await this.ctx.storage.get("signals") || [];
      return Response.json({ ok: true, version: VERSION, signals: s.filter((x) => x.status === "PENDING").sort((a, b) => b.createdAt - a.createdAt), allCount: s.length });
    }
    if (u.pathname === "/statistics") {
      const s = await this.ctx.storage.get("signals") || [];
      return Response.json({ ok: true, version: VERSION, settlementRevision: SETTLEMENT_REVISION, markets: MARKET_RULES, ...statsFrom(s) });
    }
    if (u.pathname === "/history" && request.method === "GET") {
      const fixtureId = String(u.searchParams.get("fixtureId") || "").trim();
      if (!fixtureId) return Response.json({ ok: false, error: "FIXTURE_ID_REQUIRED" }, { status: 400 });
      const minutes = Math.max(2, Math.min(30, Math.round(num2(u.searchParams.get("window")) ?? 10))), histories = await this.ctx.storage.get("histories") || {}, rows = Array.isArray(histories[fixtureId]) ? histories[fixtureId] : [];
      return Response.json({ ok: true, version: "nomad343-flow-history-v1", fixtureId, retainedMinutes: 180, maxRows: MAX_HISTORY_ROWS, pressureWindowMinutes: minutes, weights: PRESSURE_WEIGHTS, firstAt: rows[0]?.at ?? null, lastAt: rows[rows.length - 1]?.at ?? null, rows, pressure: pressureSeries(rows, minutes) });
    }
    return new Response("Not found", { status: 404 });
  }
};
function stub(env) {
  return env.ENGINE.get(env.ENGINE.idFromName("global"));
}
__name(stub, "stub");
function cors(request, response) {
  const h = new Headers(response.headers);
  h.set("access-control-allow-origin", request.headers.get("origin") || "*");
  h.set("access-control-allow-methods", "GET,PUT,POST,OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  h.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers: h });
}
__name(cors, "cors");
var index_bulk_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
    const u = new URL(request.url), allowed = ["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds"];
    if (!allowed.includes(u.pathname)) return cors(request, new Response("Not found", { status: 404 }));
    return cors(request, await stub(env).fetch(new Request(`https://engine.internal${u.pathname}${u.search}`, request)));
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stub(env).fetch("https://engine.internal/scan", { method: "POST" }));
  }
};
export {
  Nomad343Engine,
  index_bulk_default as default
};
//# sourceMappingURL=index-bulk.js.map
