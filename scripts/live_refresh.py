#!/usr/bin/env python3
"""Central API-FOOTBALL refresher for NOMADTIPS3 Live Test.

Cadence while a match is active:
- score, clock and status: every 15 seconds (one batched fixtures call)
- events: every 30 seconds per active fixture
- statistics: every 60 seconds per active fixture
- lineups: one pre-match check only

Browsers never receive the API key and only read the generated JSON files.
"""

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
TARGET_DATE = os.getenv("TARGET_DATE", dt.datetime.now(dt.timezone.utc).date().isoformat())
RUN_SECONDS = int(os.getenv("RUN_SECONDS", "285"))
SCORE_SECONDS = 15
EVENT_SECONDS = 30
STATS_SECONDS = 60

TERMINAL = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO", "PST"}
LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "INT", "SUSP", "LIVE"}

MATCHES = [
    ("live-data-cambodia-timor-leste.json", r"cambodia", r"timorleste|easttimor"),
    ("live-data-drukpa-paro.json", r"drukpa|drukpafc", r"parofc|paro"),
]


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def api_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    query = urllib.parse.urlencode(params or {})
    url = f"{BASE}{path}" + (f"?{query}" if query else "")
    request = urllib.request.Request(url, headers={"x-apisports-key": API_KEY})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            if payload.get("errors"):
                raise RuntimeError(str(payload["errors"]))
            return payload
        except Exception as exc:  # network/provider retry
            last_error = exc
            if attempt < 2:
                time.sleep(2)
    assert last_error is not None
    raise last_error


def norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_time(value: Any) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def match_fixture(fixtures: list[dict[str, Any]], home_pattern: str, away_pattern: str) -> dict[str, Any] | None:
    for item in fixtures:
        home = norm(item.get("teams", {}).get("home", {}).get("name"))
        away = norm(item.get("teams", {}).get("away", {}).get("name"))
        if re.search(home_pattern, home) and re.search(away_pattern, away):
            return item
    return None


def fixture_map(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in payload.get("response", []):
        fixture_id = item.get("fixture", {}).get("id")
        if fixture_id is not None:
            result[str(fixture_id)] = item
    return result


def stat_dict(blocks: list[dict[str, Any]], team_id: Any) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for block in blocks or []:
        if block.get("team", {}).get("id") != team_id:
            continue
        for stat in block.get("statistics", []):
            name = stat.get("type")
            if name:
                values[name] = stat.get("value")
    return values


def first_stat(values: dict[str, Any], aliases: list[str]) -> Any:
    for alias in aliases:
        if alias in values and values[alias] is not None:
            return values[alias]
    return None


def pair(old_stats: dict[str, Any], key: str, home_values: dict[str, Any], away_values: dict[str, Any], aliases: list[str]) -> dict[str, Any]:
    previous = old_stats.get(key) or {}
    home = first_stat(home_values, aliases)
    away = first_stat(away_values, aliases)
    return {
        "home": previous.get("home") if home is None else home,
        "away": previous.get("away") if away is None else away,
    }


def card_count(events: list[dict[str, Any]], team_id: Any, detail: str) -> int:
    return sum(
        1
        for event in events
        if event.get("team", {}).get("id") == team_id
        and event.get("type") == "Card"
        and event.get("detail") == detail
    )


def map_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "minute": event.get("time", {}).get("elapsed"),
            "extra": event.get("time", {}).get("extra"),
            "team": event.get("team", {}).get("name"),
            "player": event.get("player", {}).get("name"),
            "assist": event.get("assist", {}).get("name"),
            "type": event.get("type"),
            "detail": event.get("detail"),
        }
        for event in events
    ]


def git_publish(changed_paths: list[Path], label: str) -> None:
    if not changed_paths:
        return
    subprocess.run(["git", "add", *[str(path) for path in changed_paths]], check=True)
    staged = subprocess.run(["git", "diff", "--cached", "--quiet"], check=False)
    if staged.returncode == 0:
        return
    subprocess.run(["git", "commit", "-m", label], check=True)
    # A previous loop or an external edit may have advanced main.
    subprocess.run(["git", "pull", "--rebase", "origin", "main"], check=True)
    subprocess.run(["git", "push", "origin", "main"], check=True)


def discover_ids(entries: list[dict[str, Any]]) -> None:
    unresolved = [entry for entry in entries if not entry["data"].get("match", {}).get("id")]
    if not unresolved:
        return
    payload = api_get("/fixtures", {"date": TARGET_DATE, "timezone": "UTC"})
    fixtures = payload.get("response", [])
    for entry in unresolved:
        found = match_fixture(fixtures, entry["home_pattern"], entry["away_pattern"])
        if found:
            entry["data"].setdefault("match", {})["id"] = str(found["fixture"]["id"])
            entry["fixture"] = found


