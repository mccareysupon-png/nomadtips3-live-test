#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API_KEY = os.environ["API_FOOTBALL_KEY"]
BASE = "https://v3.football.api-sports.io"
TARGET_DATE = os.getenv("TARGET_DATE", "2026-08-03")
RUN_SECONDS = int(os.getenv("RUN_SECONDS", "285"))
SCORE_SECONDS = 15
EVENT_SECONDS = 30
STATS_SECONDS = 60
TERMINAL = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO", "PST"}
LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "INT", "SUSP", "LIVE"}

MATCHES = [
    ("live-data-drukpa-paro.json", r"drukpa|drukpafc", r"parofc|paro"),
    ("live-data-bukovyna-lnz-cherkasy.json", r"bukovyna|bukovina", r"lnzcherkasy|lnz"),
    ("live-data-sjk-hjk-helsinki.json", r"sjk|seinajoki", r"hjkhelsinki|hjk"),
]


def iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def api_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    query = urllib.parse.urlencode(params or {})
    url = f"{BASE}{path}" + (f"?{query}" if query else "")
    request = urllib.request.Request(url, headers={"x-apisports-key": API_KEY})
    last: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            if payload.get("errors"):
                raise RuntimeError(str(payload["errors"]))
            return payload
        except Exception as exc:
            last = exc
            if attempt < 2:
                time.sleep(2)
    raise RuntimeError(str(last))


def norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def find_fixture(fixtures: list[dict[str, Any]], home_pattern: str, away_pattern: str) -> dict[str, Any] | None:
    for item in fixtures:
        home = norm(item.get("teams", {}).get("home", {}).get("name"))
        away = norm(item.get("teams", {}).get("away", {}).get("name"))
        if re.search(home_pattern, home) and re.search(away_pattern, away):
            return item
    return None


def map_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "minute": e.get("time", {}).get("elapsed"),
            "extra": e.get("time", {}).get("extra"),
            "team": e.get("team", {}).get("name"),
            "player": e.get("player", {}).get("name"),
            "assist": e.get("assist", {}).get("name"),
            "type": e.get("type"),
            "detail": e.get("detail"),
        }
        for e in events
    ]


