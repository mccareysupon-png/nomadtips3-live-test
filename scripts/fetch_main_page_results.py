from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SELECTION_PATH = Path("selected-live-matches.json")
RESULT_PATH = Path("result-feed.json")
OUTPUT_PATH = Path("main-page-results.json")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def fixture_key(value: Any) -> str:
    return str(value or "").removeprefix("AUTO-")


def main() -> None:
    selection = read_json(SELECTION_PATH)
    results = read_json(RESULT_PATH)
    target_date = str(results.get("selectionDate") or "")
    if selection.get("selection_date") != target_date:
        candidates = sorted(
            Path("archive/auto-selections").glob(f"{target_date}-*.json"),
            reverse=True,
        )
        if not candidates:
            raise RuntimeError(f"No Production selection snapshot for {target_date}")
        selection = read_json(candidates[0])

    result_map = {
        fixture_key(row.get("providerFixtureId") or row.get("fixtureId")): row
        for row in (results.get("results") or [])
    }
    rows = []
    for order, pick in enumerate(selection.get("matches") or [], start=1):
        key = fixture_key(pick.get("fixture_id") or pick.get("client_fixture_id"))
        result = result_map.get(key) or {}
        outcome = str(result.get("outcome") or "pending").lower()
        rows.append(
            {
                "order": order,
                "fixture_id": pick.get("fixture_id"),
                "home": pick.get("home"),
                "away": pick.get("away"),
                "pick": pick.get("pick"),
                "odds": pick.get("odds"),
                "confidence": pick.get("confidence"),
                "status": result.get("status") or "NS",
                "home_goals": result.get("homeScore"),
                "away_goals": result.get("awayScore"),
                "final_score": (
                    f"{result.get('homeScore')}–{result.get('awayScore')}"
                    if result.get("homeScore") is not None
                    and result.get("awayScore") is not None
                    else None
                ),
                "outcome": outcome,
                "correct": True if outcome == "correct" else False if outcome in {"incorrect", "wrong"} else None,
            }
        )

    settled = [row for row in rows if row["outcome"] != "pending"]
    correct = sum(row["outcome"] == "correct" for row in settled)
    incorrect = sum(row["outcome"] in {"incorrect", "wrong"} for row in settled)
    payload = {
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target_date": target_date,
        "source": "Production result-feed.json",
        "summary": {
            "picks": len(rows),
            "settled": len(settled),
            "correct": correct,
            "incorrect": incorrect,
            "void": sum(row["outcome"] == "void" for row in settled),
            "pending": sum(row["outcome"] == "pending" for row in rows),
            "allSettled": bool(rows) and len(settled) == len(rows),
            "accuracy": correct / (correct + incorrect) if correct + incorrect else None,
        },
        "matches": rows,
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
