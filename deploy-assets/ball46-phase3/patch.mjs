import assert from "node:assert/strict";
import { parse } from "acorn";

function exact(source, oldText, newText, label) {
  assert.equal(source.split(oldText).length, 2, label + "_UNIQUE_MATCH_REQUIRED");
  return source.replace(oldText, newText);
}
export function patchMissingHubEarlyFinal(source) {
  assert(source.includes("var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;"),"PHASE1_NOT_PRESENT");
  assert(source.includes('var FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3;'),"FINAL_RECHECK_INTERVAL_CHANGED");
  assert(source.includes("var FINAL_RECHECK_MAX_PER_SCAN = 3;"),"FINAL_RECHECK_BUDGET_CHANGED");
  assert(source.includes('LIVE_OVER_EARLY_V1') && source.includes("function phase2IsEarly("),"PHASE2_NOT_PRESENT");
  assert(!source.includes("EARLY_FINAL_MISSING_HUB_PHASE3"),"PHASE3_ALREADY_APPLIED");
  const tree = parse(source, { ecmaVersion:"latest", sourceType:"module" });
  const matches = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if(node.type==="MethodDefinition" && node.key?.name==="autoReconcileMissingFinals") matches.push(node);
    for(const [key,v] of Object.entries(node)){
      if(key==="start"||key==="end")continue;
      if(Array.isArray(v))v.forEach(walk); else if(v&&typeof v==="object")walk(v);
    }
  }
  walk(tree);
  assert.equal(matches.length,1,"ACTIVE_FALLBACK_METHOD_NOT_UNIQUE");
  const m = matches[0], original = source.slice(m.start,m.end);
  let changed = original;
  changed = exact(changed,
    'if (sig?.status !== "PENDING" || !sig?.fixtureId) continue;',
    'if ((sig?.status !== "PENDING" && !phase2IsEarly(sig)) || !sig?.fixtureId) continue;',
    "INCLUDE_MISSING_HUB_EARLY");
  changed = exact(changed,
    'if (sig?.status !== "PENDING" || String(sig?.fixtureId) !== fixtureId || !periodComplete(sig, fixture)) continue;',
    'if ((sig?.status !== "PENDING" && !phase2IsEarly(sig)) || String(sig?.fixtureId) !== fixtureId || !periodComplete(sig, fixture)) continue;',
    "FINAL_SETTLEMENT_ALLOWS_EARLY");
  changed = exact(changed,
    '          sig.status = "SETTLED";\n          sig.result = result;',
    '          if (phase2IsEarly(sig) && result !== sig.result) { sig.previousResult = sig.result; sig.reconciledAt = at; }\n          sig.status = "SETTLED";\n          sig.result = result;',
    "RECORD_FINAL_CORRECTION");
  changed = exact(changed,
    'const stillPendingIds = new Set(signals.filter((x) => x?.status === "PENDING").map((x) => String(x?.fixtureId || "")))',
    'const stillPendingIds = new Set(signals.filter((x) => x?.status === "PENDING" || phase2IsEarly(x)).map((x) => String(x?.fixtureId || "")))',
    "PRESERVE_EARLY_RETRY_COOLDOWN");
  assert(changed !== original,"PATCH_NOOP");
  const after = source.slice(0,m.start) + changed + source.slice(m.end);
  parse(after, { ecmaVersion:"latest", sourceType:"module" });
  assert.equal(after.slice(0,m.start),source.slice(0,m.start),"UNEXPECTED_CODE_BEFORE_METHOD");
  assert.equal(after.slice(m.start + changed.length),source.slice(m.end),"UNEXPECTED_CODE_AFTER_METHOD");
  assert(after.includes("EARLY_FINAL_MISSING_HUB_PHASE3")===false,"UNEXPECTED_NEW_MARKER");
  return after;
}
