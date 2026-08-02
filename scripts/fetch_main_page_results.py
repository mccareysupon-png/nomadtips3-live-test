from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE = "https://v3.football.api-sports.io"
OUTPUT = Path("main-page-results.json")
TARGET_DATE = "2026-08-01"

PICKS = [
    {"order": 1, "home": "Greenock Morton", "away": "Partick Thistle", "pick": "Partick Thistle Win", "odds": 1.75, "confidence": 0.61},
    {"order": 2, "home": "WSG Tirol", "away": "Sturm Graz", "pick": "Sturm Graz Win", "odds": 1.91, "confidence": 0.57},
    {"order": 3, "home": "Wieczysta Krakow", "away": "Lech Poznan", "pick": "Lech Poznan Win", "odds": 1.78, "confidence": 0.56},
    {"order": 4, "home": "Lyngby BK", "away": "AGF Aarhus", "pick": "AGF Aarhus Win", "odds": 1.67, "confidence": 0.55},
    {"order": 5, "home": "IF Elfsborg", "away": "Malmo FF", "pick": "Malmo FF Win", "odds": 1.96, "confidence": 0.58},
    {"order": 6, "home": "Rosenborg BK", "away": "Bodo/Glimt", "pick": "Bodo/Glimt Win", "odds": 1.85, "confidence": 0.57},
]

ALIASES = {
    "greenockmorton": ["greenockmorton", "morton"],
    "partickthistle": ["partickthistle", "partick"],
    "wsgtirol": ["wsgtirol", "wattens"],
    "sturmgraz": ["sturm", "sturmgratz", "sksturm"],
    "wieczystakrakow": ["wieczystakrakow", "wieczysta"],
    "lechpoznan": ["lechpoznan", "kkslechpoznan", "lech"],
    "lyngbybk": ["lyngbybk", "lyngby"],
    "agfaarhus": ["agfaarhus", "aarhus", "agf"],
    "ifelfsborg": ["ifelfsborg", "elfsborg"],
    "malmoff": ["malmoff", "malmo"],
    "rosenborgbk": ["rosenborgbk", "rosenborg"],
    "bodoglimt": ["bodoglimt", "bodo", "glimt"],
}


def norm(value: Any) -> str:
    value = str(value or "").lower()
    value = value.replace("ø", "o").replace("ö", "o").replace("å", "a").replace("æ", "ae")
    value = value.replace("ó", "o").replace("ń", "n").replace("á", "a").replace("í", "i")
    return re.sub(r"[^a-z0-9]", "", value)


def aliases(name: str) -> list[str]:
    key = norm(name)
    return ALIASES.get(key, [key])


def matches(actual: str, expected: str) -> bool:
    actual_n = norm(actual)
    return any(a and (a == actual_n or a in actual_n or actual_n in a) for a in aliases(expected))


def request_json(path: str, params: dict[str, Any]) -> dict[str, Any]:
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    if not key:
        raise RuntimeError("API_FOOTBALL_KEY is missing")
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{BASE}{path}?{query}", headers={"x-apisports-key": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def winner_label(home: int | None, away: int | None) -> str | None:
    if home is None or away is None:
        return None
    if home > away:
        return "home"
    if away > home:
        return "away"
    return "draw"


def pick_side(pick: str, home: str, away: str) -> str | None:
    p = norm(pick.replace("Win", ""))
    if matches(home, p):
        return "home"
    if matches(away, p):
        return "away"
    if "draw" in pick.lower():
        return "draw"
    return None


def result_row(pick: dict[str, Any], fixture: dict[str, Any] | None) -> dict[str, Any]:
    row = dict(pick)
    if fixture is None:
        row.update({"found": False, "status": "NOT_FOUND", "final_score": None, "correct": None})
        return row

    goals = fixture.get("goals") or {}
    fulltime = (fixture.get("score") or {}).get("fulltime") or {}
    home_goals = fulltime.get("home") if fulltime.get("home") is not None else goals.get("home")
    away_goals = fulltime.get("away") if fulltime.get("away") is not None else goals.get("away")
    status = ((fixture.get("fixture") or {}).get("status") or {}).get("short")
    actual_side = winner_label(home_goals, away_goals)
    expected_side = pick_side(pick["pick"], pick["home"], pick["away"])
    settled = status in {"FT", "AET", "PEN", "AWD", "WO"}
    correct = (actual_side == expected_side) if settled and actual_side is not None and expected_side is not None else None
    row.update(
        {
            "found": True,
            "fixture_id": (fixture.get("fixture") or {}).get("id"),
            "kickoff_utc": (fixture.get("fixture") or {}).get("date"),
            "league": (fixture.get("league") or {}).get("name"),
            "api_home": ((fixture.get("teams") or {}).get("home") or {}).get("name"),
            "api_away": ((fixture.get("teams") or {}).get("away") or {}).get("name"),
            "status": status,
            "home_goals": home_goals,
            "away_goals": away_goals,
            "final_score": f"{home_goals}–{away_goals}" if home_goals is not None and away_goals is not None else None,
            "correct": correct,
        }
    )
    return row


def main() -> None:
    payload = request_json("/fixtures", {"date": TARGET_DATE, "timezone": "UTC"})
    fixtures = payload.get("response") or []
    rows: list[dict[str, Any]] = []
    for pick in PICKS:
        found = None
        for fixture in fixtures:
            teams = fixture.get("teams") or {}
            home = (teams.get("home") or {}).get("name", "")
            away = (teams.get("away") or {}).get("name", "")
            if matches(home, pick["home"]) and matches(away, pick["away"]):
                found = fixture
                break
        rows.append(result_row(pick, found))

    settled = [row for row in rows if row.get("correct") is not None]
    correct = sum(1 for row in settled if row["correct"] is True)
    incorrect = sum(1 for row in settled if row["correct"] is False)
    output = {
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target_date": TARGET_DATE,
        "api_results": payload.get("results"),
        "api_errors": payload.get("errors"),
        "summary": {
            "picks": len(rows),
            "found": sum(1 for row in rows if row["found"]),
            "settled": len(settled),
            "correct": correct,
            "incorrect": incorrect,
            "accuracy": (correct / len(settled)) if settled else None,
        },
        "matches": rows,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
