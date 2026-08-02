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
SEARCH_FROM = "2026-01-01"
SEARCH_TO = "2026-08-02"

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
    "sturmgraz": ["sturmgraz", "sturm", "sksturm"],
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
    for src, dst in {"ø":"o","ö":"o","å":"a","æ":"ae","ó":"o","ń":"n","á":"a","í":"i"}.items():
        value = value.replace(src, dst)
    return re.sub(r"[^a-z0-9]", "", value)


def aliases(name: str) -> list[str]:
    return ALIASES.get(norm(name), [norm(name)])


def matches(actual: str, expected: str) -> bool:
    actual_n = norm(actual)
    return any(a and (a == actual_n or a in actual_n or actual_n in a) for a in aliases(expected))


def request_json(path: str, params: dict[str, Any]) -> dict[str, Any]:
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    if not key:
        raise RuntimeError("API_FOOTBALL_KEY is missing")
    req = urllib.request.Request(
        f"{BASE}{path}?{urllib.parse.urlencode(params)}",
        headers={"x-apisports-key": key, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def teams_of(fixture: dict[str, Any]) -> tuple[str, str]:
    teams = fixture.get("teams") or {}
    return ((teams.get("home") or {}).get("name", ""), (teams.get("away") or {}).get("name", ""))


def exact_pair(fixture: dict[str, Any], pick: dict[str, Any]) -> bool:
    home, away = teams_of(fixture)
    return matches(home, pick["home"]) and matches(away, pick["away"])


def reverse_pair(fixture: dict[str, Any], pick: dict[str, Any]) -> bool:
    home, away = teams_of(fixture)
    return matches(home, pick["away"]) and matches(away, pick["home"])


def winner_label(home: int | None, away: int | None) -> str | None:
    if home is None or away is None:
        return None
    return "home" if home > away else "away" if away > home else "draw"


def pick_side(pick: str, home: str, away: str) -> str | None:
    selected = norm(pick.replace("Win", ""))
    if matches(home, selected):
        return "home"
    if matches(away, selected):
        return "away"
    return "draw" if "draw" in pick.lower() else None


def fixture_snapshot(fixture: dict[str, Any]) -> dict[str, Any]:
    goals = fixture.get("goals") or {}
    fulltime = (fixture.get("score") or {}).get("fulltime") or {}
    hg = fulltime.get("home") if fulltime.get("home") is not None else goals.get("home")
    ag = fulltime.get("away") if fulltime.get("away") is not None else goals.get("away")
    home, away = teams_of(fixture)
    return {
        "fixture_id": (fixture.get("fixture") or {}).get("id"),
        "kickoff_utc": (fixture.get("fixture") or {}).get("date"),
        "league": (fixture.get("league") or {}).get("name"),
        "api_home": home,
        "api_away": away,
        "status": ((fixture.get("fixture") or {}).get("status") or {}).get("short"),
        "home_goals": hg,
        "away_goals": ag,
        "final_score": f"{hg}–{ag}" if hg is not None and ag is not None else None,
    }


def result_row(pick: dict[str, Any], fixture: dict[str, Any] | None) -> dict[str, Any]:
    row = dict(pick)
    if fixture is None:
        row.update({"found": False, "status": "NOT_FOUND", "final_score": None, "correct": None})
        return row
    row.update({"found": True, **fixture_snapshot(fixture)})
    settled = row["status"] in {"FT", "AET", "PEN", "AWD", "WO"}
    actual = winner_label(row["home_goals"], row["away_goals"])
    expected = pick_side(pick["pick"], pick["home"], pick["away"])
    row["correct"] = actual == expected if settled and actual and expected else None
    return row


def resolve_team_id(team_name: str) -> int | None:
    payload = request_json("/teams", {"search": team_name})
    candidates = payload.get("response") or []
    for candidate in candidates:
        team = candidate.get("team") or {}
        if matches(team.get("name", ""), team_name):
            return team.get("id")
    return None


def find_historical_pair(pick: dict[str, Any]) -> tuple[dict[str, Any] | None, bool | None]:
    team_id = resolve_team_id(pick["home"])
    if not team_id:
        return None, None
    payload = request_json("/fixtures", {"team": team_id, "from": SEARCH_FROM, "to": SEARCH_TO, "timezone": "UTC"})
    fixtures = payload.get("response") or []
    exact = [f for f in fixtures if exact_pair(f, pick)]
    reverse = [f for f in fixtures if reverse_pair(f, pick)]
    pool = exact if exact else reverse
    if not pool:
        return None, None
    target = datetime.fromisoformat(TARGET_DATE + "T00:00:00+00:00")
    pool.sort(key=lambda f: abs(datetime.fromisoformat((f.get("fixture") or {}).get("date")).astimezone(timezone.utc) - target))
    return pool[0], bool(exact)


def main() -> None:
    payload = request_json("/fixtures", {"date": TARGET_DATE, "timezone": "UTC"})
    fixtures = payload.get("response") or []
    rows: list[dict[str, Any]] = []
    for pick in PICKS:
        found = next((fixture for fixture in fixtures if exact_pair(fixture, pick)), None)
        row = result_row(pick, found)
        if found is None:
            historical, same_orientation = find_historical_pair(pick)
            if historical is not None:
                row["status"] = "DATE_MISMATCH"
                row["void_candidate"] = True
                row["nearest_fixture_same_orientation"] = same_orientation
                row["nearest_fixture"] = fixture_snapshot(historical)
        rows.append(row)

    settled = [row for row in rows if row.get("correct") is not None]
    correct = sum(row["correct"] is True for row in settled)
    incorrect = sum(row["correct"] is False for row in settled)
    void_candidates = sum(row.get("void_candidate") is True for row in rows)
    output = {
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target_date": TARGET_DATE,
        "api_results": payload.get("results"),
        "api_errors": payload.get("errors"),
        "summary": {
            "picks": len(rows),
            "found_on_locked_date": sum(row.get("found") is True for row in rows),
            "settled": len(settled),
            "correct": correct,
            "incorrect": incorrect,
            "void_candidates": void_candidates,
            "accuracy_excluding_void": (correct / len(settled)) if settled else None,
        },
        "matches": rows,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
