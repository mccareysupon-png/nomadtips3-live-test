#!/usr/bin/env python3
"""Prediction2 Statistics V3: one combined record across 1X2/AH/O-U."""
from __future__ import annotations

import argparse
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
DISPLAY_RESULTS = FINAL_RESULTS | {"VOID"}
INVALID_AH_ENGINE = "add-k-multimarket-goaloo-v1"
INVALID_AH_REASON = "AH_SIGN_REVERSED_V1"


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def backup_sources_once():
    ARCHIVE_DIR.mkdir(exist_ok=True)
    created = []
    for source, target in (
        (FEED_PATH, ARCHIVE_DIR / "the-king-feed-pre-stats-v3-20260904.json"),
        (STATE_PATH, ARCHIVE_DIR / "the-king-state-pre-stats-v3-20260904.json"),
    ):
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
        "summary": {"settled": 0, "pending": 0, "voids": 0, "wins": 0, "losses": 0, "pushes": 0,
                    "win_rate": None, "avg_odds": None, "net": 0.0, "roi": None},
    }


def canonical_key(rec):
    rid = str(rec.get("id") or "").strip()
    if rid:
        return f"id:{rid}"
    gid, date = str(rec.get("goaloo_id") or "").strip(), str(rec.get("date") or "").strip()
    if gid and date:
        return f"goaloo:{date}:{gid}:{str(rec.get('market') or '1X2').upper()}"
    return "|".join([date, str(rec.get("home") or "").strip().lower(),
                     str(rec.get("away") or "").strip().lower(), str(rec.get("market") or "1X2").upper()])


def result_of(rec):
    result = str(rec.get("result") or "PENDING").upper().strip()
    return result if result in DISPLAY_RESULTS else "PENDING"


def is_invalid_v1_ah(rec):
    return (
        str(rec.get("market") or "").upper() == "AH"
        and str(rec.get("engine") or "") == INVALID_AH_ENGINE
    )


def profit_for(result, odds):
    value = addk.profit_for_result(result, odds, STAKE)
    return None if value is None else round(float(value), 2)


def project_record(source, existing=None):
    base = dict(existing or {})
    invalid_ah = is_invalid_v1_ah(source) or is_invalid_v1_ah(base)
    trusted = (
        not invalid_ah
        and base.get("settlement_source") == DIRECT_SOURCE
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
    base.setdefault("market", "1X2")
    if not base.get("selection") and str(base.get("side") or "").lower() in ("home", "away"):
        base["selection"] = str(base["side"]).upper()
    base["record_version"] = VERSION
    base["stats_since"] = START_DATE

    if invalid_ah:
        original_result = str(source.get("result") or base.get("result") or "PENDING").upper()
        if original_result in FINAL_RESULTS and not base.get("void_original_result"):
            base["void_original_result"] = original_result
        source_ft = source.get("ft")
        if source_ft:
            base["ft"] = source_ft
        base["result"] = "VOID"
        base["profit"] = 0.0
        base["void_reason"] = INVALID_AH_REASON
        base["void_engine"] = INVALID_AH_ENGINE
        base.setdefault("voided_at", now_iso())
        base.pop("settlement_score", None)
        return base

    if not trusted:
        base.update({"result": "PENDING", "ft": None, "profit": None})
        for key in ("settlement_score", "settled_at", "settlement_source", "goaloo_terminal_state",
                    "void_original_result", "void_reason", "void_engine", "voided_at"):
            base.pop(key, None)
    return base


def settle_from_direct_index(records):
    rows = v8.load_index()
    status = {"source": DIRECT_SOURCE, "index_ok": bool(rows), "index_rows": len(rows),
              "settled": 0, "matched_pending": 0, "invalid_scores": 0, "invalid_market_records": 0}
    direct = {str(row.get("id") or ""): row for row in rows}
    changed = 0
    for rec in records:
        if result_of(rec) != "PENDING":
            continue
        row = direct.get(str(rec.get("goaloo_id") or "").strip())
        if not row:
            continue
        status["matched_pending"] += 1
        if row.get("state") != -1:
            continue
        hg, ag = addk.safe_score(row.get("score_home")), addk.safe_score(row.get("score_away"))
        if hg is None or ag is None:
            status["invalid_scores"] += 1
            continue
        settled = addk.settle_record(rec, hg, ag)
        if not settled:
            status["invalid_market_records"] += 1
            continue
        rec.update({
            "ft": f"{hg}-{ag}", "result": settled["result"], "settlement_score": settled["settlement_score"],
            "profit": profit_for(settled["result"], rec.get("odds")), "settled_at": now_iso(),
            "settlement_source": DIRECT_SOURCE, "goaloo_terminal_state": -1,
        })
        changed += 1
    status["settled"] = changed
    return changed, status


def build_summary(records):
    settled = [r for r in records if result_of(r) in FINAL_RESULTS]
    voids = [r for r in records if result_of(r) == "VOID"]
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
        "settled": len(settled), "pending": sum(result_of(r) == "PENDING" for r in records),
        "voids": len(voids), "wins": wins, "losses": losses, "pushes": pushes,
        "win_rate": None if not decided else round(wins / decided * 100.0, 2),
        "avg_odds": None if not odds_values else round(sum(odds_values) / len(odds_values), 3),
        "net": net, "roi": None if not settled else round(net / (len(settled) * STAKE) * 100.0, 2),
    }