def stat_map(blocks: list[dict[str, Any]], team_id: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for block in blocks or []:
        if block.get("team", {}).get("id") != team_id:
            continue
        for stat in block.get("statistics", []):
            if stat.get("type"):
                result[stat["type"]] = stat.get("value")
    return result


def first(values: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in values and values[name] is not None:
            return values[name]
    return None


def pair(old: dict[str, Any], key: str, home: dict[str, Any], away: dict[str, Any], *names: str) -> dict[str, Any]:
    previous = old.get(key) or {}
    h = first(home, *names)
    a = first(away, *names)
    return {
        "home": previous.get("home") if h is None else h,
        "away": previous.get("away") if a is None else a,
    }


def card_count(events: list[dict[str, Any]], team_id: Any, detail: str) -> int:
    return sum(1 for e in events if e.get("team", {}).get("id") == team_id and e.get("type") == "Card" and e.get("detail") == detail)


def update_score(data: dict[str, Any], fixture: dict[str, Any], timestamp: str) -> None:
    match = data.setdefault("match", {})
    previous_home = match.get("home", {})
    previous_away = match.get("away", {})
    match.update({
        "id": str(fixture.get("fixture", {}).get("id")),
        "league": fixture.get("league", {}).get("name") or match.get("league"),
        "country": fixture.get("league", {}).get("country") or match.get("country"),
        "home": {
            "name": fixture.get("teams", {}).get("home", {}).get("name") or previous_home.get("name"),
            "short_name": previous_home.get("short_name") or fixture.get("teams", {}).get("home", {}).get("name"),
        },
        "away": {
            "name": fixture.get("teams", {}).get("away", {}).get("name") or previous_away.get("name"),
            "short_name": previous_away.get("short_name") or fixture.get("teams", {}).get("away", {}).get("name"),
        },
        "kickoff_utc": fixture.get("fixture", {}).get("date") or match.get("kickoff_utc"),
        "status": fixture.get("fixture", {}).get("status", {}).get("short") or match.get("status"),
        "status_long": fixture.get("fixture", {}).get("status", {}).get("long") or match.get("status_long"),
        "elapsed": fixture.get("fixture", {}).get("status", {}).get("elapsed"),
        "score": {"home": fixture.get("goals", {}).get("home"), "away": fixture.get("goals", {}).get("away")},
        "halftime_score": fixture.get("score", {}).get("halftime") or match.get("halftime_score"),
        "fulltime_score": fixture.get("score", {}).get("fulltime") or match.get("fulltime_score"),
    })
    data["source"] = "api-football"
    data["http_status"] = 200
    data["fetched_at_utc"] = timestamp
    data.setdefault("api_response", {})["fixture"] = fixture
    meta = data.setdefault("live_meta", {})
    meta["score_updated_at"] = timestamp
    if str(match.get("status") or "").upper() in TERMINAL:
        meta["stopped_at"] = timestamp


def update_events(data: dict[str, Any], timestamp: str) -> None:
    fixture_id = data.get("match", {}).get("id")
    if not fixture_id:
        return
    raw = api_get("/fixtures/events", {"fixture": fixture_id}).get("response", [])
    data.setdefault("match", {})["events"] = map_events(raw)
    data.setdefault("api_response", {})["events"] = raw
    data.setdefault("live_meta", {})["events_updated_at"] = timestamp


def update_stats(data: dict[str, Any], timestamp: str) -> None:
    match = data.setdefault("match", {})
    fixture_id = match.get("id")
    if not fixture_id:
        return
    raw = api_get("/fixtures/statistics", {"fixture": fixture_id}).get("response", [])
    fixture = data.get("api_response", {}).get("fixture") or {}
    home_id = fixture.get("teams", {}).get("home", {}).get("id")
    away_id = fixture.get("teams", {}).get("away", {}).get("id")
    home = stat_map(raw, home_id)
    away = stat_map(raw, away_id)
    old = match.get("stats") or {}
    events = data.get("api_response", {}).get("events") or []
    match["stats"] = {
        "attacks": pair(old, "attacks", home, away, "Attacks", "Total Attacks"),
        "dangerous_attacks": pair(old, "dangerous_attacks", home, away, "Dangerous Attacks"),
        "expected_goals": pair(old, "expected_goals", home, away, "expected_goals", "Expected Goals"),
        "possession": pair(old, "possession", home, away, "Ball Possession"),
        "shots": pair(old, "shots", home, away, "Total Shots"),
        "shots_on_target": pair(old, "shots_on_target", home, away, "Shots on Goal"),
        "shots_off_target": pair(old, "shots_off_target", home, away, "Shots off Goal"),
        "blocked_shots": pair(old, "blocked_shots", home, away, "Blocked Shots"),
        "shots_inside_box": pair(old, "shots_inside_box", home, away, "Shots insidebox", "Shots inside box"),
        "shots_outside_box": pair(old, "shots_outside_box", home, away, "Shots outsidebox", "Shots outside box"),
        "corners": pair(old, "corners", home, away, "Corner Kicks"),
        "fouls": pair(old, "fouls", home, away, "Fouls"),
        "offsides": pair(old, "offsides", home, away, "Offsides"),
        "goalkeeper_saves": pair(old, "goalkeeper_saves", home, away, "Goalkeeper Saves"),
        "total_passes": pair(old, "total_passes", home, away, "Total passes"),
        "accurate_passes": pair(old, "accurate_passes", home, away, "Passes accurate"),
        "pass_accuracy": pair(old, "pass_accuracy", home, away, "Passes %"),
        "yellow_cards": {"home": card_count(events, home_id, "Yellow Card"), "away": card_count(events, away_id, "Yellow Card")},
        "red_cards": {"home": card_count(events, home_id, "Red Card"), "away": card_count(events, away_id, "Red Card")},
        "provider_all": {"home": home, "away": away},
    }
    data.setdefault("api_response", {})["statistics"] = raw
    data.setdefault("live_meta", {})["stats_updated_at"] = timestamp


def publish(paths: list[Path], label: str) -> None:
    unique = list(dict.fromkeys(paths))
    if not unique:
        return
    subprocess.run(["git", "add", *[str(p) for p in unique]], check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], check=False).returncode == 0:
        return
    subprocess.run(["git", "commit", "-m", label], check=True)
    subprocess.run(["git", "pull", "--rebase", "origin", "main"], check=True)
    subprocess.run(["git", "push", "origin", "main"], check=True)


def main() -> None:
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
    subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)

    entries: list[dict[str, Any]] = []
    for filename, home_pattern, away_pattern in MATCHES:
        path = Path(filename)
        if path.exists():
            entries.append({"path": path, "home_pattern": home_pattern, "away_pattern": away_pattern, "data": load(path)})

    unresolved = [e for e in entries if not e["data"].get("match", {}).get("id")]
    if unresolved:
        fixtures = api_get("/fixtures", {"date": TARGET_DATE, "timezone": "UTC"}).get("response", [])
        for entry in unresolved:
            found = find_fixture(fixtures, entry["home_pattern"], entry["away_pattern"])
            if found:
                entry["data"].setdefault("match", {})["id"] = str(found.get("fixture", {}).get("id"))
                entry["fixture"] = found

    started = time.monotonic()
    cycle = 0
    while time.monotonic() - started < RUN_SECONDS:
        cycle_started = time.monotonic()
        timestamp = iso_now()
        active = [e for e in entries if str(e["data"].get("match", {}).get("status") or "").upper() not in TERMINAL]
        if not active:
            break

        ids = [str(e["data"].get("match", {}).get("id")) for e in active if e["data"].get("match", {}).get("id")]
        current: dict[str, dict[str, Any]] = {}
        if ids:
            response = api_get("/fixtures", {"ids": "-".join(ids), "timezone": "UTC"}).get("response", [])
            current = {str(item.get("fixture", {}).get("id")): item for item in response}

        changed: list[Path] = []
        for entry in active:
            before = json.dumps(entry["data"], ensure_ascii=False, sort_keys=True)
            fixture_id = str(entry["data"].get("match", {}).get("id") or "")
            fixture = current.get(fixture_id) or entry.get("fixture")
            if fixture:
                update_score(entry["data"], fixture, timestamp)
                status = str(entry["data"].get("match", {}).get("status") or "").upper()
                if status in LIVE:
                    if cycle % (EVENT_SECONDS // SCORE_SECONDS) == 0:
                        try:
                            update_events(entry["data"], timestamp)
                        except Exception as exc:
                            print(f"events failed for {entry['path']}: {exc}")
                    if cycle % (STATS_SECONDS // SCORE_SECONDS) == 0:
                        try:
                            update_stats(entry["data"], timestamp)
                        except Exception as exc:
                            print(f"stats failed for {entry['path']}: {exc}")

            after = json.dumps(entry["data"], ensure_ascii=False, sort_keys=True)
            if after != before:
                entry["path"].write_text(json.dumps(entry["data"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                changed.append(entry["path"])

        manifest_path = Path("live-matches.json")
        manifest = {
            "files": [
                e["path"].name
                for e in entries
                if str(e["data"].get("match", {}).get("status") or "").upper() not in TERMINAL
            ]
        }
        manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        if not manifest_path.exists() or manifest_path.read_text(encoding="utf-8") != manifest_text:
            manifest_path.write_text(manifest_text, encoding="utf-8")
            changed.append(manifest_path)

        publish(changed, f"Live V2 refresh {timestamp}")
        cycle += 1
        time.sleep(max(0, SCORE_SECONDS - (time.monotonic() - cycle_started)))


if __name__ == "__main__":
    main()
