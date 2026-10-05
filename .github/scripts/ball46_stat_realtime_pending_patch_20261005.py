from pathlib import Path
import re, sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patcher INPUT OUTPUT')

src, out = Path(sys.argv[1]), Path(sys.argv[2])
s = src.read_text()

required = [
    'signal-ledger-v2-longterm',
    'STAT_LEDGER_PREFIX = "stat:v2:row:"',
    'statisticsLedgerResponse',
    'upsertLedgerRows',
    'syncStatisticsLedger',
    'chunked-working-store-v1',
    'missing-final-direct-v1',
    'statisticsSource: "LEDGER_V2_ONLY"',
    'writeWorkingSignals',
    'reconcileExternalFinal',
]
for marker in required:
    if marker not in s:
        raise SystemExit('CURRENT_PRODUCTION_CONTRACT_MISSING:' + marker)

VERSION = 'realtime-pending-ledger-v1'
if VERSION in s:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s)
    print('PATCH_ALREADY_PRESENT')
    raise SystemExit(0)

# 1) Statistics lifecycle must stay PENDING. LIVE is match mirror metadata only.
# The existing live worker has exactly one synthesized LIVE result/display pair;
# fail closed unless both assignments are uniquely identifiable.
result_live = re.compile(r'r\.result\s*=\s*["\']LIVE["\']\s*;')
display_live = re.compile(r'r\.displayStatus\s*=\s*["\']LIVE["\']\s*;')
if len(result_live.findall(s)) != 1:
    raise SystemExit('LIVE_RESULT_ASSIGNMENT_COUNT:' + str(len(result_live.findall(s))))
if len(display_live.findall(s)) != 1:
    raise SystemExit('LIVE_DISPLAY_ASSIGNMENT_COUNT:' + str(len(display_live.findall(s))))
s = result_live.sub('if(String(r.result||"").toUpperCase()==="LIVE")delete r.result;', s, count=1)
s = display_live.sub('r.displayStatus="PENDING";', s, count=1)

# 2) Persist PENDING rows at the same commit point where working signals are
# stored. The scan-level sync remains intact as reconciliation/fail-safe.
commit_re = re.compile(r'await\s+writeWorkingSignals\(this\.ctx,\s*capped\s*\)\s*;')
commit_hits = list(commit_re.finditer(s))
if len(commit_hits) != 1:
    raise SystemExit('SIGNAL_COMMIT_ANCHOR_COUNT:' + str(len(commit_hits)))
hook = '''await writeWorkingSignals(this.ctx, capped);
      // realtime-pending-ledger-v1: commit all active PENDING signals to Statistics now.
      if (typeof this.upsertLedgerRows === "function") {
        const realtimePendingRows = capped.filter((x) => String(x?.status || "").toUpperCase() === "PENDING");
        if (realtimePendingRows.length) await this.upsertLedgerRows(realtimePendingRows);
      }'''
s = commit_re.sub(hook, s, count=1)

# 3) Runtime marker proves the deployed worker has this contract.
const_re = re.compile(r'var\s+FINAL_RECONCILE_VERSION\s*=\s*["\']missing-final-direct-v1["\']\s*;')
const_hits = list(const_re.finditer(s))
if len(const_hits) != 1:
    raise SystemExit('FINAL_RECONCILE_CONST_COUNT:' + str(len(const_hits)))
matched = const_hits[0].group(0)
s = const_re.sub(matched + '\nvar REALTIME_PENDING_LEDGER_VERSION = "' + VERSION + '";', s, count=1)

source_re = re.compile(r'statisticsSource\s*:\s*["\']LEDGER_V2_ONLY["\']\s*,')
source_hits = len(source_re.findall(s))
if source_hits < 2:
    raise SystemExit('STATISTICS_SOURCE_MARKER_COUNT:' + str(source_hits))
s = source_re.sub(lambda m: m.group(0) + ' realtimePendingLedgerVersion: REALTIME_PENDING_LEDGER_VERSION,', s)

# Guardrails.
if result_live.search(s) or display_live.search(s):
    raise SystemExit('PENDING_LIVE_OVERRIDE_REMAINS')
if s.count('realtime-pending-ledger-v1') < 2:
    raise SystemExit('REALTIME_MARKER_NOT_WIRED')
if 'settleMarketSignal' not in s or 'reconcileExternalFinal' not in s:
    raise SystemExit('SETTLEMENT_CONTRACT_MOVED')

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(s)
print('PATCH_REALTIME_PENDING_OK', len(s))
