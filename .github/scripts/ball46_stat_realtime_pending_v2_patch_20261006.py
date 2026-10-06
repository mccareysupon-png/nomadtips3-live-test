from pathlib import Path
import re, sys

if len(sys.argv) != 3:
    raise SystemExit("usage: patcher INPUT OUTPUT")

src, out = Path(sys.argv[1]), Path(sys.argv[2])
s = src.read_text()

required = [
    'signal-ledger-v2-longterm',
    'STAT_LEDGER_PREFIX = "stat:v2:row:"',
    'async upsertLedgerRows',
    'async syncStatisticsLedger',
    'async statisticsLedgerResponse',
    'writeWorkingSignals(this.ctx, capped)',
    'signals.push(sig);',
    'status: "PENDING"',
    'reconcileExternalFinal',
    'statisticsSource: "LEDGER_V2_ONLY"',
]
for marker in required:
    if marker not in s:
        raise SystemExit("CURRENT_PRODUCTION_CONTRACT_MISSING:" + marker)

if 'realtime-pending-v2-new-only' in s:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s)
    print("PATCH_ALREADY_PRESENT")
    raise SystemExit(0)

# Guard against the failed v1 approach.
if 'realtime-pending-ledger-v1' in s:
    raise SystemExit("OLD_BAD_PATCH_PRESENT")

# There must be exactly one signal creation push and one working-store commit.
if s.count('signals.push(sig);') != 1:
    raise SystemExit("SIGNAL_PUSH_ANCHOR_COUNT:" + str(s.count('signals.push(sig);')))
if s.count('await writeWorkingSignals(this.ctx, capped);') != 1:
    raise SystemExit("WORKING_COMMIT_ANCHOR_COUNT:" + str(s.count('await writeWorkingSignals(this.ctx, capped);')))

# Declare a scan-local buffer at the beginning of the core scan() method.
# There are multiple scan() methods in the bundled worker; the first is the core
# signal-generation scan, while the later one is the ledger wrapper scan.
scan_anchor = '  async scan() {'
scan_hits = [m.start() for m in re.finditer(re.escape(scan_anchor), s)]
if len(scan_hits) < 2:
    raise SystemExit("SCAN_ANCHOR_COUNT:" + str(len(scan_hits)))
core_scan_pos = scan_hits[0]
push_pos = s.find('signals.push(sig);')
if core_scan_pos < 0 or core_scan_pos > push_pos:
    raise SystemExit("CORE_SCAN_NOT_BEFORE_SIGNAL_CREATION")
insert_at = core_scan_pos + len(scan_anchor)
s = s[:insert_at] + '\n    const realtimePendingNewRows = []; // realtime-pending-v2-new-only' + s[insert_at:]

# Capture only newly-created Signal objects. No historical PENDING scan.
s = s.replace(
    'signals.push(sig);',
    'signals.push(sig);\n                realtimePendingNewRows.push(sig);',
    1
)

# Commit working state first, then persist only rows created by this scan.
old = 'await writeWorkingSignals(this.ctx, capped);'
new = '''await writeWorkingSignals(this.ctx, capped);
      // realtime-pending-v2-new-only: persist only Signals created in this scan.
      if (realtimePendingNewRows.length) {
        await this.upsertLedgerRows(realtimePendingNewRows, fixtureMap);
      }'''
s = s.replace(old, new, 1)

# Hard guardrails: do not alter presentation, settlement, paging, or frontend/API response shape.
for forbidden in [
    'r.displayStatus = "PENDING"',
    'delete r.result',
]:
    if forbidden in s and forbidden not in src.read_text():
        raise SystemExit("FORBIDDEN_PRESENTATION_CHANGE:" + forbidden)

# Prove old all-PENDING pattern was not introduced.
if 'capped.filter((x) => String(x?.status || "").toUpperCase() === "PENDING")' in s:
    raise SystemExit("ALL_PENDING_REWRITE_FORBIDDEN")

if s.count('realtime-pending-v2-new-only') < 2:
    raise SystemExit("V2_MARKER_NOT_WIRED")

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(s)
print("PATCH_REALTIME_PENDING_V2_OK", len(s))
