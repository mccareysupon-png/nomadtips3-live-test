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

# 1) Preserve PENDING as the statistics lifecycle state. LIVE belongs only to
# match mirror metadata; it must never be synthesized as a statistics result.
pending_block = re.compile(
    r'(if\s*\(String\(r\.status\s*\|\|\s*""\)\.toUpperCase\(\)\s*===\s*"PENDING"\)\s*\{.*?)(r\.result\s*=\s*"LIVE"\s*;\s*)(r\.displayStatus\s*=\s*"LIVE"\s*;)(.*?\})',
    re.S,
)
matches = list(pending_block.finditer(s))
if len(matches) != 1:
    raise SystemExit('PENDING_RESPONSE_BLOCK_COUNT:' + str(len(matches)))
s = pending_block.sub(
    lambda m: m.group(1) + 'if(String(r.result||"").toUpperCase()==="LIVE")delete r.result;\n        r.displayStatus="PENDING";' + m.group(4),
    s,
    count=1,
)

# 2) Write current PENDING signals into the durable statistics ledger at the
# exact working-store commit point. The later scan-level sync remains as a
# reconciliation safety net. upsertLedgerRows is idempotent by ledger key.
anchor = 'await writeWorkingSignals(this.ctx, capped);'
if s.count(anchor) != 1:
    raise SystemExit('SIGNAL_COMMIT_ANCHOR_COUNT:' + str(s.count(anchor)))
hook = '''await writeWorkingSignals(this.ctx, capped);
      // realtime-pending-ledger-v1: persist every signalled match to Statistics immediately.
      if (typeof this.upsertLedgerRows === "function") {
        const realtimePendingRows = capped.filter((x) => String(x?.status || "").toUpperCase() === "PENDING");
        if (realtimePendingRows.length) await this.upsertLedgerRows(realtimePendingRows);
      }'''
s = s.replace(anchor, hook, 1)

# 3) Publish an explicit runtime contract marker so post-deploy verification can
# prove the active worker is the realtime-PENDING build.
const_anchor = 'var FINAL_RECONCILE_VERSION = "missing-final-direct-v1";'
if s.count(const_anchor) != 1:
    raise SystemExit('FINAL_RECONCILE_CONST_COUNT:' + str(s.count(const_anchor)))
s = s.replace(const_anchor, const_anchor + '\nvar REALTIME_PENDING_LEDGER_VERSION = "' + VERSION + '";', 1)

source_marker = 'statisticsSource: "LEDGER_V2_ONLY",'
count = s.count(source_marker)
if count < 2:
    raise SystemExit('STATISTICS_SOURCE_MARKER_COUNT:' + str(count))
s = s.replace(source_marker, source_marker + ' realtimePendingLedgerVersion: REALTIME_PENDING_LEDGER_VERSION,')

# Guardrails: no settlement algorithm or card/frontend code is introduced here.
if 'r.result="LIVE"' in s or 'r.displayStatus="LIVE"' in s:
    raise SystemExit('PENDING_LIVE_OVERRIDE_REMAINS')
if s.count('realtime-pending-ledger-v1') < 2:
    raise SystemExit('REALTIME_MARKER_NOT_WIRED')

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(s)
print('PATCH_REALTIME_PENDING_OK', len(s))
