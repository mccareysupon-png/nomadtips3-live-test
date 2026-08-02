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
    {"order": 3, "home": "Wieczysta Krakow", "away": "Lech Poznan", "pick": "Lech Poznan Win", "odds": 1.79, "confidence": 0.56},
    {"order": 4, "home": "Lyngby BK", "away": "AGF Aarhus", "pick": "AGF Aarhus Win", "odds": 1.93, "confidence": 0.58},
    {"order": 5, "home": "Basel", "away": "Lausanne-Sport", "pick": "Basel Win", "odds": 1.98, "confidence": 0.57},
    {"order": 6, "home": "FC Zurich", "away": "Servette", "pick": "Servette Win", "odds": 1.90, "confidence": 0.56},
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
    "basel": ["basel", "fcbasel"],
    "lausannesport": ["lausannesport", "lausanne"],
    "fczurich": ["fczurich", "zurich"],
    "servette": ["servette", "servettefc"],
}


def norm(value: Any) -> str:
    value = str(value or "").lower()
    for src, dst in {"ø":"o","ö":"o","å":"a","æ":"ae","ó":"o","ń":"n","á":"a","í":"i","ü":"u","é":"e","è":"e","ä":"a"}.items():
        value = value.replace(src, dst)
    return re.sub(r"[^a-z0-9]", "", value)


def aliases(name: str) -> list[str]:
    return ALIASES.get(norm(name), [norm(name)])


def matches(actual: str, expected: str) -> bool:
    a = norm(actual)
    return any(x and (x == a or x in a or a in x) for x in aliases(expected))


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


def side_for_pick(pick: dict[str, Any]) -> str:
    selected = norm(pick["pick"].replace("Win", ""))
    if matches(pick["home"], selected):
        return "home"
    if matches(pick["away"], selected):
        return "away"
    return "draw"


def main() -> None:
    payload = request_json("/fixtures", {"date": TARGET_DATE, "timezone": "UTC"})
    fixtures = payload.get("response") or []
    rows = []
    for pick in PICKS:
        fixture = None
        for item in fixtures:
            teams = item.get("teams") or {}
            home = (teams.get("home") or {}).get("name", "")
            away = (teams.get("away") or {}).get("name", "")
            if matches(home, pick["home"]) and matches(away, pick["away"]):
                fixture = item
                break
        row = dict(pick)
        if fixture is None:
            row.update({"found": False, "status": "NOT_FOUND", "final_score": None, "correct": None})
            rows.append(row)
            continue

        goals = fixture.get("goals") or {}
        fulltime = (fixture.get("score") or {}).get("fulltime") or {}
        hg = fulltime.get("home") if fulltime.get("home") is not None else goals.get("home")
        ag = fulltime.get("away") if fulltime.get("away") is not None else goals.get("away")
        status = ((fixture.get("fixture") or {}).get("status") or {}).get("short")
        settled = status in {"FT", "AET", "PEN", "AWD", "WO"}
        actual = "home" if hg is not None and ag is not None and hg > ag else "away" if hg is not None and ag is not None and ag > hg else "draw"
        expected = side_for_pick(pick)
        teams = fixture.get("teams") or {}
        row.update({
            "found": True,
            "fixture_id": (fixture.get("fixture") or {}).get("id"),
            "kickoff_utc": (fixture.get("fixture") or {}).get("date"),
            "league": (fixture.get("league") or {}).get("name"),
            "api_home": ((teams.get("home") or {}).get("name")),
            "api_away": ((teams.get("away") or {}).get("name")),
            "status": status,
            "home_goals": hg,
            "away_goals": ag,
            "final_score": f"{hg}–{ag}" if hg is not None and ag is not None else None,
            "correct": (actual == expected) if settled else None,
        })
        rows.append(row)

    settled_rows = [r for r in rows if r.get("correct") is not None]
    correct = sum(r["correct"] is True for r in settled_rows)
    incorrect = sum(r["correct"] is False for r in settled_rows)
    output = {
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target_date": TARGET_DATE,
        "source": "API-Football",
        "summary": {
            "picks": len(rows),
            "found": sum(r.get("found") is True for r in rows),
            "settled": len(settled_rows),
            "correct": correct,
            "incorrect": incorrect,
            "accuracy": correct / len(settled_rows) if settled_rows else None,
        },
        "matches": rows,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
