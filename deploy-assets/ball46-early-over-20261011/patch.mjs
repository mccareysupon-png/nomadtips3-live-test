import assert from "node:assert/strict";
import { parse } from "acorn";
import { core } from "./helper-core.mjs";
import { transitions } from "./helper-transitions.mjs";
import { processLive } from "./helper-process.mjs";

function one(source, needle, replace, name) {
  assert.equal(source.split(needle).length, 2, name + ":NOT_UNIQUE");
  return source.replace(needle, replace);
}
function method(source, name, edit) {
  const ast = parse(source, { ecmaVersion:"latest", sourceType:"module" });
  const methods = [];
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "MethodDefinition" && node.key?.name === name) methods.push(node);
    for (const [key,value] of Object.entries(node)) {
      if (key === "start" || key === "end") continue;
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
    }
  };
  walk(ast);
  const selected = methods.filter(m => {
    const body = source.slice(m.start,m.end);
    return name === "scan" ? body.includes("      let reconciled = 0;") && body.includes("realtimePendingNewRows") :
      name === "compactWorkingSignalsAfterLedger" ? body.includes("WORK_SETTLED_TAIL") :
      name === "reconcileExternalFinal" ? body.includes("secureTokenOk") : false;
  });
  assert.equal(selected.length,1,"METHOD_SHAPE_"+name);
  const m = selected[0], before = source.slice(m.start,m.end);
  return source.slice(0,m.start) + edit(before) + source.slice(m.end);
}
function keepProvisional(source) {
  source = one(source,
    'nonSettled = signals.filter((x) => x?.status !== "SETTLED")',
    'nonSettled = signals.filter((x) => x?.status !== "SETTLED" || phase2IsEarly(x))',
    "RETAIN_LIVE_WIN");
  return one(source,
    'recentSettled = signals.filter((x) => x?.status === "SETTLED" && !',
    'recentSettled = signals.filter((x) => x?.status === "SETTLED" && !phase2IsEarly(x) && !',
    "PREVENT_DUPLICATE");
}
export function patch(source) {
  assert(source.includes('var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;'),"PHASE1_AGE_CHANGE_NOT_ACTIVE");
  assert(source.includes("async syncStatisticsLedger("),"V2_LEDGER_MISSING");
  assert(!source.includes('LIVE_OVER_EARLY_V1'),"PHASE2_ALREADY_APPLIED");
  source = one(source,"function reconcileSettled(s) {",
    core + "\n" + transitions + "\n" + processLive + "\nfunction reconcileSettled(s) {",
    "INSERT_EARLY_OVER_ONLY");
  source = method(source,"scan",m=>{
    m = one(m,"      let reconciled = 0;",
      '      const phase2Changed = phase2ApplyLive(signals, fixtureMap, at, hub.stale === true);\n      let reconciled = 0;',
      "LIVE_PASS_BEFORE_FINAL");
    m = keepProvisional(m);
    return one(m,"      await writeWorkingSignals(this.ctx, capped);",
      '      await writeWorkingSignals(this.ctx, capped);\n      if (phase2Changed.length) await this.upsertLedgerRows(phase2Changed, fixtureMap);',
      "WRITE_EARLY_LEDGER");
  });
  source = method(source,"compactWorkingSignalsAfterLedger",keepProvisional);
  source = method(source,"reconcileExternalFinal",m=>{
    m = one(m,
      'sig?.status !== "PENDING" || String(sig?.fixtureId) !== fixture.fixtureId',
      '(sig?.status !== "PENDING" && !phase2IsEarly(sig)) || String(sig?.fixtureId) !== fixture.fixtureId',
      "FINAL_BRIDGE_PROVISIONAL");
    m = one(m,'      sig.status = "SETTLED";\n      sig.result = result;',
      '      if (phase2IsEarly(sig) && sig.result !== result) { sig.previousResult = sig.result; sig.reconciledAt = now2(); }\n      sig.status = "SETTLED";\n      sig.result = result;',
      "FINAL_BRIDGE_RESULT_AUDIT");
    return keepProvisional(m);
  });
  parse(source,{ecmaVersion:"latest",sourceType:"module"});
  return source;
}
