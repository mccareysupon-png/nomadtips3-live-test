#!/usr/bin/env python3
"""Publish human-approved Soccer Predictions staging rows to Selected Matches only."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def ready(row: dict) -> bool:
    required = ("id", "league", "home", "away", "pick", "confidence", "odds")
    return row.get("reviewStatus") == "approved" and all(row.get(key) not in (None, "") for key in required)


def public_row(row: dict) -> dict:
    allowed = {
        "id", "league", "kickoff", "kickoffAt", "home", "away", "homeLogo", "awayLogo",
        "pick", "odds", "confidence", "abc", "featured", "nomadPick", "metricsStatus",
        "source", "sourceMeta", "analysisData", "analysis", "engine"
    }
    out = {k: v for k, v in row.items() if k in allowed}
    out["nomadPick"] = bool(out.get("nomadPick", False))
    out["abc"] = out.get("abc") or "SELECTED"
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument("--selected", required=True, type=Path)
    args = parser.parse_args()

    staging = load(args.staging)
    current = load(args.selected) if args.selected.exists() else {"matches": []}
    approved = [public_row(row) for row in staging.get("matches", []) if ready(row)]

    by_id = {str(row.get("id")): row for row in current.get("matches", []) if row.get("id")}
    for row in approved:
        by_id[str(row["id"])] = row

    matches = list(by_id.values())
    matches.sort(key=lambda r: (str(r.get("kickoffAt") or "9999"), str(r.get("league") or ""), str(r.get("home") or "")))
    payload = {
        "generatedAt": now_iso(),
        "mode": "curated-selected-matches",
        "liveScore": False,
        "coverageComplete": False,
        "coverageLabel": "CURATED MATCHES",
        "coverageNote": "Only matches manually shortlisted and approved for analysis are shown. This is not an automatic full-fixture feed.",
        "matches": matches,
    }
    args.selected.parent.mkdir(parents=True, exist_ok=True)
    args.selected.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"approved={len(approved)} selected_total={len(matches)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
