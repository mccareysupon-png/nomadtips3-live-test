from __future__ import annotations

import argparse
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TERMINAL_OUTCOMES = {"correct", "incorrect", "wrong", "void", "win", "loss"}


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def write_json_if_changed(path: Path, payload: Any) -> bool:
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == encoded:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(encoded, encoding="utf-8")
    return True


def fixture_key(value: Any) -> str:
    return str(value or "").removeprefix("AUTO-").strip()


def result_key(result: dict[str, Any]) -> str:
    return fixture_key(result.get("providerFixtureId") or result.get("fixtureId"))


def selection_key(selection: dict[str, Any]) -> str:
    return fixture_key(selection.get("fixture_id") or selection.get("client_fixture_id"))


def production_selection(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and payload.get("environment") == "PRODUCTION"
        and (payload.get("productionGuard") or {}).get("machine")
        == "CAR_1_PRODUCTION_ONLY"
        and isinstance(payload.get("selection_date"), str)
        and isinstance(payload.get("matches"), list)
    )


def selection_for_result_date(root: Path, result_date: str) -> dict[str, Any] | None:
    current = read_json(root / "selected-live-matches.json", {})
    if production_selection(current) and current.get("selection_date") == result_date:
        return current
    archive = root / "archive" / "auto-selections"
    for candidate in sorted(archive.glob(f"{result_date}-*.json"), reverse=True):
        payload = read_json(candidate, {})
        if production_selection(payload) and payload.get("selection_date") == result_date:
            return payload
    return None


def semantic_state(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key != "updatedAt"}


def save_state(path: Path, payload: dict[str, Any], now: str) -> bool:
    previous = read_json(path, {})
    if semantic_state(previous) == semantic_state(payload):
        return False
    return write_json_if_changed(path, {**payload, "updatedAt": now})