def update_score(entry: dict[str, Any], fixture: dict[str, Any], timestamp: str) -> None:
    data = entry["data"]
    match = data.setdefault("match", {})
    meta = data.setdefault("live_meta", {})
    match.update(
        {
            "id": str(fixture.get("fixture", {}).get("id")),
            "league": fixture.get("league", {}).get("name") or match.get("league"),
            "country": fixture.get("league", {}).get("country") or match.get("country"),
            "home": {
                "name": fixture.get("teams", {}).get("home", {}).get("name") or match.get("home", {}).get("name"),
                "short_name": match.get("home", {}).get("short_name") or fixture.get("teams", {}).get("home", {}).get("name"),
            },
            "away": {
                "name": fixture.get("teams", {}).get("away", {}).get("name") or match.get("away", {}).get("name"),
                "short_name": match.get("away", {}).get("short_name") or fixture.get("teams", {}).get("away", {}).get("name"),
            },
            "kickoff_utc": fixture.get("fixture", {}).get("date") or match.get("kickoff_utc"),
            "status": fixture.get("fixture", {}).get("status", {}).get("short") or match.get("status"),
            "status_long": fixture.get("fixture", {}).get("status", {}).get("long") or match.get("status_long"),
            "elapsed": fixture.get("fixture", {}).get("status", {}).get("elapsed"),
            "score": {
                "home": fixture.get("goals", {}).get("home"),
                "away": fixture.get("goals", {}).get("away"),
            },
            "halftime_score": {
                "home": fixture.get("score", {}).get("halftime", {}).get("home"),
                "away": fixture.get("score", {}).get("halftime", {}).get("away"),
            },
            "fulltime_score": {
                "home": fixture.get("score", {}).get("fulltime", {}).get("home"),
                "away": fixture.get("score", {}).get("fulltime", {}).get("away"),
            },
        }
    )
    data["source"] = "api-football"
    data["http_status"] = 200
    data["fetched_at_utc"] = timestamp
    data.setdefault("api_response", {})["fixture"] = fixture
    meta["score_updated_at"] = timestamp
    if match.get("status") in TERMINAL:
        meta["stopped_at"] = timestamp


def update_events(entry: dict[str, Any], timestamp: str) -> None:
    data = entry["data"]
    fixture_id = data.get("match", {}).get("id")
    if not fixture_id:
        return
    payload = api_get("/fixtures/events", {"fixture": fixture_id})
    raw_events = payload.get("response", [])
    data.setdefault("match", {})["events"] = map_events(raw_events)
    data.setdefault("api_response", {})["events"] = raw_events
    data.setdefault("live_meta", {})["events_updated_at"] = timestamp


def update_stats(entry: dict[str, Any], timestamp: str) -> None:
    data = entry["data"]
    match = data.setdefault("match", {})
    fixture_id = match.get("id")
    if not fixture_id:
        return
    payload = api_get("/fixtures/statistics", {"fixture": fixture_id})
    raw_stats = payload.get("response", [])
    fixture = data.get("api_response", {}).get("fixture") or {}
    home_id = fixture.get("teams", {}).get("home", {}).get("id")
    away_id = fixture.get("teams", {}).get("away", {}).get("id")
    home_values = stat_dict(raw_stats, home_id)
    away_values = stat_dict(raw_stats, away_id)
    old = match.get("stats") or {}
    events = data.get("api_response", {}).get("events") or []
    match["stats"] = {
        "attacks": pair(old, "attacks", home_values, away_values, ["Attacks", "Total Attacks"]),
        "dangerous_attacks": pair(old, "dangerous_attacks", home_values, away_values, ["Dangerous Attacks"]),
        "expected_goals": pair(old, "expected_goals", home_values, away_values, ["expected_goals", "Expected Goals"]),
        "possession": pair(old, "possession", home_values, away_values, ["Ball Possession"]),
        "shots": pair(old, "shots", home_values, away_values, ["Total Shots"]),
        "shots_on_target": pair(old, "shots_on_target", home_values, away_values, ["Shots on Goal"]),
        "shots_off_target": pair(old, "shots_off_target", home_values, away_values, ["Shots off Goal"]),
        "blocked_shots": pair(old, "blocked_shots", home_values, away_values, ["Blocked Shots"]),
        "shots_inside_box": pair(old, "shots_inside_box", home_values, away_values, ["Shots insidebox", "Shots inside box"]),
        "shots_outside_box": pair(old, "shots_outside_box", home_values, away_values, ["Shots outsidebox", "Shots outside box"]),
        "corners": pair(old, "corners", home_values, away_values, ["Corner Kicks"]),
        "fouls": pair(old, "fouls", home_values, away_values, ["Fouls"]),
        "offsides": pair(old, "offsides", home_values, away_values, ["Offsides"]),
        "goalkeeper_saves": pair(old, "goalkeeper_saves", home_values, away_values, ["Goalkeeper Saves"]),
        "total_passes": pair(old, "total_passes", home_values, away_values, ["Total passes"]),
        "accurate_passes": pair(old, "accurate_passes", home_values, away_values, ["Passes accurate"]),
        "pass_accuracy": pair(old, "pass_accuracy", home_values, away_values, ["Passes %"]),
        "yellow_cards": {
            "home": card_count(events, home_id, "Yellow Card"),
            "away": card_count(events, away_id, "Yellow Card"),
        },
        "red_cards": {
            "home": card_count(events, home_id, "Red Card"),
            "away": card_count(events, away_id, "Red Card"),
        },
        "provider_all": {"home": home_values, "away": away_values},
    }
    data.setdefault("api_response", {})["statistics"] = raw_stats
    data.setdefault("live_meta", {})["stats_updated_at"] = timestamp


