#!/usr/bin/env python3
"""KING Statistics V3 — isolated Prediction2 ledger starting 2026-09-04.

V3 never trusts legacy page-level FT text. It snapshots official KING picks and
settles them only when Goaloo's direct bf_us.js index reports terminal state -1
with numeric home/away scores for the same goaloo_id. This keeps PENDING records
alive across the 07:00 Thailand selection rollover without importing stale or
misparsed legacy HISTORY values.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import the_king_engine as core
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
FINAL_RESULTS = {"WIN", "LOSS", "PUSH"}


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
    ])


def result_of(rec: dict) -> str:
    result = str(rec.get("result") or "PENDING").upper().strip()
    return result if result in FINAL_RESULTS else "PENDING"


def profit_for(result: str, odds) -> float | None:
    if result == "WIN":
        try:
            return round(STAKE * (float(odds) - 1.0), 2)
        except Exception:
            return None
    if result == "LOSS":
        return -STAKE
    if result == "PUSH":
        return 0.0
    return None


def safe_score(value):
    try:
        score = int(float(value))
    except Exception:
        return None
    return score if 0 <= score <= 30 else None


def project_record(source: dict, existing: dict | None = None) -> dict:
    """Copy pick identity/price fields, but never import legacy settlement text."""
    base = dict(existing or {})
    trusted_final = (
        base.get("settlement_source") == DIRECT_SOURCE
        and result_of(base) in FINAL_RESULTS
        and base.get("ft")
    )
    fields = (
        "id", "goaloo_id", "date", "kickoff", "league", "home", "away", "pick", "side",
        "odds", "odds_source", "confidence", "edge", "source_url", "summary_url", "policy", "engine",
    )
    for field in fields:
        value = source.get(field)
        if value is not None and value != "":
            base[field] = value

    base["record_version"] = VERSION
    base["stats_since"] = START_DATE
    if not trusted_final:
        # Hard reset any legacy/page-parser result such as minute ranges that were
        # previously mistaken for FT scores. V3 will re-settle from the direct index.
        base["result"] = "PENDING"
        base["ft"] = None
        base["profit"] = None
        base.pop("settled_at", None)
        base.pop("settlement_source", None)
        base.pop("goaloo_terminal_state", None)
    return base


def settle_from_direct_index(records: list[dict]) -> tuple[int, dict]:
    """Settle every V3 PENDING record using Goaloo direct terminal state only."""
    rows = v8.load_index()
    status = {
        "source": DIRECT_SOURCE,
        "index_ok": bool(rows),
        "index_rows": len(rows),
        "settled": 0,
        "matched_pending": 0,
        "invalid_scores": 0,
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

        side = str(rec.get("side") or "").lower()
        # Prediction2 is 1X2 home/away only: any draw is a LOSS for either side.
        won = (side == "home" and hg > ag) or (side == "away" and ag > hg)
        rec["ft"] = f"{hg}-{ag}"
        rec["result"] = "WIN" if won else "LOSS"
        rec["profit"] = profit_for(rec["result"], rec.get("odds"))
        rec["settled_at"] = now_iso()
        rec["settlement_source"] = DIRECT_SOURCE
        rec["goaloo_terminal_state"] = -1
        changed += 1

    status["settled"] = changed
    return changed, status


def build_summary(records: list[dict]) -> dict:
    settled = [r for r in records if result_of(r) in FINAL_RESULTS]
    wins = sum(result_of(r) == "WIN" for r in settled)
    losses = sum(result_of(r) == "LOSS" for r in settled)
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
        # Mathematical contract: PUSH and PENDING are excluded from the denominator.
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

    # Import pick identity from both current and historical KING containers so a
    # pick already rotated out of `today` is not lost. Settlement values are ignored.
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
        {"result": "LOSS", "odds": 2.0, "profit": -100.0},
        {"result": "PUSH", "odds": 2.0, "profit": 0.0},
    ])
    assert sample["win_rate"] == 50.0
    assert sample["settled"] == 3
    assert sample["pushes"] == 1
    print("KING Statistics V3 direct-index self-test OK")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["sync", "self-test"], nargs="?", default="sync")
    args = parser.parse_args()
    self_test() if args.command == "self-test" else sync()