def sync():
    backups = backup_sources_once()
    feed = load(FEED_PATH, {"today": [], "history": []})
    ledger = load(STATS_PATH, blank_ledger())
    before = json.dumps(ledger, sort_keys=True, ensure_ascii=False)
    records = [r for r in (ledger.get("records") or []) if str(r.get("date") or "") >= START_DATE]
    index = {canonical_key(r): i for i, r in enumerate(records)}
    for source in list(feed.get("today") or []) + list(feed.get("history") or []):
        if str(source.get("date") or "") < START_DATE:
            continue
        key = canonical_key(source)
        if key in index:
            records[index[key]] = project_record(source, records[index[key]])
        else:
            index[key] = len(records)
            records.append(project_record(source))

    # Re-validate every existing ledger row too. This makes the historical AH v1
    # invalidation durable even when a row is no longer present in today's feed/history.
    records = [project_record(rec, rec) for rec in records]

    direct_settled, settlement_status = settle_from_direct_index(records)
    records.sort(key=lambda r: (str(r.get("date") or ""), str(r.get("kickoff") or ""), canonical_key(r)))
    ledger.update({
        "record_version": VERSION, "stats_since": START_DATE, "settlement_contract": DIRECT_SOURCE,
        "stake_model": {"currency": "THB", "stake_per_pick": int(STAKE)}, "records": records,
        "summary": build_summary(records), "settlement_status": settlement_status,
        "invalidated_contract": {"engine": INVALID_AH_ENGINE, "market": "AH", "result": "VOID",
                                 "reason": INVALID_AH_REASON},
    })
    changed = before != json.dumps(ledger, sort_keys=True, ensure_ascii=False)
    if changed:
        ledger["updated_at"] = now_iso()
        save(STATS_PATH, ledger)
    elif not STATS_PATH.exists():
        save(STATS_PATH, ledger)
    result = {"record_version": VERSION, "stats_since": START_DATE, "records": len(records),
              "summary": ledger["summary"], "direct_settled": direct_settled,
              "settlement_status": settlement_status, "backups_created": backups,
              "changed": changed, "selection_date": feed.get("selection_date")}
    print(json.dumps(result, ensure_ascii=False))
    return result


def self_test():
    assert profit_for("WIN", 2.0) == 100.0
    assert profit_for("HALF_WIN", 2.0) == 50.0
    assert profit_for("HALF_LOSS", 2.0) == -50.0
    assert profit_for("LOSS", 2.0) == -100.0
    dirty = project_record({"id": "x", "date": START_DATE, "result": "WIN", "ft": "81-90"})
    assert dirty["result"] == "PENDING" and dirty["ft"] is None
    invalid = project_record({"id": "ah-x", "date": START_DATE, "market": "AH", "engine": INVALID_AH_ENGINE,
                              "result": "WIN", "ft": "2-1", "odds": 2.0})
    assert invalid["result"] == "VOID" and invalid["profit"] == 0.0
    assert invalid["void_original_result"] == "WIN" and invalid["void_reason"] == INVALID_AH_REASON
    sample = build_summary([
        {"result": "WIN", "odds": 2.0, "profit": 100.0},
        {"result": "HALF_WIN", "odds": 2.0, "profit": 50.0},
        {"result": "HALF_LOSS", "odds": 2.0, "profit": -50.0},
        {"result": "LOSS", "odds": 2.0, "profit": -100.0},
        {"result": "PUSH", "odds": 2.0, "profit": 0.0},
        {"result": "VOID", "odds": 2.0, "profit": 0.0},
    ])
    assert sample["wins"] == 2 and sample["losses"] == 2 and sample["pushes"] == 1 and sample["voids"] == 1
    assert sample["win_rate"] == 50.0 and sample["settled"] == 5
    print("KING Statistics V3 ADD K multi-market self-test OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["sync", "self-test"], nargs="?", default="sync")
    args = parser.parse_args()
    self_test() if args.command == "self-test" else sync()
