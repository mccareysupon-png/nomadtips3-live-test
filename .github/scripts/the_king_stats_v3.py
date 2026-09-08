#!/usr/bin/env python3
"""KING Statistics V3 — isolated Prediction2 ledger starting 2026-09-04.

The public statistics remain one combined WIN/LOSS record across every supported
Prediction2 market. Market metadata is retained per pick for audit, but the main
scoreboard is intentionally not split by 1X2/AH/O-U.

Settlement trusts only Goaloo's direct bf_us.js terminal state and delegates the
market math to the isolated ADD K Prediction2 engine. Existing legacy 1X2 records
remain compatible.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import add_k_multimarket_engine as addk
import the_king_engine_v8 as v8

ROOT = Path(__file__).resolve().parents[2]
FEED_PATH = ROOT / "the-king-feed.json"
STATE_PATH = ROOT / "the-king-state.json"
STATS_PATH = ROOT / "the-king-stats-v3.json"
ARCHIVE_DIR = ROOT / "the-king-archive"
START_DATE = "2026-09-04"
VERSION = "KING_STATS_V3"
DIRECT_SOURCE = "goaloo-bf_us-direct-index"
STAKE = 100.0
FINAL_RESULTS = {"WIN", "HALF_WIN", "PUSH", "HALF_LOSS", "LOSS"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def backup_sources_once() -> list[str]:
    ARCHIVE_DIR.mkdir(exist_ok=True)
    created = []
    pairs = [
        (FEED_PATH, ARCHIVE_DIR / "the-king-feed-pre-stats-v3-20260904.json"),
        (STATE_PATH, ARCHIVE_DIR / "the-king-state-pre-stats-v3-20260904.json"),
    ]
    for source, target in pairs:
        if source.exists() and not target.exists():
            target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
            created.append(str(target.relative_to(ROOT)))
    return created


def blank_ledger():
    return {
        "record_version": VERSION,
        "stats_since": START_DATE,
        "settlement_contract": DIRECT_SOURCE,
        "stake_model": {"currency": "THB", "stake_per_pick": int(STAKE)},
        "records": [],
        "summary": {
            "settled": 0,
            "pending": 0,
            "wins": 0,
            "losses": 0,
            "pushes": 0,
            "win_rate": None,
            "avg_odds": None,
            "net": 0.0,
            "roi": None,
        },
    }


def canonical_key(rec: dict) -> str:
    rid = str(rec.get("id") or "").strip()
    if rid:
        return f"id:{rid}"
    gid = str(rec.get("goaloo_id") or "").strip()
    date = str(rec.get("date") or "").strip()
    if gid and date:
        return f"goaloo:{date}:{gid}"
    return "|".join([
        date,
        str(rec.get("home") or "").strip().lower(),
        str(rec.get("away") or "").strip().lower(),
        str(rec.get("market") or "1X2").strip().upper(),
    ])


def result_of(rec: dict) -> str:
    result = str(rec.get("result") or "PENDING").upper().strip()
    return result if result in FINAL_RESULTS else "PENDING"


def profit_for(result: str, odds) -> float | None:
    value = addk.profit_for_result(result, odds, STAKE)
    return None if value is None else round(float(value), 2)


def safe_score(value):
    return addk.safe_score(value)


def project_record(source: dict, existing: dict | None = None) -> dict:
    """Copy immutable pick identity/market fields; never trust page-level FT text."""
    base = dict(existing or {})
    trusted_final = (
        base.get("settlement_source") == DIRECT_SOURCE
        and result_of(base) in FINAL_RESULTS
        and base.get("ft")
    )
    fields = (
        "id", "goaloo_id", "date", "kickoff", "league", "home", "away", "pick", "side",
        "market", "selection", "line", "odds", "odds_source", "confidence", "edge",
        "model_probability", "market_fair_probability", "market_edge", "ev", "required_confidence",
        "locked_at", "source_url", "summary_url", "policy", "engine",
    )
    for field in fields:
        value = source.get(field)
        if value is not None and value != "":
            base[field] = value

    # Legacy KING records did not carry an explicit market/selection.
    base.setdefault("market", "1X2")
    if not base.get("selection") and str(base.get("side") or "").lower() in ("home", "away"):
        base["selection"] = str(base.get("side")).upper()

    base["record_version"] = VERSION
    base["stats_since"] = START_DATE
    if not trusted_final:
        base["result"] = "PENDING"
        base["ft"] = None
        base["profit"] = None
        base.pop("settlement_score", None)
        base.pop("settled_at", None)
        base.pop("settlement_source", None)
        base.pop("goaloo_terminal_state", None)
    return base


def settle_from_direct_index(records: list[dict]) -> tuple[int, dict]:
    """Settle every V3 PENDING record from the Goaloo terminal score only."""
    rows = v8.load_index()
    status = {
        "source": DIRECT_SOURCE,
        "index_ok": bool(rows),
        "index_rows": len(rows),
        "settled": 0,
        "matched_pending": 0,
        "invalid_scores": 0,
        "invalid_market_records": 0,
    }
    if not rows:
        return 0, status

    direct = {str(row.get("id") or ""): row for row in rows}
    changed = 0
    for rec in records:
        if result_of(rec) != "PENDING":
            continue
        gid = str(rec.get("goaloo_id") or "").strip()
        row = direct.get(gid)
        if not row:
            continue
        status["matched_pending"] += 1
        if row.get("state") != -1:
            continue
        hg = safe_score(row.get("score_home"))
        ag = safe_score(row.get("score_away"))
        if hg is None or ag is None:
            status["invalid_scores"] += 1
            continue

        settled = addk.settle_record(rec, hg, ag)
        if not settled:
            status["invalid_market_records"] += 1
            continue
        rec["ft"] = f"{hg}-{ag}"
        rec["result"] = settled["result"]
        rec["settlement_score"] = settled["settlement_score"]
        rec["profit"] = profit_for(rec["result"], rec.get("odds"))
        rec["settled_at"] = now_iso()
        rec["settlement_source"] = DIRECT_SOURCE
        rec["goaloo_terminal_state"] = -1
        changed += 1

    status["settled"] = changed
    return changed, status


def build_summary(records: list[dict]) -> dict:
    settled = [r for r in records if result_of(r) in FINAL_RESULTS]
    # HALF_WIN/HALF_LOSS remain visible in history but roll into the single public
    # WIN/LOSS counters. Profit/ROI retain their exact half-stake settlement.
    wins = sum(result_of(r) in {"WIN", "HALF_WIN"} for r in settled)
    losses = sum(result_of(r) in {"LOSS", "HALF_LOSS"} for r in settled)
    pushes = sum(result_of(r) == "PUSH" for r in settled)
    decided = wins + losses

    odds_values = []
    for rec in settled:
        try:
            odds_values.append(float(rec.get("odds")))
        except Exception:
            pass
    net = round(sum(float(r.get("profit") or 0.0) for r in settled), 2)
    return {
        "settled": len(settled),
        "pending": sum(result_of(r) == "PENDING" for r in records),
        "wins": wins,
        "losses": losses,
        "pushes": pushes,
        "win_rate": None if decided == 0 else round(wins / decided * 100.0, 2),
        "avg_odds": None if not odds_values else round(sum(odds_values) / len(odds_values), 3),
        "net": net,
        "roi": None if not settled else round(net / (len(settled) * STAKE) * 100.0, 2),
    }


def sync() -> dict:
    backups = backup_sources_once()
    feed = load(FEED_PATH, {"today": [], "history": []})
    ledger = load(STATS_PATH, blank_ledger())
    before = json.dumps(ledger, sort_keys=True, ensure_ascii=False)

    ledger["record_version"] = VERSION
    ledger["stats_since"] = START_DATE
    ledger["settlement_contract"] = DIRECT_SOURCE
    ledger["stake_model"] = {"currency": "THB", "stake_per_pick": int(STAKE)}
    records = [r for r in (ledger.get("records") or []) if str(r.get("date") or "") >= START_DATE]
    index = {canonical_key(r): i for i, r in enumerate(records)}

    incoming = []
    incoming.extend(feed.get("today") or [])
    incoming.extend(feed.get("history") or [])
    for source in incoming:
        if str(source.get("date") or "") < START_DATE:
            continue
        key = canonical_key(source)
        if key in index:
            records[index[key]] = project_record(source, records[index[key]])
        else:
            index[key] = len(records)
            records.append(project_record(source))

    direct_settled, settlement_status = settle_from_direct_index(records)

    records.sort(key=lambda r: (str(r.get("date") or ""), str(r.get("kickoff") or ""), canonical_key(r)))
    ledger["records"] = records
    ledger["summary"] = build_summary(records)
    ledger["settlement_status"] = settlement_status

    after_without_time = json.dumps(ledger, sort_keys=True, ensure_ascii=False)
    changed = before != after_without_time
    if changed:
        ledger["updated_at"] = now_iso()
        save(STATS_PATH, ledger)
    elif not STATS_PATH.exists():
        save(STATS_PATH, ledger)

    result = {
        "record_version": VERSION,
        "stats_since": START_DATE,
        "records": len(records),
        "summary": ledger["summary"],
        "direct_settled": direct_settled,
        "settlement_status": settlement_status,
        "backups_created": backups,
        "changed": changed,
        "selection_date": feed.get("selection_date"),
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


def self_test() -> None:
    assert profit_for("WIN", 2.0) == 100.0
    assert profit_for("HALF_WIN", 2.0) == 50.0
    assert profit_for("HALF_LOSS", 2.0) == -50.0
    assert profit_for("LOSS", 2.0) == -100.0
    assert safe_score("2") == 2
    assert safe_score("81") is None
    dirty = project_record({"id": "x", "date": START_DATE, "result": "WIN", "ft": "81-90"})
    assert dirty["result"] == "PENDING" and dirty["ft"] is None
    trusted = project_record(
        {"id": "x", "date": START_DATE, "result": "PENDING"},
        {"id": "x", "date": START_DATE, "result": "WIN", "ft": "2-0",
         "profit": 100.0, "settlement_source": DIRECT_SOURCE},
    )
    assert trusted["result"] == "WIN" and trusted["ft"] == "2-0"
    sample = build_summary([
        {"result": "WIN", "odds": 2.0, "profit": 100.0},
        {"result": "HALF_WIN", "odds": 2.0, "profit": 50.0},
        {"result": "HALF_LOSS", "odds": 2.0, "profit": -50.0},
        {"result": "LOSS", "odds": 2.0, "profit": -100.0},
        {"result": "PUSH", "odds": 2.0, "profit": 0.0},
    ])
    assert sample["wins"] == 2 and sample["losses"] == 2
    assert sample["win_rate"] == 50.0
    assert sample["settled"] == 5 and sample["pushes"] == 1
    print("KING Statistics V3 ADD K multi-market self-test OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["sync", "self-test"], nargs="?", default="sync")
    args = parser.parse_args()
    self_test() if args.command == "self-test" else sync()
