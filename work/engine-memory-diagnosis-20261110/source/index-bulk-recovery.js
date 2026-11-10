const B46_LEDGER_REPAIR_PLAN={"operationId":"B46_MOTAGUA_DUPLICATE_20261102_V1","mode":"apply","expiresAt":1793610673633,"canonicalId":"203745645-ft_ah-mvyiwh1q","canonicalCreatedAt":1793579460686,"duplicateId":"203745645-ft_ah-mvyiwfq7","duplicateCreatedAt":1793579458975,"settledAt":1793581798458,"observation":"{\"away\":{\"id\":\"4924\",\"name\":\"CD Marathon\"},\"bookmaker\":\"Pinnacle\",\"bookmakerHistory\":[{\"bookmaker\":\"Pinnacle\",\"bookmakerSlug\":\"pinnacle\",\"line\":0,\"minute\":55,\"observedAt\":1793579444481,\"odds\":1.88,\"providerLine\":0}],\"bookmakerSlug\":\"pinnacle\",\"closingPrice\":{\"away\":1.89,\"home\":1.85,\"line\":-0.25},\"entryCards\":{\"away\":{\"red\":0,\"yellow\":1},\"home\":{\"red\":0,\"yellow\":0}},\"entryCorners\":{\"away\":8,\"halfAway\":6,\"halfHome\":3,\"home\":4},\"entryMinute\":55,\"entryScore\":{\"away\":0,\"halfAway\":0,\"halfHome\":2,\"home\":2},\"entryStats\":{\"attacks\":{\"away\":76,\"home\":47},\"dangerousAttacks\":{\"away\":45,\"home\":27},\"half\":{\"attacks\":{\"away\":57,\"home\":40},\"dangerousAttacks\":{\"away\":33,\"home\":21},\"possession\":{\"away\":50,\"home\":50},\"shotsOffTarget\":{\"away\":6,\"home\":3},\"shotsOnTarget\":{\"away\":0,\"home\":3}},\"possession\":{\"away\":50,\"home\":50},\"shotsOffTarget\":{\"away\":8,\"home\":4},\"shotsOnTarget\":{\"away\":1,\"home\":4}},\"evidence\":{\"count\":4,\"items\":[{\"key\":\"shotOnTarget\",\"pass\":true,\"threshold\":1,\"value\":1},{\"key\":\"shotOff\",\"pass\":true,\"threshold\":2,\"value\":2},{\"key\":\"corner\",\"pass\":true,\"threshold\":1,\"value\":2},{\"key\":\"attackPct\",\"pass\":true,\"threshold\":60,\"value\":73.07692307692307},{\"key\":\"dangerousAttackPct\",\"pass\":false,\"threshold\":70,\"value\":66.66666666666666},{\"key\":\"possessionPct\",\"pass\":false,\"threshold\":55,\"value\":50}],\"mode\":\"HIGH\",\"pass\":true,\"required\":3,\"side\":\"AWAY\",\"strength\":401.21794871794873},\"fixtureId\":\"203745645\",\"home\":{\"id\":\"4922\",\"name\":\"Motagua\"},\"inplayPrice\":{\"away\":1.88,\"home\":1.85,\"line\":0},\"league\":{\"country\":null,\"id\":\"340\",\"name\":\"Honduras Liga Nacional\"},\"line\":0,\"lineGap\":null,\"market\":\"ft_ah\",\"marketLabel\":\"Asian Handicap · Full Time\",\"minute\":55,\"odds\":1.88,\"openingPrice\":{\"away\":1.97,\"home\":1.75,\"line\":-0.25},\"period\":\"FT\",\"priceReference\":\"BEST19_CONSENSUS_LINE\",\"priceSource\":\"BEST_OF_19_INPLAY\",\"priceStage\":\"inplay\",\"providerLine\":0,\"providerLineSide\":\"HOME\",\"providerMarket\":\"asian\",\"refereeBookCount\":19,\"refereeConsensusBooks\":8,\"refereeConsensusSlugs\":[\"bet365\",\"pinnacle\",\"vcbet\",\"1xbet\",\"easybets\",\"18bet\",\"12bet\",\"crown\"],\"refereeOfferCount\":8,\"referenceProviderLine\":0,\"rolling\":{\"attacks\":{\"away\":19,\"home\":7},\"corners\":{\"away\":2,\"home\":1},\"dangerousAttacks\":{\"away\":12,\"home\":6},\"fromAt\":1793578785029,\"fromMinute\":null,\"possession\":{\"away\":50,\"home\":50},\"shotsOffTarget\":{\"away\":2,\"home\":1},\"shotsOnTarget\":{\"away\":1,\"home\":1},\"toAt\":1793579444481,\"toMinute\":55},\"scoreAt\":{\"away\":0,\"halfAway\":0,\"halfHome\":2,\"home\":2},\"selection\":\"AWAY\",\"selectionLine\":0,\"settlementBasis\":\"goals\",\"statisticsAtEntry\":{\"attacks\":{\"away\":76,\"home\":47},\"dangerousAttacks\":{\"away\":45,\"home\":27},\"half\":{\"attacks\":{\"away\":57,\"home\":40},\"dangerousAttacks\":{\"away\":33,\"home\":21},\"possession\":{\"away\":50,\"home\":50},\"shotsOffTarget\":{\"away\":6,\"home\":3},\"shotsOnTarget\":{\"away\":0,\"home\":3}},\"possession\":{\"away\":50,\"home\":50},\"shotsOffTarget\":{\"away\":8,\"home\":4},\"shotsOnTarget\":{\"away\":1,\"home\":4}}}"};
const B46_LEDGER_IMMUTABLE=['fixtureId','league','home','away','market','marketLabel','providerMarket','period','selection','line','selectionLine','providerLine','providerLineSide','odds','bookmaker','bookmakerSlug','priceStage','priceSource','priceReference','referenceProviderLine','refereeBookCount','refereeOfferCount','refereeConsensusBooks','refereeConsensusSlugs','openingPrice','closingPrice','inplayPrice','entryMinute','minute','entryScore','scoreAt','entryCorners','entryCards','entryStats','statisticsAtEntry','bookmakerHistory','evidence','rolling','settlementBasis','lineGap'];
function b46LedgerCanonical(value){if(Array.isArray(value))return value.map(b46LedgerCanonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,b46LedgerCanonical(value[k])]));return value}
function b46LedgerString(value){return JSON.stringify(b46LedgerCanonical(value))}
function b46LedgerObservation(row){return b46LedgerString(Object.fromEntries(B46_LEDGER_IMMUTABLE.map(k=>[k,row?.[k]??null])))}
async function b46LedgerHash(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b46LedgerString(value)));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
function b46LedgerCheck(value,message){if(!value)throw new Error('B46_LEDGER_REPAIR_'+message)}

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index-bulk-recovery.js
import { DurableObject } from "cloudflare:workers";
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
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
var num = /* @__PURE__ */ __name222((v) => v === null || v === void 0 || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v), "num");
var pair = /* @__PURE__ */ __name222((v) => v && typeof v === "object" ? { home: num(v.home), away: num(v.away) } : { home: null, away: null }, "pair");
var halfPair = /* @__PURE__ */ __name222((v) => v && typeof v === "object" ? { home: num(v.halfHome ?? v.half_home), away: num(v.halfAway ?? v.half_away) } : { home: null, away: null }, "halfPair");
var pairReady = /* @__PURE__ */ __name222((p) => num(p?.home) !== null && num(p?.away) !== null, "pairReady");
function splitAsianLine(line) {
  const n = Number(line);
  if (!Number.isFinite(n)) return [];
  const q = Math.round(n * 4) / 4;
  if (Math.abs(n - q) > 1e-6) return [];
  if (Math.abs(q * 2 - Math.round(q * 2)) < 1e-8) return [q];
  return [Math.floor(q * 2) / 2, Math.ceil(q * 2) / 2];
}
__name(splitAsianLine, "splitAsianLine");
__name2(splitAsianLine, "splitAsianLine");
__name22(splitAsianLine, "splitAsianLine");
__name222(splitAsianLine, "splitAsianLine");
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
__name2(combineAsianParts, "combineAsianParts");
__name22(combineAsianParts, "combineAsianParts");
__name222(combineAsianParts, "combineAsianParts");
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
__name2(settleOu, "settleOu");
__name22(settleOu, "settleOu");
__name222(settleOu, "settleOu");
function settleAh(homeValue, awayValue, line, selection) {
  if (!Number.isFinite(Number(homeValue)) || !Number.isFinite(Number(awayValue)) || !Number.isFinite(Number(line))) return null;
  const sel = String(selection || "").toUpperCase(), parts = splitAsianLine(line);
  if (!parts.length || !["HOME", "AWAY"].includes(sel)) return null;
  const base = sel === "HOME" ? Number(homeValue) - Number(awayValue) : Number(awayValue) - Number(homeValue);
  return combineAsianParts(parts.map((l) => base + l > 0 ? "WIN" : base + l < 0 ? "LOSS" : "PUSH"));
}
__name(settleAh, "settleAh");
__name2(settleAh, "settleAh");
__name22(settleAh, "settleAh");
__name222(settleAh, "settleAh");
function settle1x2(homeValue, awayValue, selection) {
  const h = num(homeValue), a = num(awayValue), sel = String(selection || "").toUpperCase();
  if (h === null || a === null || !["HOME", "DRAW", "AWAY"].includes(sel)) return null;
  if (sel === "DRAW") return h === a ? "WIN" : "LOSS";
  if (sel === "HOME") return h > a ? "WIN" : "LOSS";
  return a > h ? "WIN" : "LOSS";
}
__name(settle1x2, "settle1x2");
__name2(settle1x2, "settle1x2");
__name22(settle1x2, "settle1x2");
__name222(settle1x2, "settle1x2");
function cardPointsSide(v) {
  if (!v || typeof v !== "object") return null;
  const yellow = num(v.yellow), red = num(v.red);
  if (yellow === null && red === null) return null;
  return (yellow ?? 0) + 2 * (red ?? 0);
}
__name(cardPointsSide, "cardPointsSide");
__name2(cardPointsSide, "cardPointsSide");
__name22(cardPointsSide, "cardPointsSide");
__name222(cardPointsSide, "cardPointsSide");
function cardPointsPair(cards) {
  return { home: cardPointsSide(cards?.home), away: cardPointsSide(cards?.away) };
}
__name(cardPointsPair, "cardPointsPair");
__name2(cardPointsPair, "cardPointsPair");
__name22(cardPointsPair, "cardPointsPair");
__name222(cardPointsPair, "cardPointsPair");
function periodPair(v, period, { entryFallback = false } = {}) {
  if (period !== "HT") return pair(v);
  const half = halfPair(v);
  if (pairReady(half)) return half;
  return entryFallback ? pair(v) : half;
}
__name(periodPair, "periodPair");
__name2(periodPair, "periodPair");
__name22(periodPair, "periodPair");
__name222(periodPair, "periodPair");
function basisPair(f, def, { entryFallback = false } = {}) {
  if (def.basis === "corners") return periodPair(f?.corners, def.period, { entryFallback });
  if (def.basis === "cards") return cardPointsPair(f?.cards);
  return periodPair(f?.goals, def.period, { entryFallback });
}
__name(basisPair, "basisPair");
__name2(basisPair, "basisPair");
__name22(basisPair, "basisPair");
__name222(basisPair, "basisPair");
function subtractPair(finalPair, entryPair) {
  const fh = num(finalPair?.home), fa = num(finalPair?.away), eh = num(entryPair?.home), ea = num(entryPair?.away);
  if ([fh, fa, eh, ea].some((v) => v === null)) return { home: null, away: null };
  const home = fh - eh, away = fa - ea;
  if (home < 0 || away < 0) return { home: null, away: null };
  return { home, away };
}
__name(subtractPair, "subtractPair");
__name2(subtractPair, "subtractPair");
__name22(subtractPair, "subtractPair");
__name222(subtractPair, "subtractPair");
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
__name2(settleMarketSignal, "settleMarketSignal");
__name22(settleMarketSignal, "settleMarketSignal");
__name222(settleMarketSignal, "settleMarketSignal");
function lineGap(line, currentTotal) {
  const l = Number(line), t = Number(currentTotal);
  if (!Number.isFinite(l) || !Number.isFinite(t)) return null;
  return Math.round((l - t) * 100) / 100;
}
__name(lineGap, "lineGap");
__name2(lineGap, "lineGap");
__name22(lineGap, "lineGap");
__name222(lineGap, "lineGap");
function gapPass(line, currentTotal, maxGap) {
  const gap = lineGap(line, currentTotal), cap = Number(maxGap);
  if (gap === null || !Number.isFinite(cap)) return false;
  if (cap >= 999) return gap >= 0;
  return gap >= 0 && gap <= cap + 1e-9;
}
__name(gapPass, "gapPass");
__name2(gapPass, "gapPass");
__name22(gapPass, "gapPass");
__name222(gapPass, "gapPass");
var VERSION = "nomad343-engine-v5-best19-referee";
var REVISION = "343-best19-referee-20260918";
var MIN_SCAN_GAP_MS = 6e4;
var HISTORY_MS = 180 * 6e4;
var MAX_HISTORY_ROWS = 180;
var MAX_SIGNALS = 1600;
var SETTLEMENT_REVISION = "bet365-rules-v2";
var num2 = /* @__PURE__ */ __name222((v) => v === null || v === void 0 || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v), "num");
var clone = /* @__PURE__ */ __name222((v) => v === void 0 ? null : JSON.parse(JSON.stringify(v)), "clone");
var now = /* @__PURE__ */ __name222(() => Date.now(), "now");
var pair2 = /* @__PURE__ */ __name222((v) => v && typeof v === "object" ? { home: num2(v.home), away: num2(v.away) } : { home: null, away: null }, "pair");
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
__name2(migrateLegacySettings, "migrateLegacySettings");
__name22(migrateLegacySettings, "migrateLegacySettings");
__name222(migrateLegacySettings, "migrateLegacySettings");
function migrateLegacyRun(raw = {}) {
  const out = { ...raw };
  if (Object.prototype.hasOwnProperty.call(raw, "oneXtwo") && !Object.prototype.hasOwnProperty.call(out, "ft_1x2")) out.ft_1x2 = Boolean(raw.oneXtwo);
  if (Object.prototype.hasOwnProperty.call(raw, "ah") && !Object.prototype.hasOwnProperty.call(out, "ft_ah")) out.ft_ah = Boolean(raw.ah);
  if (Object.prototype.hasOwnProperty.call(raw, "over") && !Object.prototype.hasOwnProperty.call(out, "ft_over")) out.ft_over = Boolean(raw.over);
  if (Object.prototype.hasOwnProperty.call(raw, "under") && !Object.prototype.hasOwnProperty.call(out, "ft_under")) out.ft_under = Boolean(raw.under);
  return out;
}
__name(migrateLegacyRun, "migrateLegacyRun");
__name2(migrateLegacyRun, "migrateLegacyRun");
__name22(migrateLegacyRun, "migrateLegacyRun");
__name222(migrateLegacyRun, "migrateLegacyRun");
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
__name2(sanitizeSettings, "sanitizeSettings");
__name22(sanitizeSettings, "sanitizeSettings");
__name222(sanitizeSettings, "sanitizeSettings");
function sanitizeRun(raw = {}) {
  const src = migrateLegacyRun(raw);
  return Object.fromEntries(MARKET_KEYS.map((k) => [k, Boolean(src[k] ?? DEFAULT_RUN[k])]));
}
__name(sanitizeRun, "sanitizeRun");
__name2(sanitizeRun, "sanitizeRun");
__name22(sanitizeRun, "sanitizeRun");
__name222(sanitizeRun, "sanitizeRun");
function fixtureStatus(f) {
  return String(f?.boardState ?? f?.status ?? f?.statusCode ?? "").toLowerCase();
}
__name(fixtureStatus, "fixtureStatus");
__name2(fixtureStatus, "fixtureStatus");
__name22(fixtureStatus, "fixtureStatus");
__name222(fixtureStatus, "fixtureStatus");
function isLive(f) {
  const s = fixtureStatus(f);
  return f?.boardState === "live" || /live|in_play|in play|playing|first|second|\b1h\b|\b2h\b|\bhalf\b/.test(s);
}
__name(isLive, "isLive");
__name2(isLive, "isLive");
__name22(isLive, "isLive");
__name222(isLive, "isLive");
function isFinished(f) {
  const s = fixtureStatus(f);
  return f?.boardState === "finished" || /finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s);
}
__name(isFinished, "isFinished");
__name2(isFinished, "isFinished");
__name22(isFinished, "isFinished");
__name222(isFinished, "isFinished");
function isHalfComplete(f) {
  if (isFinished(f)) return true;
  const raw = `${f?.status ?? ""} ${f?.statusCode ?? ""}`.toLowerCase(), minute = num2(f?.minute);
  return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw) || minute !== null && minute >= 46;
}
__name(isHalfComplete, "isHalfComplete");
__name2(isHalfComplete, "isHalfComplete");
__name22(isHalfComplete, "isHalfComplete");
__name222(isHalfComplete, "isHalfComplete");
function periodEligible(f, def, cfg) {
  const minute = num2(f?.minute);
  if (minute === null || minute < Number(cfg.minuteFrom) || minute > Number(cfg.minuteTo)) return false;
  if (def.period === "HT" && isHalfComplete(f)) return false;
  return true;
}
__name(periodEligible, "periodEligible");
__name2(periodEligible, "periodEligible");
__name22(periodEligible, "periodEligible");
__name222(periodEligible, "periodEligible");
function periodCompleteForSignal(s, f) {
  const def = MARKET_RULES[s?.market];
  if (!def) return false;
  return def.period === "HT" ? isHalfComplete(f) : isFinished(f);
}
__name(periodCompleteForSignal, "periodCompleteForSignal");
__name2(periodCompleteForSignal, "periodCompleteForSignal");
__name22(periodCompleteForSignal, "periodCompleteForSignal");
__name222(periodCompleteForSignal, "periodCompleteForSignal");
function cardPair(cards) {
  return cardPointsPair(cards);
}
__name(cardPair, "cardPair");
__name2(cardPair, "cardPair");
__name22(cardPair, "cardPair");
__name222(cardPair, "cardPair");
function totalPair(p) {
  const h = num2(p?.home), a = num2(p?.away);
  return h === null || a === null ? null : h + a;
}
__name(totalPair, "totalPair");
__name2(totalPair, "totalPair");
__name22(totalPair, "totalPair");
__name222(totalPair, "totalPair");
function currentBasisTotal(f, basis) {
  if (basis === "goals") return totalPair(pair2(f?.goals));
  if (basis === "corners") return totalPair(pair2(f?.corners));
  if (basis === "cards") return totalPair(cardPair(f?.cards));
  return null;
}
__name(currentBasisTotal, "currentBasisTotal");
__name2(currentBasisTotal, "currentBasisTotal");
__name22(currentBasisTotal, "currentBasisTotal");
__name222(currentBasisTotal, "currentBasisTotal");
function metricSnapshot(f, at) {
  return { at, minute: num2(f.minute), shotsOnTarget: pair2(f.statistics?.shotsOnTarget), shotsOffTarget: pair2(f.statistics?.shotsOffTarget), corners: pair2(f.corners), attacks: pair2(f.statistics?.attacks), dangerousAttacks: pair2(f.statistics?.dangerousAttacks), possession: pair2(f.statistics?.possession), goals: pair2(f.goals), cards: cardPair(f.cards) };
}
__name(metricSnapshot, "metricSnapshot");
__name2(metricSnapshot, "metricSnapshot");
__name22(metricSnapshot, "metricSnapshot");
__name222(metricSnapshot, "metricSnapshot");
function delta(a, b) {
  a = num2(a);
  b = num2(b);
  return a === null || b === null || a < b ? null : a - b;
}
__name(delta, "delta");
__name2(delta, "delta");
__name22(delta, "delta");
__name222(delta, "delta");
function deltaPair(cur, old) {
  return { home: delta(cur?.home, old?.home), away: delta(cur?.away, old?.away) };
}
__name(deltaPair, "deltaPair");
__name2(deltaPair, "deltaPair");
__name22(deltaPair, "deltaPair");
__name222(deltaPair, "deltaPair");
function sharePair(p) {
  const h = num2(p?.home), a = num2(p?.away);
  if (h === null || a === null || h + a <= 0) return { home: null, away: null };
  return { home: h / (h + a) * 100, away: a / (h + a) * 100 };
}
__name(sharePair, "sharePair");
__name2(sharePair, "sharePair");
__name22(sharePair, "sharePair");
__name222(sharePair, "sharePair");
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
__name2(rolling, "rolling");
__name22(rolling, "rolling");
__name222(rolling, "rolling");
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
  const add = /* @__PURE__ */ __name222((key, p) => {
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
__name2(pressurePoint, "pressurePoint");
__name22(pressurePoint, "pressurePoint");
__name222(pressurePoint, "pressurePoint");
function pressureSeries(history, minutes = 10) {
  return (Array.isArray(history) ? history : []).map((_, i) => pressurePoint(history, i, minutes)).filter(Boolean);
}
__name(pressureSeries, "pressureSeries");
__name2(pressureSeries, "pressureSeries");
__name22(pressureSeries, "pressureSeries");
__name222(pressureSeries, "pressureSeries");
function sideValue(p, side) {
  return num2(side === "HOME" ? p?.home : p?.away);
}
__name(sideValue, "sideValue");
__name2(sideValue, "sideValue");
__name22(sideValue, "sideValue");
__name222(sideValue, "sideValue");
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
__name2(evidenceSide, "evidenceSide");
__name22(evidenceSide, "evidenceSide");
__name222(evidenceSide, "evidenceSide");
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
__name2(selectionsFor, "selectionsFor");
__name22(selectionsFor, "selectionsFor");
__name222(selectionsFor, "selectionsFor");
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
__name2(evidenceForSelection, "evidenceForSelection");
__name22(evidenceForSelection, "evidenceForSelection");
__name222(evidenceForSelection, "evidenceForSelection");
function scoreTrailingPass(f, selection, max) {
  if (!["HOME", "AWAY"].includes(selection)) return true;
  const h = num2(f.goals?.home), a = num2(f.goals?.away);
  if (h === null || a === null) return false;
  const def = selection === "HOME" ? a - h : h - a;
  return def <= Number(max ?? 99);
}
__name(scoreTrailingPass, "scoreTrailingPass");
__name2(scoreTrailingPass, "scoreTrailingPass");
__name22(scoreTrailingPass, "scoreTrailingPass");
__name222(scoreTrailingPass, "scoreTrailingPass");
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
__name2(preCandidatesForRule, "preCandidatesForRule");
__name22(preCandidatesForRule, "preCandidatesForRule");
__name222(preCandidatesForRule, "preCandidatesForRule");
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
__name2(oddsRoot, "oddsRoot");
__name22(oddsRoot, "oddsRoot");
__name222(oddsRoot, "oddsRoot");
function findMarket(root, def) {
  if (!root || typeof root !== "object") return null;
  for (const k of def.aliases || []) {
    if (root[k] !== void 0 && root[k] !== null) return root[k];
  }
  return null;
}
__name(findMarket, "findMarket");
__name2(findMarket, "findMarket");
__name22(findMarket, "findMarket");
__name222(findMarket, "findMarket");
function stageValue(market, stage) {
  if (!market || typeof market !== "object") return null;
  if (stage === "inplay") return market.inplay ?? market.in_play ?? market.live ?? market.current ?? null;
  return market[stage] ?? null;
}
__name(stageValue, "stageValue");
__name2(stageValue, "stageValue");
__name22(stageValue, "stageValue");
__name222(stageValue, "stageValue");
function stageSnapshot(root, def, stage) {
  const v = stageValue(findMarket(root, def), stage);
  return v && typeof v === "object" ? clone(v) : v ?? null;
}
__name(stageSnapshot, "stageSnapshot");
__name2(stageSnapshot, "stageSnapshot");
__name22(stageSnapshot, "stageSnapshot");
__name222(stageSnapshot, "stageSnapshot");
function priceFor(root, key, selection) {
  const def = MARKET_RULES[key], market = findMarket(root, def), stage = (key === "ft_over" || key === "ft_under" || key === "ht_over" || key === "ht_under") ? (market?.inplay ?? null) : stageValue(market, "inplay");
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
__name2(priceFor, "priceFor");
__name22(priceFor, "priceFor");
__name222(priceFor, "priceFor");
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
__name2(pricePass, "pricePass");
__name22(pricePass, "pricePass");
__name222(pricePass, "pricePass");
function bookmakerRows(payload) {
  const full = payload?.fullOdds ?? payload?.data?.fullOdds ?? payload?.data ?? payload;
  return Array.isArray(full?.bookmakers) ? full.bookmakers : [];
}
__name(bookmakerRows, "bookmakerRows");
__name2(bookmakerRows, "bookmakerRows");
__name22(bookmakerRows, "bookmakerRows");
__name222(bookmakerRows, "bookmakerRows");
function bookmakerIdentity(row) {
  const slug = String(row?.slug ?? row?.bookmaker?.slug ?? row?.name ?? row?.bookmaker?.name ?? "").trim();
  const name = String(row?.name ?? row?.bookmaker?.name ?? row?.slug ?? row?.bookmaker?.slug ?? "").trim();
  return { slug: slug || name || "unknown", name: name || slug || "Unknown" };
}
__name(bookmakerIdentity, "bookmakerIdentity");
__name2(bookmakerIdentity, "bookmakerIdentity");
__name22(bookmakerIdentity, "bookmakerIdentity");
__name222(bookmakerIdentity, "bookmakerIdentity");
function bookmakerRoot(row) {
  return row?.odds ?? row?.markets ?? row?.data?.odds ?? row?.data?.markets ?? null;
}
__name(bookmakerRoot, "bookmakerRoot");
__name2(bookmakerRoot, "bookmakerRoot");
__name22(bookmakerRoot, "bookmakerRoot");
__name222(bookmakerRoot, "bookmakerRoot");
function sameProviderLine(a, b) {
  const x = num2(a), y = num2(b);
  return x !== null && y !== null && Math.abs(x - y) <= 1e-3;
}
__name(sameProviderLine, "sameProviderLine");
__name2(sameProviderLine, "sameProviderLine");
__name22(sameProviderLine, "sameProviderLine");
__name222(sameProviderLine, "sameProviderLine");
function offersFor(payload, key, selection, canonicalProviderLine, f, cfg) {
  const def = MARKET_RULES[key], lineMarket = def.kind === "AH" || def.kind === "OU", offers = [];
  for (const row of bookmakerRows(payload)) {
    const root = bookmakerRoot(row);
    if (!root) continue;
    const price = priceFor(root, key, selection);
    if (!price || !(price.odds > 0)) continue;
    if (lineMarket && !sameProviderLine(price.providerLine, canonicalProviderLine)) continue;
    const id = bookmakerIdentity(row), pass = pricePass(key, cfg, price, f);
    offers.push({ bookmaker: id.name, bookmakerSlug: id.slug, price, pass, bookRoot: root });
  }
  offers.sort((x, y) => y.price.odds - x.price.odds || x.bookmakerSlug.localeCompare(y.bookmakerSlug));
  return offers;
}
__name(offersFor, "offersFor");
__name2(offersFor, "offersFor");
__name22(offersFor, "offersFor");
__name222(offersFor, "offersFor");
function referencePrice(payload, key, selection) {
  const row = bookmakerRows(payload).find((x) => bookmakerIdentity(x).slug.toLowerCase() === "bet365");
  const root = bookmakerRoot(row);
  const price = root ? priceFor(root, key, selection) : null;
  return price ? { price, bookmaker: "Bet 365", bookmakerSlug: "bet365", bookRoot: root } : null;
}
__name(referencePrice, "referencePrice");
__name2(referencePrice, "referencePrice");
__name22(referencePrice, "referencePrice");
__name222(referencePrice, "referencePrice");
function consensusProviderLine(payload, key, selection) {
  const def = MARKET_RULES[key];
  if (!(def.kind === "AH" || def.kind === "OU")) return null;
  const bet365 = referencePrice(payload, key, selection), betLine = num2(bet365?.price?.providerLine);
  const groups = /* @__PURE__ */ new Map();
  for (const row of bookmakerRows(payload)) {
    const root = bookmakerRoot(row);
    if (!root) continue;
    const price = priceFor(root, key, selection), line = num2(price?.providerLine);
    if (line === null) continue;
    const id = bookmakerIdentity(row), bucket = Math.round(line * 1e3) / 1e3, keyLine = bucket.toFixed(3);
    const g = groups.get(keyLine) || { line: bucket, count: 0, books: [], bet365: false };
    g.count += 1;
    g.books.push(id.slug);
    if (id.slug.toLowerCase() === "bet365") g.bet365 = true;
    groups.set(keyLine, g);
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || Number(b.bet365) - Number(a.bet365) || (betLine === null ? 0 : Math.abs(a.line - betLine) - Math.abs(b.line - betLine)) || Math.abs(a.line) - Math.abs(b.line));
  return ranked[0] ?? null;
}
__name(consensusProviderLine, "consensusProviderLine");
__name2(consensusProviderLine, "consensusProviderLine");
__name22(consensusProviderLine, "consensusProviderLine");
__name222(consensusProviderLine, "consensusProviderLine");

/* Corner Referee: only bookmaker quotes verified from recent, recorded live ticks. */
var BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3;
var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;

/* B46_GOALS_JOHN_RESTORED_20261011 */
function isVerifiedCornerMarket(key){
  return key==="ft_corner_over"||key==="ft_corner_under"||key==="ht_corner_over"||key==="ht_corner_under"||key==="ft_corner_ah";
}
function cornerHistorySpec(key){
  if(key==="ft_corner_over"||key==="ft_corner_under")return {market:"corner",field:"corner_line",first:"over",second:"under"};
  if(key==="ht_corner_over"||key==="ht_corner_under")return {market:"corner_half",field:"corner_line_half",first:"over",second:"under"};
  if(key==="ft_corner_ah")return {market:"corner_asian",field:"corner_asian",first:"home",second:"away"};
  return null;
}
function verifyRecentCornerHistory(j,id,key,f,at=Date.now()){
  const spec=cornerHistorySpec(key);
  if(!spec||(j?.success!==1&&j?.success!==true))return null;
  const d=j?.data;
  if(String(d?.fixture_id??"")!==String(id)||String(d?.bookmaker?.slug??"").toLowerCase()!=="bet365"||d?.market!==spec.market)return null;
  if(j?.pagination?.has_more!==false||!Array.isArray(d?.ticks)||!d.ticks.length)return null;
  const tick=d.ticks[d.ticks.length-1];
  if(tick?.suspended===true||tick?.half_time===true||tick?.minute===null||tick?.minute===undefined)return null;
  const updatedAt=Date.parse(String(tick?.recorded_at??""));
  if(!Number.isFinite(updatedAt)||updatedAt>at+5e3||at-updatedAt>BALL46_CORNER_TICK_MAX_AGE_MS)return null;
  const minute=Number(tick.minute),fixtureMinute=Number(f?.minute);
  if(!Number.isFinite(minute)||!Number.isFinite(fixtureMinute)||Math.abs(minute-fixtureMinute)>5)return null;
  const line=Number(tick.line),first=Number(tick[spec.first]),second=Number(tick[spec.second]);
  if(tick.line==null||tick[spec.first]==null||tick[spec.second]==null||
     !Number.isFinite(line)||(spec.market!=="corner_asian"&&line<0)||Math.abs(line*4-Math.round(line*4))>1e-6||
     !Number.isFinite(first)||!Number.isFinite(second)||first<=1||second<=1)return null;
  const bookRoot={[spec.field]:{inplay:{line,[spec.first]:first,[spec.second]:second}}};
  return {payload:{fullOdds:{bookmakers:[{slug:"bet365",name:"Bet 365",odds:bookRoot}]}},recordedAt:tick.recorded_at};
}
async function fetchVerifiedCornerOnly(env,id,key,fixture){
  const spec=cornerHistorySpec(key);
  if(!spec||!env.FIVEDOLLAR_API_KEY)return null;
  const url="https://api.5dollarfootballapi.com/v1/fixtures/"+encodeURIComponent(id)+"/odds/history?market="+encodeURIComponent(spec.market)+"&bookmaker=bet365&per_page=500";
  const response=await fetch(url,{headers:{Authorization:"Bearer "+env.FIVEDOLLAR_API_KEY,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(11000)});
  if(!response.ok)return null;
  const payload=await response.json().catch(()=>null);
  return verifyRecentCornerHistory(payload,id,key,fixture,Date.now());
}

function pickBestPriced(candidates, fullPayload, bulkRoot, f, settings) {
  const passed = [];
  for (const c of candidates) {
    const def = MARKET_RULES[c.market], cfg = settings[c.market], lineMarket = def.kind === "AH" || def.kind === "OU";
    const consensus = lineMarket ? consensusProviderLine(fullPayload, c.market, c.selection) : null;
    const reference = referencePrice(fullPayload, c.market, c.selection);
    const canonicalLine = lineMarket ? consensus?.line ?? null : null;
    if (lineMarket && canonicalLine === null) continue;
    const offers = offersFor(fullPayload, c.market, c.selection, canonicalLine, f, cfg);
    const offer = offers.find((x) => x.pass);
    if (!offer) continue;
    passed.push({ ...c, price: offer.price, bookmaker: offer.bookmaker, bookmakerSlug: offer.bookmakerSlug, bookRoot: offer.bookRoot, offerCount: offers.length, bookCount: bookmakerRows(fullPayload).length, referenceBookmaker: reference?.bookmaker ?? null, referenceBookmakerSlug: reference?.bookmakerSlug ?? null, referenceProviderLine: canonicalLine, refereeConsensusBooks: consensus?.count ?? offers.length, refereeConsensusSlugs: consensus?.books ?? offers.map((x) => x.bookmakerSlug) });
  }
  passed.sort((x, y) => y.strength - x.strength || y.price.odds - x.price.odds || x.bookmakerSlug.localeCompare(y.bookmakerSlug));
  return passed[0] || null;
}
__name(pickBestPriced, "pickBestPriced");
__name2(pickBestPriced, "pickBestPriced");
__name22(pickBestPriced, "pickBestPriced");
__name222(pickBestPriced, "pickBestPriced");
function storedFixture(s) {
  return { goals: s?.finalScore ?? null, corners: s?.finalCorners ?? null, cards: s?.finalCards ?? null };
}
__name(storedFixture, "storedFixture");
__name2(storedFixture, "storedFixture");
__name22(storedFixture, "storedFixture");
__name222(storedFixture, "storedFixture");

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
__name2(reconcileSettled, "reconcileSettled");
__name22(reconcileSettled, "reconcileSettled");
__name222(reconcileSettled, "reconcileSettled");
function statsFrom(signals) {
  const rows = signals.filter((s) => s.status === "SETTLED");
  const count = /* @__PURE__ */ __name222((r) => rows.filter((x) => x.result === r).length, "count");
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
__name2(statsFrom, "statsFrom");
__name22(statsFrom, "statsFrom");
__name222(statsFrom, "statsFrom");
var WORK_STORE_VERSION = "chunked-working-store-v1";
var WORK_SIGNAL_META_KEY = "work:v2:signals:meta";
var WORK_SIGNAL_PREFIX = "work:v2:signals:";
var WORK_HISTORY_META_KEY = "work:v2:histories:meta";
var WORK_HISTORY_PREFIX = "work:v2:histories:";
var WORK_SIGNAL_CHUNK_ROWS = 96;
var WORK_HISTORY_CHUNK_FIXTURES = 6;
var WORK_SETTLED_TAIL = 120;
async function readWorkingSignals(ctx) {
  const meta = await ctx.storage.get(WORK_SIGNAL_META_KEY);
  if (meta?.version === WORK_STORE_VERSION && meta?.generation && Number(meta?.chunkCount) >= 0) {
    const out = [];
    for (let i = 0; i < Number(meta.chunkCount); i++) {
      const rows = await ctx.storage.get(`${WORK_SIGNAL_PREFIX}${meta.generation}:${i}`);
      if (Array.isArray(rows)) out.push(...rows);
    }
    return out;
  }
  const legacy = await ctx.storage.get("signals");
  return Array.isArray(legacy) ? legacy : [];
}
__name(readWorkingSignals, "readWorkingSignals");
__name2(readWorkingSignals, "readWorkingSignals");
async function writeWorkingSignals(ctx, rows) {
  const list = Array.isArray(rows) ? rows : [], old = await ctx.storage.get(WORK_SIGNAL_META_KEY), generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, chunks = [];
  for (let i = 0; i < list.length; i += WORK_SIGNAL_CHUNK_ROWS) chunks.push(list.slice(i, i + WORK_SIGNAL_CHUNK_ROWS));
  for (let i = 0; i < chunks.length; i++) await ctx.storage.put(`${WORK_SIGNAL_PREFIX}${generation}:${i}`, chunks[i]);
  await ctx.storage.put(WORK_SIGNAL_META_KEY, { version: WORK_STORE_VERSION, generation, chunkCount: chunks.length, rowCount: list.length, updatedAt: Date.now() });
  await ctx.storage.delete("signals");
  if (old?.version === WORK_STORE_VERSION && old?.generation && old.generation !== generation) {
    for (let i = 0; i < Number(old.chunkCount || 0); i++) await ctx.storage.delete(`${WORK_SIGNAL_PREFIX}${old.generation}:${i}`);
  }
}
__name(writeWorkingSignals, "writeWorkingSignals");
__name2(writeWorkingSignals, "writeWorkingSignals");
async function readWorkingHistories(ctx) {
  const meta = await ctx.storage.get(WORK_HISTORY_META_KEY);
  if (meta?.version === WORK_STORE_VERSION && meta?.generation && Number(meta?.chunkCount) >= 0) {
    const out = {};
    for (let i = 0; i < Number(meta.chunkCount); i++) {
      const part = await ctx.storage.get(`${WORK_HISTORY_PREFIX}${meta.generation}:${i}`);
      if (part && typeof part === "object" && !Array.isArray(part)) Object.assign(out, part);
    }
    return out;
  }
  const legacy = await ctx.storage.get("histories");
  return legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy : {};
}
__name(readWorkingHistories, "readWorkingHistories");
__name2(readWorkingHistories, "readWorkingHistories");
async function writeWorkingHistories(ctx, histories) {
  const obj = histories && typeof histories === "object" && !Array.isArray(histories) ? histories : {}, entries = Object.entries(obj), old = await ctx.storage.get(WORK_HISTORY_META_KEY), generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, chunks = [];
  for (let i = 0; i < entries.length; i += WORK_HISTORY_CHUNK_FIXTURES) chunks.push(Object.fromEntries(entries.slice(i, i + WORK_HISTORY_CHUNK_FIXTURES)));
  for (let i = 0; i < chunks.length; i++) await ctx.storage.put(`${WORK_HISTORY_PREFIX}${generation}:${i}`, chunks[i]);
  await ctx.storage.put(WORK_HISTORY_META_KEY, { version: WORK_STORE_VERSION, generation, chunkCount: chunks.length, fixtureCount: entries.length, updatedAt: Date.now() });
  await ctx.storage.delete("histories");
  if (old?.version === WORK_STORE_VERSION && old?.generation && old.generation !== generation) {
    for (let i = 0; i < Number(old.chunkCount || 0); i++) await ctx.storage.delete(`${WORK_HISTORY_PREFIX}${old.generation}:${i}`);
  }
}
__name(writeWorkingHistories, "writeWorkingHistories");
__name2(writeWorkingHistories, "writeWorkingHistories");
var Nomad343Engine = class extends DurableObject {
  static {
    __name(this, "Nomad343Engine");
  }
  static {
    __name2(this, "Nomad343Engine");
  }
  static {
    __name22(this, "Nomad343Engine");
  }
  static {
    __name222(this, "Nomad343Engine");
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
    const realtimePendingNewRows = [];
    const startedAt = now();
    try {
      const hr = await this.env.HUB.fetch("https://hub.internal/snapshot"), hub = await hr.json();
      if (!hub?.ok) throw new Error(hub?.error || "HUB_NOT_READY");
      const settings = await this.readSettings(), run = await this.readRun(), oldHist = await readWorkingHistories(this.ctx), signals = await readWorkingSignals(this.ctx);
      const histories = {}, board = [], seen = new Set(signals.filter((s) => s.status === "PENDING").map((s) => `${s.fixtureId}:${s.market}`)), at = Number(hub.fetchedAt || now());
      let refereeRequests = 0, externalOddsRequests = 0, refereeQueued = 0;
      /* B46_REFEREE_BACKOFF_FIX_20261011: budget distinct Full Market requests per scan. */
      const FULL_MARKET_REQUESTS_PER_SCAN=4;
      let fullMarketBackoff=false;
      let cornerTickRequests=0;
      const cornerTickCache=new Map();
      const refereeErrors = [];
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
      const orderedRefereeFixtures=(hub.fixtures || []).slice();
            const refereeRotationOffset=orderedRefereeFixtures.length ? (Math.floor(startedAt/6e4))%orderedRefereeFixtures.length : 0;
            const refereeScanOrder=orderedRefereeFixtures.slice(refereeRotationOffset).concat(orderedRefereeFixtures.slice(0,refereeRotationOffset));
      /* B46_CORNERS_FAIR_QUEUE_AND_RECHECK_20261018:
         Only eligible Corners groups compete for the existing 2 HTTP calls
         per scan. Persist cursor to prevent fixture-list starvation.
         Non-Corners order, settings and odds/referee code stay intact. */
      const b46CornerCandidateKeys=[];
      const b46CornerSeenKeys=new Set();
      for(const cf of hub.fixtures||[]){
        if(!isLive(cf)||hub.stale===true)continue;
        const fixtureId=String(cf.fixtureId);
        for(const mk of MARKET_KEYS){
          if(!isVerifiedCornerMarket(mk)||!run[mk]||seen.has(fixtureId+":"+mk))continue;
          const pre=preCandidatesForRule(mk,cf,histories[fixtureId]||[],settings[mk]);
          if(!pre.candidates?.length)continue;
          const spec=cornerHistorySpec(mk);
          if(!spec)continue;
          const ck=fixtureId+"|"+spec.market;
          if(!b46CornerSeenKeys.has(ck)){
            b46CornerSeenKeys.add(ck);
            b46CornerCandidateKeys.push(ck);
          }
        }
      }
      const b46CornerCursorRaw=Number(await this.ctx.storage.get("b46:corner:verified-history-cursor:v1")||0);
      const b46CornerCursor=Number.isFinite(b46CornerCursorRaw)&&b46CornerCursorRaw>=0?Math.trunc(b46CornerCursorRaw):0;
      const b46CornerBudgetWindow=new Set();
      for(let n=0;n<Math.min(BALL46_CORNER_TICK_REQUESTS_PER_SCAN,b46CornerCandidateKeys.length);n++){
        b46CornerBudgetWindow.add(b46CornerCandidateKeys[(b46CornerCursor+n)%b46CornerCandidateKeys.length]);
      }
            /* JOHN_BULK_QUALIFIED_PRICE_PREWARM_20261011.
       * Use ONE prewarm and ONE cache-only snapshot for qualified fixtures.
       * No per-fixture request in Engine; the central Full Market DO reserves rate.
       */
      const johnEligibleFixtureIds=[];
      const johnQuotesByFixture=new Map();
      for(const fixture of refereeScanOrder){
        if(!isLive(fixture)||hub.stale===true)continue;
        const fixtureId=String(fixture.fixtureId),hist=histories[fixtureId]||[];
        let qualified=false;
        for(const market of MARKET_KEYS){
          if(!run[market]||isVerifiedCornerMarket(market)||
             seen.has(fixtureId+":"+market))continue;
          if(preCandidatesForRule(market,fixture,hist,settings[market]).candidates.length){
            qualified=true;
            break;
          }
        }
        if(qualified)johnEligibleFixtureIds.push(fixtureId);
      }
      if(johnEligibleFixtureIds.length&&this.env.FULL_MARKET){
        try{
          const ids=johnEligibleFixtureIds.slice(0,128);
          const requestBody=JSON.stringify({fixtureIds:ids});
          const warmResp=await this.env.FULL_MARKET.fetch(
            new Request("https://full-market.internal/prewarm",{method:"POST",headers:{"content-type":"application/json"},body:requestBody})
          );
          const warm=await warmResp.json();
          if(!warmResp.ok||warm?.ok!==true)throw new Error("JOHN_CENTRAL_PREWARM_"+String(warm?.error||warmResp.status));
          refereeRequests+=Math.max(0,Number(warm.attempted)||0);
          externalOddsRequests+=Math.max(0,Number(warm.externalRequestsAdded)||0);
          /* B46_FAIR_CACHE_20261017: prewarm budget unchanged; read existing fresh central-cache quotes for every qualified match. */
          for(let cacheOffset=0;cacheOffset<johnEligibleFixtureIds.length;cacheOffset+=128){
            const cacheRequestBody=JSON.stringify({fixtureIds:johnEligibleFixtureIds.slice(cacheOffset,cacheOffset+128)});
          const cacheResp=await this.env.FULL_MARKET.fetch(
            new Request("https://full-market.internal/board-cache",{method:"POST",headers:{"content-type":"application/json"},body:cacheRequestBody})
          );
          const snapshot=await cacheResp.json();
          if(!cacheResp.ok||snapshot?.ok!==true)throw new Error("JOHN_CENTRAL_CACHE_"+String(snapshot?.error||cacheResp.status));
          for(const [fixtureId,entry] of Object.entries(snapshot.entries||{})){
            const age=Number(entry?.ageMs);
            if(entry?.stale!==false||!Number.isFinite(age)||age<0||age>45000||
               !Array.isArray(entry?.fullOdds?.bookmakers)||!entry.fullOdds.bookmakers.length)continue;
            johnQuotesByFixture.set(fixtureId,{ok:true,fullOdds:entry.fullOdds,cached:true,stale:false,externalRequestsAdded:0});
          }
          }
        }catch(error){
          refereeErrors.push({error:"JOHN_BULK_PRICING_GATE_"+String(error?.message||error)});
        }
      }
      for (const f of refereeScanOrder) {
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
            refereeQueued++;
            const requiresFullMarket=marketCandidates.some(c=>!isVerifiedCornerMarket(c.market));
            const full=requiresFullMarket?(johnQuotesByFixture.get(id)||null):null;
            if(requiresFullMarket&&!full)refereeErrors.push({fixtureId:id,error:"JOHN_QUALIFIED_PRICE_CACHE_MISS"});
            if (!full && !marketCandidates.some(c=>isVerifiedCornerMarket(c.market))) {
              for (const c of marketCandidates) analysis[c.market] = { state: "PRICE_REFEREE_UNAVAILABLE" };
            } else {
              const grouped = /* @__PURE__ */ new Map();
              for (const c of marketCandidates) {
                if (!grouped.has(c.market)) grouped.set(c.market, []);
                grouped.get(c.market).push(c);
              }
              for (const [key, cands] of grouped) {
                if (!full && !isVerifiedCornerMarket(key)) {
                  analysis[key]={state:"PRICE_REFEREE_UNAVAILABLE"};
                  continue;
                }
                let verifiedCorner=null;
                if (isVerifiedCornerMarket(key)) {
                  const spec=cornerHistorySpec(key),cacheKey=id+"|"+spec.market;
                  if (!cornerTickCache.has(cacheKey)) {
                    if (!b46CornerBudgetWindow.has(cacheKey)||cornerTickRequests>=BALL46_CORNER_TICK_REQUESTS_PER_SCAN) {
                      analysis[key]={state:"CORNER_HISTORY_BUDGET"};
                      continue;
                    }
                    cornerTickRequests++;
                    try{cornerTickCache.set(cacheKey,await fetchVerifiedCornerOnly(this.env,id,key,f));}
                    catch(error){
                      cornerTickCache.set(cacheKey,null);
                      refereeErrors.push({fixtureId:id,market:key,error:"CORNER_HISTORY_"+String(error?.message||error)});
                    }
                  }
                  verifiedCorner=cornerTickCache.get(cacheKey);
                  if(!verifiedCorner){
                    analysis[key]={state:"CORNER_LIVE_PRICE_UNVERIFIED"};
                    continue;
                  }
                }
                const best = pickBestPriced(cands,verifiedCorner?verifiedCorner.payload:full,root,f,settings);
                if (!best) {
                  analysis[key] = { state: "NO_MATCHING_LINE_PRICE", priceSource: verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY" };
                  continue;
                }
                const def = MARKET_RULES[key], price = best.price, selectedRoot = best.bookRoot;
                const historyPoint = { minute: num2(f.minute), odds: price.odds, line: price.line, providerLine: price.providerLine, bookmaker: best.bookmaker, bookmakerSlug: best.bookmakerSlug, observedAt: at };
                const sig = { id: `${id}-${key}-${now().toString(36)}`, fixtureId: id, league: clone(f.league), home: clone(f.home), away: clone(f.away), market: key, marketLabel: def.label, providerMarket: def.provider, period: def.period, selection: best.selection, line: price.line, selectionLine: price.line, providerLine: price.providerLine, providerLineSide: price.providerLineSide ?? null, odds: price.odds, bookmaker: best.bookmaker, bookmakerSlug: best.bookmakerSlug, priceStage: "inplay", priceSource: verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY", priceReference: verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE", referenceProviderLine: best.referenceProviderLine ?? null, refereeBookCount: best.bookCount, refereeOfferCount: best.offerCount, refereeConsensusBooks: best.refereeConsensusBooks ?? null, refereeConsensusSlugs: best.refereeConsensusSlugs ?? [], openingPrice: stageSnapshot(selectedRoot, def, "opening"), closingPrice: stageSnapshot(selectedRoot, def, "closing"), inplayPrice: stageSnapshot(selectedRoot, def, "inplay"), createdAt: now(), entryMinute: num2(f.minute), minute: num2(f.minute), entryScore: clone(f.goals), scoreAt: clone(f.goals), entryCorners: clone(f.corners), entryCards: clone(f.cards), entryStats: clone(f.statistics), statisticsAtEntry: clone(f.statistics), eventHistory: Array.isArray(f.events) ? clone(f.events) : [], bookmakerHistory: [historyPoint], evidence: best.evidence, rolling: best.rolling, status: "PENDING", result: null, finalScore: null, finalCorners: null, finalCards: null, settlementBasis: def.basis || "goals", settlementRevision: SETTLEMENT_REVISION, lineGap: def.gap ? lineGap(price.line, currentBasisTotal(f, def.basis)) : null };
                signals.push(sig);
                realtimePendingNewRows.push(sig);
                seen.add(`${id}:${key}`);
                analysis[key] = { state: "PASS", selection: best.selection, line: price.line, providerLine: price.providerLine, odds: price.odds, bookmaker: best.bookmaker, bookmakerSlug: best.bookmakerSlug, evidence: best.evidence, priceSource: verifiedCorner ? "BET365_VERIFIED_HISTORY_INPLAY" : "BEST_OF_19_INPLAY", priceReference: verifiedCorner ? "BET365_RECENT_CORNER_TICK" : "BEST19_CONSENSUS_LINE", referenceProviderLine: best.referenceProviderLine ?? null, refereeOfferCount: best.offerCount };
              }
            }
          }
        }
        board.push({ ...f, analysis, fullOdds: root ? clone(root) : null, fullOddsFetchedAt: root ? num2(f.providerOddsUpdatedAt) ?? at : null, fullOddsSource: root ? "BULK_SNAPSHOT" : null });
      }
      const originalOrder=new Map((hub.fixtures||[]).map((fixture,index)=>[String(fixture.fixtureId),index]));
      board.sort((a,b)=>(originalOrder.get(String(a.fixtureId))??Number.MAX_SAFE_INTEGER)-(originalOrder.get(String(b.fixtureId))??Number.MAX_SAFE_INTEGER));
      const phase2Changed = phase2ApplyLive(signals, fixtureMap, at, hub.stale === true);
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
      const nonSettled = signals.filter((x) => x?.status !== "SETTLED" || phase2IsEarly(x));
      const nonSettledIds = new Set(nonSettled.map((x) => String(x?.id || "")));
      const recentSettled = signals.filter((x) => x?.status === "SETTLED" && !phase2IsEarly(x) && !nonSettledIds.has(String(x?.id || ""))).slice(-MAX_SIGNALS);
      const capped = [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
      if(b46CornerCandidateKeys.length){
        await this.ctx.storage.put("b46:corner:verified-history-cursor:v1",b46CornerCursor+Math.min(BALL46_CORNER_TICK_REQUESTS_PER_SCAN,b46CornerCandidateKeys.length));
      }
      await writeWorkingHistories(this.ctx, histories);
      await writeWorkingSignals(this.ctx, capped);
      if (phase2Changed.length) await this.upsertLedgerRows(phase2Changed, fixtureMap);
      if (realtimePendingNewRows.length) {
        await this.upsertLedgerRows(realtimePendingNewRows, fixtureMap);
      }
      await this.ctx.storage.put("board", { ok: true, version: VERSION, revision: REVISION, dataMode: "BULK_PLUS_BEST19_REFEREE", hubVersion: hub.version, hubFetchedAt: hub.fetchedAt, hubAgeMs: hub.ageMs, stale: hub.stale, counts: hub.counts, fixtures: board, runState: run, referee: { mode: "BEST_OF_19_INPLAY", externalRequestsAdded: externalOddsRequests, requests: refereeRequests, queued: refereeQueued, errors: refereeErrors } });
      const meta = { ok: true, version: VERSION, revision: REVISION, dataMode: "BULK_PLUS_BEST19_REFEREE", startedAt, finishedAt: now(), fixtureCount: board.length, liveCount: board.filter(isLive).length, signalCount: capped.filter((s) => s.status === "PENDING").length, unresolvedCount: capped.filter((s) => s.status === "UNRESOLVED").length, reconciled, refereeRequests, refereeQueued, externalOddsRequests, refereeErrors, lastError: null };
      await this.ctx.storage.put("lastScan", meta);
      return meta;
    } catch (e) {
      const meta = { ok: false, version: VERSION, revision: REVISION, dataMode: "BULK_PLUS_BEST19_REFEREE", startedAt, finishedAt: now(), externalOddsRequests: 0, lastError: String(e?.message || e) };
      await this.ctx.storage.put("lastScan", meta);
      return meta;
    }
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (!["/settings", "/registry", "/fixture-odds", "/referee"].includes(u.pathname)) await this.scanIfDue();
    if (u.pathname === "/referee" && request.method === "GET") {
      if (String(this.env.CANARY_DIAGNOSTIC || "") !== "1") return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
      const key = String(u.searchParams.get("market") || "ft_ah"), selection = String(u.searchParams.get("selection") || "HOME").toUpperCase();
      if (!MARKET_RULES[key]) return Response.json({ ok: false, error: "INVALID_MARKET" }, { status: 400 });
      const hr = await this.env.HUB.fetch("https://hub.internal/snapshot"), hub = await hr.json();
      if (!hub?.ok) return Response.json({ ok: false, error: "HUB_NOT_READY" }, { status: 503 });
      const requestedId = String(u.searchParams.get("fixtureId") || "").trim();
      const pool = requestedId ? (hub.fixtures || []).filter((x) => String(x?.fixtureId ?? "") === requestedId) : (hub.fixtures || []).filter(isLive).slice(0, 8);
      const def = MARKET_RULES[key], lineMarket = def.kind === "AH" || def.kind === "OU";
      let f = null, fixtureId = "", full = null, consensus = null;
      for (const candidate of pool) {
        const id = String(candidate?.fixtureId ?? "");
        if (!id) continue;
        const rr = await this.env.FULL_MARKET.fetch(`https://full-market.internal/fixture-odds?fixtureId=${encodeURIComponent(id)}`), j = await rr.json();
        if (!rr.ok || j?.ok !== true) continue;
        const con = lineMarket ? consensusProviderLine(j, key, selection) : null;
        if (lineMarket && con?.line === void 0) continue;
        f = candidate;
        fixtureId = id;
        full = j;
        consensus = con;
        break;
      }
      if (!f || !full) return Response.json({ ok: false, error: lineMarket ? "CONSENSUS_LIVE_LINE_UNAVAILABLE" : "NO_LIVE_FIXTURE", market: key, selection }, { status: 409 });
      const canonicalLine = lineMarket ? consensus?.line ?? null : null, cfg = (await this.readSettings())[key];
      const offers = offersFor(full, key, selection, canonicalLine, f, cfg), best = offers.find((x) => x.pass) || null;
      const safeOffers = offers.map((x) => ({ bookmaker: x.bookmaker, bookmakerSlug: x.bookmakerSlug, odds: x.price.odds, line: x.price.line, providerLine: x.price.providerLine, pass: x.pass }));
      return Response.json({ ok: true, version: VERSION, revision: REVISION, fixtureId, market: key, selection, canonicalProviderLine: canonicalLine, canonicalSource: lineMarket ? "BEST19_CONSENSUS_LINE" : "NONE", consensusBooks: consensus?.count ?? null, consensusBookmakers: consensus?.books ?? [], bookmakerCount: bookmakerRows(full).length, offerCount: safeOffers.length, best: best ? { bookmaker: best.bookmaker, bookmakerSlug: best.bookmakerSlug, odds: best.price.odds, line: best.price.line, providerLine: best.price.providerLine } : null, offers: safeOffers, fullMarket: { cached: full.cached, stale: full.stale, externalRequestsAdded: full.externalRequestsAdded } });
    }
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
      return Response.json({ ok: Boolean(m?.ok), component: "NOMAD343_ENGINE", version: VERSION, revision: REVISION, dataMode: "BULK_PLUS_BEST19_REFEREE", ...m || {} });
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
      const s = await readWorkingSignals(this.ctx);
      return Response.json({ ok: true, version: VERSION, signals: s.filter((x) => x.status === "PENDING").sort((a, b) => b.createdAt - a.createdAt), allCount: s.length });
    }
    if (u.pathname === "/statistics") {
      const s = await readWorkingSignals(this.ctx);
      return Response.json({ ok: true, version: VERSION, settlementRevision: SETTLEMENT_REVISION, markets: MARKET_RULES, ...statsFrom(s) });
    }
    if (u.pathname === "/history" && request.method === "GET") {
      const fixtureId = String(u.searchParams.get("fixtureId") || "").trim();
      if (!fixtureId) return Response.json({ ok: false, error: "FIXTURE_ID_REQUIRED" }, { status: 400 });
      const minutes = Math.max(2, Math.min(30, Math.round(num2(u.searchParams.get("window")) ?? 10))), histories = await readWorkingHistories(this.ctx), rows = Array.isArray(histories[fixtureId]) ? histories[fixtureId] : [];
      return Response.json({ ok: true, version: "nomad343-flow-history-v1", fixtureId, retainedMinutes: 180, maxRows: MAX_HISTORY_ROWS, pressureWindowMinutes: minutes, weights: PRESSURE_WEIGHTS, firstAt: rows[0]?.at ?? null, lastAt: rows[rows.length - 1]?.at ?? null, rows, pressure: pressureSeries(rows, minutes) });
    }
    return new Response("Not found", { status: 404 });
  }
};
var BRIDGE_VERSION = "external-final-bridge-v1";
var MAX_SIGNALS2 = 1600;
var num3 = /* @__PURE__ */ __name222((v) => v === null || v === void 0 || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v), "num");
var clone2 = /* @__PURE__ */ __name222((v) => v === void 0 ? null : JSON.parse(JSON.stringify(v)), "clone");
var now2 = /* @__PURE__ */ __name222(() => Date.now(), "now");
function isFinished2(f) {
  const s = String(f?.boardState ?? f?.status ?? f?.statusCode ?? "").toLowerCase();
  return f?.boardState === "finished" || /finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s);
}
__name(isFinished2, "isFinished2");
__name2(isFinished2, "isFinished2");
__name22(isFinished2, "isFinished2");
__name222(isFinished2, "isFinished");
function isHalfComplete2(f) {
  if (isFinished2(f)) return true;
  const raw = `${f?.status ?? ""} ${f?.statusCode ?? ""}`.toLowerCase(), minute = num3(f?.minute);
  return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw) || minute !== null && minute >= 46;
}
__name(isHalfComplete2, "isHalfComplete2");
__name2(isHalfComplete2, "isHalfComplete2");
__name22(isHalfComplete2, "isHalfComplete2");
__name222(isHalfComplete2, "isHalfComplete");
function periodComplete(signal, fixture) {
  const def = MARKET_RULES[signal?.market];
  if (!def) return false;
  return def.period === "HT" ? isHalfComplete2(fixture) : isFinished2(fixture);
}
__name(periodComplete, "periodComplete");
__name2(periodComplete, "periodComplete");
__name22(periodComplete, "periodComplete");
__name222(periodComplete, "periodComplete");
function normalizeFinalFixture(raw) {
  const d = raw?.data ?? raw;
  if (!d || typeof d !== "object" || d.id === void 0 && d.fixture_id === void 0) return null;
  const status = String(d.status ?? d.status_code ?? "");
  const statusCode = d.status_code ?? d.statusCode ?? null;
  const finished = /finished|full_time|full time|\bft\b|ended|\bfull\b/i.test(`${status} ${statusCode}`);
  const minute = num3(d.minute ?? d.elapsed ?? d.status?.minute ?? d.status?.elapsed);
  return {
    fixtureId: String(d.id ?? d.fixture_id),
    boardState: finished ? "finished" : /live|in_play|in play|playing|half|\b1h\b|\b2h\b/i.test(`${status} ${statusCode}`) ? "live" : "unknown",
    status,
    statusCode,
    minute,
    league: clone2(d.league),
    home: clone2(d.teams?.home ?? d.home),
    away: clone2(d.teams?.away ?? d.away),
    goals: { home: num3(d.goals?.home ?? d.score?.home), away: num3(d.goals?.away ?? d.score?.away), halfHome: num3(d.goals?.halfHome ?? d.goals?.half_home ?? d.score?.halfHome ?? d.score?.half_home), halfAway: num3(d.goals?.halfAway ?? d.goals?.half_away ?? d.score?.halfAway ?? d.score?.half_away) },
    corners: { home: num3(d.corners?.home), away: num3(d.corners?.away), halfHome: num3(d.corners?.halfHome ?? d.corners?.half_home), halfAway: num3(d.corners?.halfAway ?? d.corners?.half_away) },
    cards: clone2(d.cards)
  };
}
__name(normalizeFinalFixture, "normalizeFinalFixture");
__name2(normalizeFinalFixture, "normalizeFinalFixture");
__name22(normalizeFinalFixture, "normalizeFinalFixture");
__name222(normalizeFinalFixture, "normalizeFinalFixture");
function secureTokenOk(request, env) {
  const expected = String(env.FIVEDOLLAR_API_KEY || "");
  const provided = String(request.headers.get("x-settlement-token") || "");
  return expected.length >= 16 && provided.length === expected.length && provided === expected;
}
__name(secureTokenOk, "secureTokenOk");
__name2(secureTokenOk, "secureTokenOk");
__name22(secureTokenOk, "secureTokenOk");
__name222(secureTokenOk, "secureTokenOk");
var STAT_LEDGER_PREFIX = "stat:v2:row:";
var STAT_LEDGER_META_KEY = "stat:v2:meta";
var STAT_LEDGER_VERSION = "signal-ledger-v2-longterm";
var STAT_LEDGER_PAGE_SIZE = 500;
var FINAL_RECONCILE_VERSION = "missing-final-direct-v1";
var FINAL_RECHECK_STATE_KEY = "stat:v2:final-recheck";
var FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3;
var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;
var FINAL_RECHECK_MAX_PER_SCAN = 3;
var FINAL_RECHECK_TIMEOUT_MS = 12 * 1e3;
function ledgerTs(v) {
  const n = Number(v);
  return String(Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0).padStart(13, "0");
}
__name(ledgerTs, "ledgerTs");
__name2(ledgerTs, "ledgerTs");
__name22(ledgerTs, "ledgerTs");
__name222(ledgerTs, "ledgerTs");
function ledgerKey(row) {
  return `${STAT_LEDGER_PREFIX}${ledgerTs(row?.createdAt)}:${String(row?.id || "")}`;
}
__name(ledgerKey, "ledgerKey");
__name2(ledgerKey, "ledgerKey");
__name22(ledgerKey, "ledgerKey");
__name222(ledgerKey, "ledgerKey");
function blankLedgerMeta() {
  return { version: STAT_LEDGER_VERSION, ledgerTotal: 0, settledTotal: 0, pending: 0, unresolved: 0, win: 0, loss: 0, push: 0, halfWin: 0, halfLoss: 0, byMarket: {}, updatedAt: 0 };
}
__name(blankLedgerMeta, "blankLedgerMeta");
__name2(blankLedgerMeta, "blankLedgerMeta");
__name22(blankLedgerMeta, "blankLedgerMeta");
__name222(blankLedgerMeta, "blankLedgerMeta");
function normalizeLedgerMeta(raw) {
  const b = blankLedgerMeta(), m = raw && typeof raw === "object" ? raw : {};
  for (const k of ["ledgerTotal", "settledTotal", "pending", "unresolved", "win", "loss", "push", "halfWin", "halfLoss"]) b[k] = Math.max(0, Number(m[k] || 0));
  b.byMarket = { ...m.byMarket || {} };
  b.updatedAt = Number(m.updatedAt || 0);
  return b;
}
__name(normalizeLedgerMeta, "normalizeLedgerMeta");
__name2(normalizeLedgerMeta, "normalizeLedgerMeta");
__name22(normalizeLedgerMeta, "normalizeLedgerMeta");
__name222(normalizeLedgerMeta, "normalizeLedgerMeta");
function ledgerResultBucket(row) {
  const r = String(row?.result || "").toUpperCase();
  if (r === "WIN") return "win";
  if (r === "LOSS") return "loss";
  if (r === "PUSH") return "push";
  if (r === "HALF_WIN") return "halfWin";
  if (r === "HALF_LOSS") return "halfLoss";
  return null;
}
__name(ledgerResultBucket, "ledgerResultBucket");
__name2(ledgerResultBucket, "ledgerResultBucket");
__name22(ledgerResultBucket, "ledgerResultBucket");
__name222(ledgerResultBucket, "ledgerResultBucket");
function applyLedgerMeta(meta, row, sign) {
  if (!row || !row.id) return;
  meta.ledgerTotal = Math.max(0, Number(meta.ledgerTotal || 0) + sign);
  const st = String(row.status || "").toUpperCase();
  if (st === "PENDING") meta.pending = Math.max(0, Number(meta.pending || 0) + sign);
  else if (st === "UNRESOLVED") meta.unresolved = Math.max(0, Number(meta.unresolved || 0) + sign);
  else if (st === "SETTLED") {
    meta.settledTotal = Math.max(0, Number(meta.settledTotal || 0) + sign);
    const b = ledgerResultBucket(row);
    if (b) meta[b] = Math.max(0, Number(meta[b] || 0) + sign);
    const mk = String(row.market || "unknown");
    meta.byMarket[mk] = Math.max(0, Number(meta.byMarket[mk] || 0) + sign);
    if (meta.byMarket[mk] === 0) delete meta.byMarket[mk];
  }
}
__name(applyLedgerMeta, "applyLedgerMeta");
__name2(applyLedgerMeta, "applyLedgerMeta");
__name22(applyLedgerMeta, "applyLedgerMeta");
__name222(applyLedgerMeta, "applyLedgerMeta");
function archivalSignal(sig) {
  const keys = ["id", "fixtureId", "league", "home", "away", "market", "marketLabel", "providerMarket", "period", "selection", "line", "selectionLine", "providerLine", "providerLineSide", "odds", "bookmaker", "bookmakerSlug", "priceStage", "priceSource", "priceReference", "referenceProviderLine", "refereeBookCount", "refereeOfferCount", "refereeConsensusBooks", "refereeConsensusSlugs", "openingPrice", "closingPrice", "inplayPrice", "createdAt", "entryMinute", "minute", "entryScore", "scoreAt", "entryCorners", "entryCards", "entryStats", "statisticsAtEntry", "bookmakerHistory", "evidence", "rolling", "status", "result", "previousResult", "finalScore", "finalCorners", "finalCards", "settlementBasis", "settlementRevision", "settlementSource", "settlementError", "settledAt", "reconciledAt", "lineGap", "mirrorMinute", "mirrorScore", "mirrorCorners", "mirrorCards", "mirrorStatus", "mirrorUpdatedAt"];
  const row = {};
  for (const k of keys) if (sig?.[k] !== void 0) row[k] = clone2(sig[k]);
  row.statisticsLedgerVersion = STAT_LEDGER_VERSION;
  return row;
}
__name(archivalSignal, "archivalSignal");
__name2(archivalSignal, "archivalSignal");
__name22(archivalSignal, "archivalSignal");
__name222(archivalSignal, "archivalSignal");
function mirrorInto(row, fixture, at) {
  if (!row) return row;
  if (fixture) {
    const minute = num3(fixture?.minute);
    if (minute !== null) row.mirrorMinute = minute;
    if (fixture?.goals != null) row.mirrorScore = clone2(fixture.goals);
    if (fixture?.corners != null) row.mirrorCorners = clone2(fixture.corners);
    if (fixture?.cards != null) row.mirrorCards = clone2(fixture.cards);
    row.mirrorStatus = fixture?.boardState ?? fixture?.status ?? fixture?.statusCode ?? row.mirrorStatus ?? null;
    row.mirrorUpdatedAt = at;
  } else if (String(row.status || "").toUpperCase() === "SETTLED") {
    row.mirrorMinute = row.mirrorMinute ?? row.minute ?? row.entryMinute ?? null;
    row.mirrorScore = clone2(row.finalScore ?? row.mirrorScore ?? row.scoreAt ?? row.entryScore);
    row.mirrorCorners = clone2(row.finalCorners ?? row.mirrorCorners ?? row.entryCorners);
    row.mirrorCards = clone2(row.finalCards ?? row.mirrorCards ?? row.entryCards);
    row.mirrorStatus = "finished";
    row.mirrorUpdatedAt = row.settledAt ?? row.mirrorUpdatedAt ?? at;
  }
  return row;
}
__name(mirrorInto, "mirrorInto");
__name2(mirrorInto, "mirrorInto");
__name22(mirrorInto, "mirrorInto");
__name222(mirrorInto, "mirrorInto");
function ledgerMarker(row) {
  return JSON.stringify([row?.status, row?.result, row?.previousResult, row?.settledAt, row?.reconciledAt, row?.mirrorMinute, row?.mirrorScore, row?.mirrorCorners, row?.mirrorCards, row?.mirrorStatus, row?.settlementRevision, row?.settlementSource]);
}
__name(ledgerMarker, "ledgerMarker");
__name2(ledgerMarker, "ledgerMarker");
__name22(ledgerMarker, "ledgerMarker");
__name222(ledgerMarker, "ledgerMarker");
var Nomad343Engine2 = class extends Nomad343Engine {
async __b46LedgerWrite(operation){const prior=this.__b46LedgerWriteTail||Promise.resolve();const work=prior.catch(()=>{}).then(operation);this.__b46LedgerWriteTail=work.catch(()=>{});return work}
async __b46FilterArchived(rows){const list=Array.isArray(rows)?rows:[],id=B46_LEDGER_REPAIR_PLAN.duplicateId;if(!list.some(r=>String(r?.id)===id))return list;const alias=await this.ctx.storage.get('b46:ledger:duplicate-alias:v1:'+id);if(!alias?.active)return list;return list.filter(row=>{if(String(row?.id)!==id)return true;b46LedgerCheck(b46LedgerObservation(archivalSignal(row))===alias.observation,'ARCHIVED_ID_IDENTITY_CONFLICT');return false})}
async __b46NamedRepair(){return this.__b46LedgerWrite(async()=>{
 const p=B46_LEDGER_REPAIR_PLAN,journalKey='b46:ledger:repair:motagua:203745645:20261102:v1',aliasKey='b46:ledger:duplicate-alias:v1:'+p.duplicateId;
 if(p.mode==='restore')return this.__b46RestoreNamedRepair(journalKey,aliasKey);
 const prior=await this.ctx.storage.get(journalKey);if(prior)return{state:prior.state,operationId:prior.operationId};
 if(Date.now()>p.expiresAt)return{state:'EXPIRED_NO_CHANGE',operationId:p.operationId};
 try{return await this.ctx.storage.transaction(async txn=>{
  const existing=await txn.get(journalKey);if(existing)return{state:existing.state,operationId:existing.operationId};
  const canonicalKey=ledgerKey({id:p.canonicalId,createdAt:p.canonicalCreatedAt}),duplicateKey=ledgerKey({id:p.duplicateId,createdAt:p.duplicateCreatedAt});
  b46LedgerCheck(!journalKey.startsWith(STAT_LEDGER_PREFIX)&&!aliasKey.startsWith(STAT_LEDGER_PREFIX),'ARCHIVE_PREFIX');
  const canonical=await txn.get(canonicalKey),duplicate=await txn.get(duplicateKey),meta=normalizeLedgerMeta(await txn.get(STAT_LEDGER_META_KEY));
  b46LedgerCheck(canonical?.id===p.canonicalId&&duplicate?.id===p.duplicateId,'RECORD_ID');
  b46LedgerCheck(canonical.status==='SETTLED'&&canonical.result==='PUSH'&&canonical.settledAt===p.settledAt,'CANONICAL_SETTLEMENT');
  b46LedgerCheck(duplicate.status==='PENDING'&&(!duplicate.result||duplicate.result==='PENDING'),'DUPLICATE_STATUS');
  b46LedgerCheck(Number(canonical.createdAt)===p.canonicalCreatedAt&&Number(duplicate.createdAt)===p.duplicateCreatedAt&&Math.abs(canonical.createdAt-duplicate.createdAt)<=3000,'TIMESTAMPS');
  const observation=b46LedgerObservation(duplicate);b46LedgerCheck(observation===p.observation&&b46LedgerObservation(canonical)===observation,'OBSERVATION');
  b46LedgerCheck(meta.pending>=1&&meta.ledgerTotal>=2,'COUNTERS');
  const canonicalHash=await b46LedgerHash(canonical),duplicateHash=await b46LedgerHash(duplicate),metaBefore=structuredClone(meta),at=Date.now();
  applyLedgerMeta(meta,duplicate,-1);meta.updatedAt=at;
  b46LedgerCheck(meta.ledgerTotal===metaBefore.ledgerTotal-1&&meta.pending===metaBefore.pending-1,'COUNTER_DELTA');
  for(const key of['settledTotal','win','loss','push','halfWin','halfLoss','unresolved','byMarket'])b46LedgerCheck(b46LedgerString(meta[key])===b46LedgerString(metaBefore[key]),'PROTECTED_COUNTER_'+key);
  const journal={operationId:p.operationId,state:'APPLIED',archivedAt:at,reason:'EXACT_DUPLICATE_OBSERVATION',canonicalId:p.canonicalId,canonicalKey,canonicalHash,duplicateId:p.duplicateId,duplicateKey,duplicateHash,originalRow:structuredClone(duplicate),metaBefore,metaAfter:structuredClone(meta)};
  await txn.put(journalKey,journal);await txn.put(aliasKey,{active:true,operationId:p.operationId,canonicalId:p.canonicalId,observation});await txn.put(STAT_LEDGER_META_KEY,meta);
  b46LedgerCheck(await txn.delete(duplicateKey),'ARCHIVE_REMOVE_ACTIVE_KEY');
  b46LedgerCheck(await b46LedgerHash(await txn.get(canonicalKey))===canonicalHash,'CANONICAL_CHANGED');
  b46LedgerCheck(await b46LedgerHash((await txn.get(journalKey)).originalRow)===duplicateHash,'BACKUP_CHANGED');
  return{state:'APPLIED',operationId:p.operationId,canonicalId:p.canonicalId,duplicateId:p.duplicateId};
 })}catch(error){return{state:'PRECONDITION_FAILED_NO_CHANGE',operationId:p.operationId,error:String(error?.message||error)}}
})}
async __b46RestoreNamedRepair(journalKey,aliasKey){return this.ctx.storage.transaction(async txn=>{
 const journal=await txn.get(journalKey);if(!journal||journal.state==='RESTORED')return{state:journal?.state||'NOT_APPLIED'};
 b46LedgerCheck(journal.state==='APPLIED','RESTORE_STATE');
 const canonical=await txn.get(journal.canonicalKey);b46LedgerCheck(await b46LedgerHash(canonical)===journal.canonicalHash,'RESTORE_CANONICAL_CHANGED');
 b46LedgerCheck(!await txn.get(journal.duplicateKey),'RESTORE_ACTIVE_KEY_EXISTS');b46LedgerCheck(await b46LedgerHash(journal.originalRow)===journal.duplicateHash,'RESTORE_BACKUP_HASH');
 const meta=normalizeLedgerMeta(await txn.get(STAT_LEDGER_META_KEY));applyLedgerMeta(meta,journal.originalRow,1);meta.updatedAt=Date.now();
 await txn.put(journal.duplicateKey,journal.originalRow);await txn.put(STAT_LEDGER_META_KEY,meta);await txn.delete(aliasKey);await txn.put(journalKey,{...journal,state:'RESTORED',restoredAt:Date.now()});return{state:'RESTORED',operationId:journal.operationId}
})}
async __b46RepairStatus(){const j=await this.ctx.storage.get('b46:ledger:repair:motagua:203745645:20261102:v1');return j?{operationId:j.operationId,state:j.state,canonicalId:j.canonicalId,duplicateId:j.duplicateId,canonicalHash:j.canonicalHash,duplicateHash:j.duplicateHash,archivedAt:j.archivedAt,restoredAt:j.restoredAt,archiveRetained:!!j.originalRow,metaBefore:j.metaBefore,metaAfter:j.metaAfter}:{operationId:B46_LEDGER_REPAIR_PLAN.operationId,state:Date.now()>B46_LEDGER_REPAIR_PLAN.expiresAt?'EXPIRED_NO_CHANGE':'WAITING_FOR_EXISTING_SCAN'}}


  static {
    __name(this, "Nomad343Engine2");
  }
  static {
    __name2(this, "Nomad343Engine2");
  }
  static {
    __name22(this, "Nomad343Engine2");
  }
  static {
    __name222(this, "Nomad343Engine");
  }
  async upsertLedgerRows(sourceRows,fixtureMap=null){return this.__b46LedgerWrite(async()=>this.__b46UpsertLedgerUnlocked(await this.__b46FilterArchived(sourceRows),fixtureMap))}
async __b46UpsertLedgerUnlocked(sourceRows, fixtureMap = null) {
    const rows = (Array.isArray(sourceRows) ? sourceRows : []).filter((x) => x?.id);
    let meta = normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
    let inserted = 0, updated = 0, unchanged = 0;
    const at = now2();
    for (let i = 0; i < rows.length; i += 64) {
      const chunk = rows.slice(i, i + 64).map((sig) => {
        const row = archivalSignal(sig);
        const f = fixtureMap?.get?.(String(sig.fixtureId));
        mirrorInto(row, f, at);
        row._ledgerMarker = ledgerMarker(row);
        return [ledgerKey(row), row];
      });
      const keys = chunk.map(([k]) => k);
      const existing = keys.length ? await this.ctx.storage.get(keys) : /* @__PURE__ */ new Map();
      const writes = {};
      for (const [key, row] of chunk) {
        const old = existing?.get?.(key);
        if (!old) {
          applyLedgerMeta(meta, row, 1);
          writes[key] = row;
          inserted++;
          continue;
        }
        if (String(old?._ledgerMarker || "") === String(row._ledgerMarker || "")) {
          unchanged++;
          continue;
        }
        applyLedgerMeta(meta, old, -1);
        applyLedgerMeta(meta, row, 1);
        writes[key] = row;
        updated++;
      }
      if (Object.keys(writes).length) await this.ctx.storage.put(writes);
    }
    meta.version = STAT_LEDGER_VERSION;
    meta.updatedAt = at;
    await this.ctx.storage.put(STAT_LEDGER_META_KEY, meta);
    return { ok: true, version: STAT_LEDGER_VERSION, inserted, updated, unchanged, meta };
  }
  async syncStatisticsLedger(finalFixture = null) {
    const signals = await readWorkingSignals(this.ctx);
    const board = await this.ctx.storage.get("board") || { fixtures: [] };
    const fixtureMap = new Map((board.fixtures || []).map((f) => [String(f?.fixtureId ?? f?.id ?? ""), f]));
    if (finalFixture?.fixtureId) fixtureMap.set(String(finalFixture.fixtureId), finalFixture);
    const at = now2();
    let workingChanged = false;
    for (const sig of signals) {
      if (!sig?.id) continue;
      const f = fixtureMap.get(String(sig.fixtureId));
      if (!f) continue;
      const minute = num3(f?.minute);
      if (minute !== null && sig.mirrorMinute !== minute) {
        sig.mirrorMinute = minute;
        workingChanged = true;
      }
      const score = clone2(f?.goals);
      if (JSON.stringify(sig.mirrorScore) !== JSON.stringify(score)) {
        sig.mirrorScore = score;
        workingChanged = true;
      }
      const corners = clone2(f?.corners);
      if (JSON.stringify(sig.mirrorCorners) !== JSON.stringify(corners)) {
        sig.mirrorCorners = corners;
        workingChanged = true;
      }
      const cards = clone2(f?.cards);
      if (JSON.stringify(sig.mirrorCards) !== JSON.stringify(cards)) {
        sig.mirrorCards = cards;
        workingChanged = true;
      }
      const status = f?.boardState ?? f?.status ?? f?.statusCode ?? null;
      if (sig.mirrorStatus !== status) {
        sig.mirrorStatus = status;
        workingChanged = true;
      }
      sig.mirrorUpdatedAt = at;
    }
    if (workingChanged) await writeWorkingSignals(this.ctx, signals);
    return this.upsertLedgerRows(signals, fixtureMap);
  }
  async autoReconcileMissingFinals() {
    const at = now2(), signals = await readWorkingSignals(this.ctx), board = await this.ctx.storage.get("board") || { fixtures: [] }, boardIds = new Set((board.fixtures || []).map((f) => String(f?.fixtureId ?? f?.id ?? "")).filter(Boolean)), groups = /* @__PURE__ */ new Map();
    for (const sig of signals) {
      if ((sig?.status !== "PENDING" && !(isVerifiedCornerMarket(sig?.market) && sig?.status === "UNRESOLVED") && !phase2IsEarly(sig)) || !sig?.fixtureId) continue;
      const id = String(sig.fixtureId);
      if (boardIds.has(id) && !(isVerifiedCornerMarket(sig?.market) && sig?.status === "UNRESOLVED")) continue;
      const created = Number(sig.createdAt || 0);
      if (created > 0 && at - created < FINAL_RECHECK_MIN_SIGNAL_AGE_MS) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(sig);
    }
    const rawState = await this.ctx.storage.get(FINAL_RECHECK_STATE_KEY), state = rawState && typeof rawState === "object" && !Array.isArray(rawState) ? { ...rawState } : {}, candidates = [...groups.entries()].filter(([id]) => at - Number(state[id]?.checkedAt || 0) >= FINAL_RECHECK_INTERVAL_MS).sort((a, b) => Math.min(...a[1].map((x) => Number(x?.createdAt || 0))) - Math.min(...b[1].map((x) => Number(x?.createdAt || 0)))).slice(0, FINAL_RECHECK_MAX_PER_SCAN);
    let checked = 0, finishedFixtures = 0, settledSignals = 0, incompleteFinalData = 0, errors = 0;
    for (const [fixtureId] of candidates) {
      checked++;
      state[fixtureId] = { ...state[fixtureId] || {}, checkedAt: at, state: "CHECKING" };
      try {
        if (!this.env.FIVEDOLLAR_API_KEY) throw new Error("FIVEDOLLAR_API_KEY_MISSING");
        const ac = new AbortController(), timer = setTimeout(() => ac.abort(), FINAL_RECHECK_TIMEOUT_MS);
        let response;
        try {
          response = await fetch(`https://api.5dollarfootballapi.com/v1/fixtures/${encodeURIComponent(fixtureId)}?include=events,stats`, { cache: "no-store", signal: ac.signal, headers: { accept: "application/json", authorization: `Bearer ${this.env.FIVEDOLLAR_API_KEY}` } });
        } finally {
          clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`FINAL_HTTP_${response.status}`);
        const payload = await response.json(), fixture = normalizeFinalFixture(payload);
        if (!fixture || String(fixture.fixtureId) !== fixtureId) throw new Error("FINAL_FIXTURE_MISMATCH");
        if (!isFinished2(fixture)) {
          state[fixtureId] = { checkedAt: at, state: "NOT_FINAL", status: fixture.status ?? fixture.statusCode ?? null };
          continue;
        }
        finishedFixtures++;
        let fixtureSettled = 0, fixtureIncomplete = 0;
        for (const sig of signals) {
          if ((sig?.status !== "PENDING" && !(isVerifiedCornerMarket(sig?.market) && sig?.status === "UNRESOLVED") && !phase2IsEarly(sig)) || String(sig?.fixtureId) !== fixtureId || !periodComplete(sig, fixture)) continue;
          const result = settleMarketSignal(sig, fixture);
          if (!result) {
            fixtureIncomplete++;
            incompleteFinalData++;
            continue;
          }
          if (phase2IsEarly(sig) && result !== sig.result) { sig.previousResult = sig.result; sig.reconciledAt = at; }
          sig.status = "SETTLED";
          sig.result = result;
          sig.finalScore = clone2(fixture.goals);
          sig.finalCorners = clone2(fixture.corners);
          sig.finalCards = clone2(fixture.cards);
          sig.settledAt = at;
          sig.settlementError = null;
          sig.settlementSource = "DIRECT_FINAL_FALLBACK";
          sig.settlementRevision = SETTLEMENT_REVISION;
          sig.mirrorMinute = num3(fixture.minute) ?? sig.mirrorMinute ?? sig.minute ?? sig.entryMinute ?? null;
          sig.mirrorScore = clone2(fixture.goals);
          sig.mirrorCorners = clone2(fixture.corners);
          sig.mirrorCards = clone2(fixture.cards);
          sig.mirrorStatus = "finished";
          sig.mirrorUpdatedAt = at;
          fixtureSettled++;
          settledSignals++;
        }
        state[fixtureId] = { checkedAt: at, state: fixtureIncomplete > 0 ? "FINAL_PARTIAL" : "FINAL_SETTLED", settled: fixtureSettled, incomplete: fixtureIncomplete, status: fixture.status ?? fixture.statusCode ?? "finished" };
      } catch (e) {
        errors++;
        state[fixtureId] = { checkedAt: at, state: "ERROR", error: String(e?.message || e).slice(0, 160) };
      }
    }
    if (settledSignals > 0) {
      const nonSettled = signals.filter((x) => x?.status !== "SETTLED"), nonSettledIds = new Set(nonSettled.map((x) => String(x?.id || ""))), recentSettled = signals.filter((x) => x?.status === "SETTLED" && !nonSettledIds.has(String(x?.id || ""))).slice(-1600);
      await writeWorkingSignals(this.ctx, [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0)));
    }
    const stillPendingIds = new Set(signals.filter((x) => x?.status === "PENDING" || phase2IsEarly(x)).map((x) => String(x?.fixtureId || ""))), compact = {};
    for (const [id, value] of Object.entries(state).sort((a, b) => Number(b[1]?.checkedAt || 0) - Number(a[1]?.checkedAt || 0))) {
      if (stillPendingIds.has(id) || Object.keys(compact).length < 64) compact[id] = value;
      if (Object.keys(compact).length >= 256) break;
    }
    await this.ctx.storage.put(FINAL_RECHECK_STATE_KEY, compact);
    return { ok: true, version: FINAL_RECONCILE_VERSION, checked, finishedFixtures, settledSignals, incompleteFinalData, errors, candidatesRemaining: Math.max(0, groups.size - candidates.length) };
  }
  async compactWorkingSignalsAfterLedger() {
    const signals = await readWorkingSignals(this.ctx), nonSettled = signals.filter((x) => x?.status !== "SETTLED" || phase2IsEarly(x)), ids = new Set(nonSettled.map((x) => String(x?.id || ""))), recentSettled = signals.filter((x) => x?.status === "SETTLED" && !phase2IsEarly(x) && !ids.has(String(x?.id || ""))).slice(-WORK_SETTLED_TAIL), compact = [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (compact.length !== signals.length) await writeWorkingSignals(this.ctx, compact);
    return { workingTotal: compact.length, pending: nonSettled.filter((x) => x?.status === "PENDING").length, settledTail: recentSettled.length };
  }
  async latestLedgerRows(cursor = null) {
    const found = await this.ctx.storage.list({
      prefix: STAT_LEDGER_PREFIX,
      reverse: true,
      limit: STAT_LEDGER_PAGE_SIZE + 1,
      ...cursor ? { end: cursor } : {}
    });
    const entries = [...found.entries()];
    const more = entries.length > STAT_LEDGER_PAGE_SIZE;
    const included = more ? entries.slice(0, STAT_LEDGER_PAGE_SIZE) : entries;
    return {
      rows: included.map(([, value]) => value),
      nextCursor: more ? included[included.length - 1][0] : null
    };
  }
  async statisticsLedgerResponse(cursor = null, paged = false) {
    const meta = normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
    let page = await this.latestLedgerRows(cursor);
    const raw = page.rows;
    if (!paged) while (page.nextCursor) {
      page = await this.latestLedgerRows(page.nextCursor);
      raw.push(...page.rows);
    }
    const board = await this.ctx.storage.get("board").catch(() => null);
    const fetchedAt = Number(board?.hubFetchedAt);
    const ageMs = Date.now() - fetchedAt;
    const fresh = board?.ok === true && board?.stale === false && Number.isFinite(fetchedAt) && fetchedAt > 0 && ageMs >= 0 && ageMs <= 12e4;
    const liveFixtureIds = /* @__PURE__ */ new Set();
    if (fresh && Array.isArray(board.fixtures)) {
      for (const fixture of board.fixtures) {
        const status = `${fixture?.status ?? ""} ${fixture?.statusCode ?? ""}`.toLowerCase();
        const unavailable = /finished|full[_ -]?time|\bft\b|ended|\bfull\b|cancel|postpon|suspend|abandon|scheduled|not[_ -]?started|unknown/.test(status);
        if (fixture?.boardState === "live" && !unavailable && fixture.fixtureId != null) {
          liveFixtureIds.add(String(fixture.fixtureId));
        }
      }
    }
    const rows = raw.map((src) => {
      const r = clone2(src);
      delete r._ledgerMarker;
      if (String(r.status || "").toUpperCase() === "PENDING") {
        r.signalEntryMinute = r.entryMinute ?? r.minute ?? null;
        r.entryMinute = r.mirrorMinute ?? r.entryMinute ?? r.minute ?? null;
        r.finalScore = clone2(r.mirrorScore ?? r.entryScore ?? r.scoreAt);
        const displayStatus = liveFixtureIds.has(String(r.fixtureId)) ? "LIVE" : "PENDING";
        r.result = displayStatus;
        r.displayStatus = displayStatus;
      }
      return r;
    });
    const denom = meta.win + meta.loss + meta.halfWin + meta.halfLoss;
    return { ok: true, version: VERSION, settlementRevision: SETTLEMENT_REVISION, statisticsLedgerVersion: STAT_LEDGER_VERSION, statisticsSource: "LEDGER_V2_ONLY", workingStoreVersion: WORK_STORE_VERSION, finalReconcileVersion: FINAL_RECONCILE_VERSION, retention: "LONG_TERM_NO_APPLICATION_EXPIRY", markets: MARKET_RULES, total: meta.settledTotal, ledgerTotal: meta.ledgerTotal, pending: meta.pending, unresolved: meta.unresolved, win: meta.win, loss: meta.loss, push: meta.push, halfWin: meta.halfWin, halfLoss: meta.halfLoss, winRate: denom ? Math.round((meta.win + 0.5 * meta.halfWin) / denom * 1e3) / 10 : null, byMarket: meta.byMarket, rows, returned: rows.length, nextCursor: paged ? page.nextCursor : null, hasMore: paged && !!page.nextCursor, ledgerUpdatedAt: meta.updatedAt, statisticsPagination: "CURSOR_NO_TOTAL_CAP_V1" };
  }
  async scan(){if(this.__b46UnifiedScan)return this.__b46UnifiedScan;const work=Promise.resolve().then(async()=>{const result=await this.__b46ScanOriginal();if(result?.ok)this.__b46RepairLast=await this.__b46NamedRepair();return result});this.__b46UnifiedScan=work;try{return await work}finally{if(this.__b46UnifiedScan===work)this.__b46UnifiedScan=null}}
async __b46ScanOriginal() {
    const meta = await super.scan();
    if (meta?.ok) {
      const finalFlow = await this.autoReconcileMissingFinals();
      const ledger = await this.syncStatisticsLedger();
      const workingStore = await this.compactWorkingSignalsAfterLedger();
      return { ...meta, statisticsLedgerVersion: STAT_LEDGER_VERSION, statisticsSource: "LEDGER_V2_ONLY", workingStoreVersion: WORK_STORE_VERSION, workingStore, finalReconcileVersion: FINAL_RECONCILE_VERSION, finalReconcile: finalFlow, ledgerInserted: ledger.inserted, ledgerUpdated: ledger.updated, ledgerTotal: ledger.meta.ledgerTotal, settledTotal: ledger.meta.settledTotal };
    }
    return meta;
  }
  async reconcileExternalFinal(request) {
    if (!secureTokenOk(request, this.env)) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const fixture = normalizeFinalFixture(body?.fixture ?? body);
    if (!fixture) return Response.json({ ok: false, error: "INVALID_FIXTURE_PAYLOAD" }, { status: 400 });
    if (!isFinished2(fixture) && !isHalfComplete2(fixture)) return Response.json({ ok: true, version: BRIDGE_VERSION, fixtureId: fixture.fixtureId, state: "NOT_FINAL", settled: 0 });
    const signals = await readWorkingSignals(this.ctx);
    const changed = [];
    for (const sig of signals) {
      if ((sig?.status !== "PENDING" && !phase2IsEarly(sig)) || String(sig?.fixtureId) !== fixture.fixtureId || !periodComplete(sig, fixture)) continue;
      const result = settleMarketSignal(sig, fixture);
      if (!result) continue;
      if (phase2IsEarly(sig) && sig.result !== result) { sig.previousResult = sig.result; sig.reconciledAt = now2(); }
      sig.status = "SETTLED";
      sig.result = result;
      sig.finalScore = clone2(fixture.goals);
      sig.finalCorners = clone2(fixture.corners);
      sig.finalCards = clone2(fixture.cards);
      sig.settledAt = now2();
      sig.settlementError = null;
      sig.settlementSource = "EXTERNAL_FINAL_BRIDGE";
      sig.mirrorMinute = num3(fixture.minute) ?? sig.mirrorMinute ?? sig.minute ?? sig.entryMinute ?? null;
      sig.mirrorScore = clone2(fixture.goals);
      sig.mirrorCorners = clone2(fixture.corners);
      sig.mirrorCards = clone2(fixture.cards);
      sig.mirrorStatus = "finished";
      sig.mirrorUpdatedAt = sig.settledAt;
      changed.push({ id: sig.id, market: sig.market, selection: sig.selection, line: sig.line, result: sig.result, finalScore: sig.finalScore, finalCorners: sig.finalCorners });
    }
    if (changed.length) {
      const nonSettled = signals.filter((x) => x?.status !== "SETTLED" || phase2IsEarly(x));
      const ids = new Set(nonSettled.map((x) => String(x?.id || "")));
      const recentSettled = signals.filter((x) => x?.status === "SETTLED" && !phase2IsEarly(x) && !ids.has(String(x?.id || ""))).slice(-MAX_SIGNALS2);
      await writeWorkingSignals(this.ctx, [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0)));
    }
    const ledger = await this.syncStatisticsLedger(fixture);
    return Response.json({ ok: true, version: BRIDGE_VERSION, statisticsLedgerVersion: STAT_LEDGER_VERSION, fixtureId: fixture.fixtureId, finished: isFinished2(fixture), settled: changed.length, ledgerInserted: ledger.inserted, ledgerUpdated: ledger.updated, rows: changed });
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === "/reconcile-final" && request.method === "POST") return this.reconcileExternalFinal(request);
    if (u.pathname === "/bridge-health" && request.method === "GET") return Response.json({ ok: true, version: BRIDGE_VERSION, statisticsLedgerVersion: STAT_LEDGER_VERSION, statisticsSource: "LEDGER_V2_ONLY", workingStoreVersion: WORK_STORE_VERSION, finalReconcileVersion: FINAL_RECONCILE_VERSION });
    if (u.pathname === "/ledger-import" && request.method === "POST") {
      if (!secureTokenOk(request, this.env)) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
      const body = await request.json().catch(() => null), rows = Array.isArray(body?.rows) ? body.rows : [];
      if (!rows.length || rows.length > 1e4) return Response.json({ ok: false, error: "INVALID_IMPORT_ROWS" }, { status: 400 });
      const r = await this.upsertLedgerRows(rows);
      return Response.json({ ok: true, version: STAT_LEDGER_VERSION, inserted: r.inserted, updated: r.updated, unchanged: r.unchanged, ledgerTotal: r.meta.ledgerTotal, settledTotal: r.meta.settledTotal, pending: r.meta.pending });
    }
    if (u.pathname === "/ledger-sync" && request.method === "POST") {
      if (!secureTokenOk(request, this.env)) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
      const r = await this.syncStatisticsLedger();
      return Response.json({ ok: true, version: STAT_LEDGER_VERSION, inserted: r.inserted, updated: r.updated, ledgerTotal: r.meta.ledgerTotal, settledTotal: r.meta.settledTotal, pending: r.meta.pending });
    }
    if (u.pathname === "/ledger-health" && request.method === "GET") {
      const m = normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
      return Response.json({ ok: true, version: STAT_LEDGER_VERSION, retention: "LONG_TERM_NO_APPLICATION_EXPIRY", ...m, duplicateReconciliation: await this.__b46RepairStatus() });
    }
    if (u.pathname === "/statistics" && request.method === "GET") {
      const cursor = u.searchParams.get("cursor");
      if (cursor !== null && (!cursor.startsWith(STAT_LEDGER_PREFIX) || cursor.length > 1024))
        return Response.json({ ok: false, error: "INVALID_STATISTICS_CURSOR" }, { status: 400 });
      if (!cursor) {
        await this.scanIfDue();
        await this.syncStatisticsLedger();
      }
      return Response.json(await this.statisticsLedgerResponse(cursor, u.searchParams.get("paged") === "1" || cursor !== null));
    }
    return super.fetch(request);
  }
};
function stub(env) {
  return env.ENGINE.get(env.ENGINE.idFromName("global"));
}
__name(stub, "stub");
__name2(stub, "stub");
__name22(stub, "stub");
__name222(stub, "stub");
function cors(request, response) {
  const h = new Headers(response.headers);
  h.set("access-control-allow-origin", request.headers.get("origin") || "*");
  h.set("access-control-allow-methods", "GET,PUT,POST,OPTIONS");
  h.set("access-control-allow-headers", "content-type,x-settlement-token");
  h.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers: h });
}
__name(cors, "cors");
__name2(cors, "cors");
__name22(cors, "cors");
__name222(cors, "cors");
var index_bulk_recovery_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
    const u = new URL(request.url), allowed = ["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds", "/referee", "/reconcile-final", "/bridge-health", "/ledger-import", "/ledger-sync", "/ledger-health"];
    if (!allowed.includes(u.pathname)) return cors(request, new Response("Not found", { status: 404 }));
    return cors(request, await stub(env).fetch(new Request(`https://engine.internal${u.pathname}${u.search}`, request)));
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stub(env).fetch("https://engine.internal/scan", { method: "POST" }));
  }
};
export {
  Nomad343Engine2 as Nomad343Engine,
  index_bulk_recovery_default as default
};
//# sourceMappingURL=index-bulk-recovery.js.map