def reconcile(root: Path, now: str | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    result_feed = read_json(root / "result-feed.json", {})
    result_date = str(result_feed.get("selectionDate") or "")
    state_path = root / "production-daily-cycle-state.json"
    previous_state = read_json(state_path, {})
    history_path = root / "production-history.json"
    history = read_json(history_path, {"version": 1, "updatedAt": None, "sets": []})
    if not isinstance(history.get("sets"), list):
        history = {"version": 1, "updatedAt": None, "sets": []}

    selection = selection_for_result_date(root, result_date) if result_date else None
    if not selection:
        state = {
            "phase": "WAITING_FOR_SELECTION_SNAPSHOT",
            "resultSelectionDate": result_date,
            "allSettled": False,
            "historyComplete": False,
            "nextSelectionAllowed": False,
            "selectionRecordCount": 0,
            "storedRecordCount": 0,
            "pendingRecordCount": 0,
        }
        save_state(state_path, state, now)
        return state

    picks = selection.get("matches") or []
    results = {
        result_key(row): row
        for row in (result_feed.get("results") or [])
        if isinstance(row, dict) and result_key(row)
    }
    pending_keys: list[str] = []
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for sequence, pick in enumerate(picks, start=1):
        key = selection_key(pick)
        if not key or key in seen:
            pending_keys.append(key or f"sequence:{sequence}")
            continue
        seen.add(key)
        result = results.get(key)
        outcome = str((result or {}).get("outcome") or "pending").lower()
        if not result or outcome not in TERMINAL_OUTCOMES:
            pending_keys.append(key)
            continue
        records.append(
            {
                "fixtureKey": key,
                "providerFixtureId": fixture_key(result.get("providerFixtureId")) or key,
                "sequence": sequence,
                "selection": pick,
                "result": result,
            }
        )

    all_settled = bool(picks) and not pending_keys and len(records) == len(picks)
    if not all_settled:
        state = {
            "phase": "WAITING_FOR_RESULTS",
            "resultSelectionDate": result_date,
            "allSettled": False,
            "historyComplete": False,
            "nextSelectionAllowed": False,
            "selectionRecordCount": len(picks),
            "storedRecordCount": 0,
            "pendingRecordCount": len(pending_keys),
        }
        save_state(state_path, state, now)
        return state

    sets = history["sets"]
    existing_keys = {
        str(record.get("fixtureKey") or "")
        for day in sets
        for record in (day.get("records") or [])
        if day.get("selectionDate") != result_date
    }
    records = [record for record in records if record["fixtureKey"] not in existing_keys]
    existing_index = next(
        (index for index, day in enumerate(sets) if day.get("selectionDate") == result_date),
        None,
    )
    changed = False
    if existing_index is None:
        sets.append(
            {
                "selectionDate": result_date,
                "lockedAtUtc": selection.get("locked_at_utc"),
                "allSettled": True,
                "recordCount": len(records),
                "records": records,
            }
        )
        changed = True
    else:
        existing = sets[existing_index]
        stored = {
            str(record.get("fixtureKey") or ""): record
            for record in (existing.get("records") or [])
        }
        for record in records:
            stored.setdefault(record["fixtureKey"], record)
        merged = sorted(stored.values(), key=lambda row: int(row.get("sequence") or 0))
        replacement = {
            "selectionDate": result_date,
            "lockedAtUtc": existing.get("lockedAtUtc") or selection.get("locked_at_utc"),
            "allSettled": True,
            "recordCount": len(merged),
            "records": merged,
        }
        if replacement != existing:
            sets[existing_index] = replacement
            changed = True

    sets.sort(key=lambda day: str(day.get("selectionDate") or ""))
    if changed:
        history["version"] = 1
        history["updatedAt"] = now
        write_json_if_changed(history_path, history)

    stored_set = next(day for day in sets if day.get("selectionDate") == result_date)
    stored_records = stored_set.get("records") or []
    unique_stored = {str(record.get("fixtureKey") or "") for record in stored_records}
    history_complete = (
        len(stored_records) == len(picks)
        and len(unique_stored) == len(picks)
        and all(
            str((record.get("result") or {}).get("outcome") or "pending").lower()
            in TERMINAL_OUTCOMES
            for record in stored_records
        )
    )
    statistics_verified = (
        history_complete
        and previous_state.get("statisticsVerifiedForDate") == result_date
    )
    state = {
        "phase": (
            "STATISTICS_VERIFIED"
            if statistics_verified
            else "HISTORY_READY"
            if history_complete
            else "HISTORY_VERIFY_FAILED"
        ),
        "resultSelectionDate": result_date,
        "allSettled": True,
        "historyComplete": history_complete,
        "nextSelectionAllowed": statistics_verified,
        "selectionRecordCount": len(picks),
        "storedRecordCount": len(stored_records),
        "pendingRecordCount": 0,
        "historyTotalRecords": sum(len(day.get("records") or []) for day in sets),
    }
    save_state(state_path, state, now)
    return state


def mark_statistics_verified(root: Path, result_date: str, now: str | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    state_path = root / "production-daily-cycle-state.json"
    state = read_json(state_path, {})
    if (
        not state.get("historyComplete")
        or state.get("resultSelectionDate") != result_date
        or state.get("pendingRecordCount") != 0
    ):
        raise RuntimeError(f"Cannot verify Statistics before history is complete for {result_date}")
    state.update(
        {
            "phase": "STATISTICS_VERIFIED",
            "statisticsVerifiedForDate": result_date,
            "statisticsVerifiedAt": now,
            "nextSelectionAllowed": True,
        }
    )
    write_json_if_changed(state_path, {**state, "updatedAt": now})
    return state


def sample_selection(date: str, fixture_ids: list[int]) -> dict[str, Any]:
    return {
        "selection_date": date,
        "locked_at_utc": f"{date}T00:00:00Z",
        "environment": "PRODUCTION",
        "productionGuard": {"machine": "CAR_1_PRODUCTION_ONLY"},
        "matches": [
            {
                "fixture_id": fixture_id,
                "home": f"Home {fixture_id}",
                "away": f"Away {fixture_id}",
                "pick": f"Home {fixture_id} Win",
                "pick_side": "home",
                "odds": 1.8,
                "confidence": 60,
            }
            for fixture_id in fixture_ids
        ],
    }


def sample_results(date: str, fixture_ids: list[int], pending: bool = False) -> dict[str, Any]:
    return {
        "selectionDate": date,
        "summary": {"allSettled": not pending, "pending": len(fixture_ids) if pending else 0},
        "results": [
            {
                "fixtureId": f"AUTO-{fixture_id}",
                "providerFixtureId": str(fixture_id),
                "home": f"Home {fixture_id}",
                "away": f"Away {fixture_id}",
                "status": "NS" if pending else "FT",
                "homeScore": None if pending else 2,
                "awayScore": None if pending else 0,
                "outcome": "pending" if pending else "correct",
                "updatedAt": f"{date}T23:00:00Z",
            }
            for fixture_id in fixture_ids
        ],
    }


def self_test() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        write_json_if_changed(root / "selected-live-matches.json", sample_selection("2026-08-11", [101, 102]))
        write_json_if_changed(root / "result-feed.json", sample_results("2026-08-11", [101, 102]))
        first = reconcile(root, "2026-08-12T00:00:00Z")
        assert first["historyComplete"] and first["historyTotalRecords"] == 2
        assert not first["nextSelectionAllowed"]
        verified = mark_statistics_verified(root, "2026-08-11", "2026-08-12T00:01:00Z")
        assert verified["nextSelectionAllowed"]
        original = (root / "production-history.json").read_text(encoding="utf-8")
        second = reconcile(root, "2026-08-12T00:15:00Z")
        assert second["historyComplete"] and second["historyTotalRecords"] == 2
        assert second["nextSelectionAllowed"]
        assert (root / "production-history.json").read_text(encoding="utf-8") == original

        archive = root / "archive" / "auto-selections"
        archive.mkdir(parents=True)
        write_json_if_changed(archive / "2026-08-11-archive.json", sample_selection("2026-08-11", [101, 102]))
        write_json_if_changed(root / "selected-live-matches.json", sample_selection("2026-08-12", [201, 202]))
        write_json_if_changed(root / "result-feed.json", sample_results("2026-08-12", [201, 202], pending=True))
        waiting = reconcile(root, "2026-08-12T12:00:00Z")
        assert not waiting["nextSelectionAllowed"]
        assert json.loads((root / "production-history.json").read_text())["sets"][0]["recordCount"] == 2

        write_json_if_changed(root / "result-feed.json", sample_results("2026-08-12", [201, 202]))
        third = reconcile(root, "2026-08-13T00:00:00Z")
        assert third["historyComplete"] and third["historyTotalRecords"] == 4
        assert not third["nextSelectionAllowed"]
        mark_statistics_verified(root, "2026-08-12", "2026-08-13T00:01:00Z")
        fourth = reconcile(root, "2026-08-13T00:15:00Z")
        assert fourth["historyTotalRecords"] == 4
        history = json.loads((root / "production-history.json").read_text())
        assert [day["selectionDate"] for day in history["sets"]] == ["2026-08-11", "2026-08-12"]
        assert len({row["fixtureKey"] for day in history["sets"] for row in day["records"]}) == 4
    print("PASS: two-day Production Daily Cycle is append-only and idempotent")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--mark-statistics-verified")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.mark_statistics_verified:
        print(json.dumps(mark_statistics_verified(args.root, args.mark_statistics_verified), ensure_ascii=False, indent=2))
        return
    print(json.dumps(reconcile(args.root), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
