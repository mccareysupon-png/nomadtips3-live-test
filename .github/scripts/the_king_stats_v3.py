#!/usr/bin/env python3
"""KING Statistics V3 — isolated Prediction2 ledger starting 2026-09-04.

This ledger is deliberately independent from NOMAD LIVE /statistics and from the
legacy KING history presentation. It snapshots official KING picks, keeps PENDING
records across the 07:00 Thailand day rotation, and settles archived PENDING picks
conservatively from explicit Goaloo FT markers.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import the_king_engine as core

ROOT = Path(__file__).resolve().parents[2]
FEED_PATH = ROOT / "the-king-feed.json"
STATE_PATH = ROOT / "the-king-state.json"
STATS_PATH = ROOT / "the-king-stats-v3.json"
ARCHIVE_DIR = ROOT / "the-king-archive"
START_DATE = "2026-09-04"
VERSION = "KING_STATS_V3"
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
    if result == "DRAW" and str(rec.get("side") or "").lower() in {"home", "away"}:
        return "LOSS"
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


def project_record(source: dict, existing: dict | None = None) -> dict:
    base = dict(existing or {})
    fields = (
        "id", "goaloo_id", "date", "kickoff", "league", "home", "away", "pick", "side",
        "odds", "odds_source", "confidence", "edge", "source_url", "summary_url", "policy", "engine",
    )
    for field in fields:
        value = source.get(field)
        if value is not None and value != "":
            base[field] = value

    incoming = result_of(source)
    previous = result_of(base)
    final = incoming if incoming in FINAL_RESULTS else previous
    if previous in FINAL_RESULTS and incoming == "PENDING":
        final = previous
    base["result"] = final

    ft = source.get("ft")
    if ft:
        base["ft"] = ft
    elif "ft" not in base:
        base["ft"] = None

    base["record_version"] = VERSION
    base["stats_since"] = START_DATE
    base["profit"] = profit_for(final, base.get("odds"))
    if final in FINAL_RESULTS and not base.get("settled_at"):
        base["settled_at"] = now_iso()
    return base


def settle_archived_pending(records: list[dict], current_today_keys: set[str]) -> tuple[int, list[str]]:
    """Settle only PENDING records no longer present in today's feed.

    Current-day settlement remains owned by the existing KING settlement wheel.
    This fallback exists solely so late matches survive the next 07:00 rotation.
    """
    try:
        import the_king_engine_v7 as v7
        from the_king_settlement_fallback import explicit_goaloo_ft
    except Exception as exc:
        return 0, [f"import:{type(exc).__name__}"]

    changed = 0
    errors = []
    for rec in records:
        if result_of(rec) != "PENDING" or canonical_key(rec) in current_today_keys:
            continue
        if str(rec.get("date") or "") < START_DATE:
            continue

        ft = None
        for url in (rec.get("summary_url"), rec.get("source_url"), rec.get("live_url")):
            if not url:
                continue
            try:
                ft = explicit_goaloo_ft(v7.render(url, 500))
            except Exception as exc:
                errors.append(f"{rec.get('id') or rec.get('goaloo_id') or 'unknown'}:{type(exc).__name__}")
                continue
            if ft:
                break
        if not ft:
            continue

        hg, ag = ft
        side = str(rec.get("side") or "").lower()
        won = (side == "home" and hg > ag) or (side == "away" and ag > hg)
        rec["ft"] = f"{hg}-{ag}"
        rec["result"] = "WIN" if won else "LOSS"
        rec["profit"] = profit_for(rec["result"], rec.get("odds"))
        rec["settled_at"] = now_iso()
        changed += 1
    return changed, errors[:20]


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

    current_today_keys = {
        canonical_key(r) for r in (feed.get("today") or [])
        if str(r.get("date") or "") >= START_DATE
    }
    fallback_settled, fallback_errors = settle_archived_pending(records, current_today_keys)

    records.sort(key=lambda r: (str(r.get("date") or ""), str(r.get("kickoff") or ""), canonical_key(r)))
    ledger["records"] = records
    ledger["summary"] = build_summary(records)

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
        "fallback_settled": fallback_settled,
        "fallback_errors": fallback_errors,
        "backups_created": backups,
        "changed": changed,
        "selection_date": feed.get("selection_date"),
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


def self_test() -> None:
    assert result_of({"result": "WIN"}) == "WIN"
    assert result_of({"result": "DRAW", "side": "home"}) == "LOSS"
    assert profit_for("WIN", 2.0) == 100.0
    assert profit_for("LOSS", 2.0) == -100.0
    sample = build_summary([
        {"result": "WIN", "odds": 2.0, "profit": 100.0},
        {"result": "LOSS", "odds": 2.0, "profit": -100.0},
        {"result": "PUSH", "odds": 2.0, "profit": 0.0},
    ])
    assert sample["win_rate"] == 50.0
    assert sample["settled"] == 3
    assert sample["pushes"] == 1
    print("KING Statistics V3 self-test OK")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["sync", "self-test"], nargs="?", default="sync")
    args = parser.parse_args()
    self_test() if args.command == "self-test" else sync()