def maybe_update_lineups(entry: dict[str, Any], timestamp: str) -> None:
    data = entry["data"]
    match = data.setdefault("match", {})
    meta = data.setdefault("live_meta", {})
    if meta.get("lineups_checked_at"):
        return
    status = str(match.get("status") or "").upper()
    kickoff = parse_time(match.get("kickoff_utc"))
    now = utc_now()
    # Only check once, from two hours before kickoff until kickoff itself.
    if status not in {"NS", "TBD"} or kickoff is None or not (now <= kickoff <= now + dt.timedelta(hours=2)):
        return
    fixture_id = match.get("id")
    if not fixture_id:
        return
    payload = api_get("/fixtures/lineups", {"fixture": fixture_id})
    data.setdefault("api_response", {})["lineups"] = payload.get("response", [])
    match["lineups"] = payload.get("response", [])
    meta["lineups_checked_at"] = timestamp


def main() -> None:
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
    subprocess.run(
        ["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
        check=True,
    )

    entries: list[dict[str, Any]] = []
    for filename, home_pattern, away_pattern in MATCHES:
        path = Path(filename)
        entries.append(
            {
                "path": path,
                "home_pattern": home_pattern,
                "away_pattern": away_pattern,
                "data": load_json(path),
            }
        )

    discover_ids(entries)
    started = time.monotonic()
    pass_number = 0

    while time.monotonic() - started < RUN_SECONDS:
        cycle_started = time.monotonic()
        timestamp = iso_now()
        active = [
            entry
            for entry in entries
            if str(entry["data"].get("match", {}).get("status") or "").upper() not in TERMINAL
        ]
        if not active:
            print("All matches are terminal; stopping API calls immediately.")
            break

        ids = [str(entry["data"].get("match", {}).get("id")) for entry in active if entry["data"].get("match", {}).get("id")]
        current: dict[str, dict[str, Any]] = {}
        if ids:
            payload = api_get("/fixtures", {"ids": "-".join(ids), "timezone": "UTC"})
            current = fixture_map(payload)

        changed_paths: list[Path] = []
        for entry in active:
            before = json.dumps(entry["data"], ensure_ascii=False, sort_keys=True)
            fixture_id = str(entry["data"].get("match", {}).get("id") or "")
            fixture = current.get(fixture_id) or entry.get("fixture")
            if fixture:
                update_score(entry, fixture, timestamp)
                status = str(entry["data"].get("match", {}).get("status") or "").upper()
                if status not in TERMINAL:
                    if pass_number % (EVENT_SECONDS // SCORE_SECONDS) == 0:
                        try:
                            update_events(entry, timestamp)
                        except Exception as exc:
                            print(f"events failed for {entry['path']}: {exc}")
                    if pass_number % (STATS_SECONDS // SCORE_SECONDS) == 0:
                        try:
                            update_stats(entry, timestamp)
                        except Exception as exc:
                            print(f"stats failed for {entry['path']}: {exc}")
                    try:
                        maybe_update_lineups(entry, timestamp)
                    except Exception as exc:
                        print(f"lineups failed for {entry['path']}: {exc}")

            after = json.dumps(entry["data"], ensure_ascii=False, sort_keys=True)
            if after != before:
                entry["path"].write_text(json.dumps(entry["data"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                changed_paths.append(entry["path"])

        git_publish(changed_paths, f"Live refresh {timestamp}")
        pass_number += 1
        elapsed = time.monotonic() - cycle_started
        time.sleep(max(0, SCORE_SECONDS - elapsed))


if __name__ == "__main__":
    main()
