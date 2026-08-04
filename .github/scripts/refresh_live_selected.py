import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

KEY = os.environ["API_FOOTBALL_KEY"]
BASE = "https://v3.football.api-sports.io"
TERMINAL = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO", "PST"}
LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"}
DETAIL_REFRESH = os.environ.get("DETAIL_REFRESH") == "1"
CONFIG = json.loads(Path("selected-live-matches.json").read_text(encoding="utf-8"))
HEADERS = {"x-apisports-key": KEY}


def api(path: str, tries: int = 3):
    last_error = None
    for attempt in range(tries):
        try:
            request = urllib.request.Request(BASE + path, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.load(response)
            if payload.get("errors"):
                raise RuntimeError(str(payload["errors"]))
            return payload.get("response") or []
        except Exception as error:
            last_error = error
            time.sleep(2 + attempt * 2)
    raise last_error


def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def read_json(path: Path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def value_for(rows, team_id, label):
    for row in rows:
        if (row.get("team") or {}).get("id") != team_id:
            continue
        for item in row.get("statistics") or []:
            if item.get("type") == label:
                return item.get("value")
    return None


def parse_events(rows):
    events = []
    for event in rows:
        event_time = event.get("time") or {}
        player = event.get("player") or {}
        assist = event.get("assist") or {}
        team = event.get("team") or {}
        events.append({
            "minute": event_time.get("elapsed"),
            "extra": event_time.get("extra"),
            "team": team.get("name"),
            "player": player.get("name"),
            "assist": assist.get("name"),
            "type": event.get("type"),
            "detail": event.get("detail"),
        })
    return events


selected_matches = CONFIG.get("matches") or []
selected_ids = {int(item["fixture_id"]) for item in selected_matches}
now_dt = datetime.now(timezone.utc)
now_text = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

# One score request covers every live fixture, then only selected fixture IDs are kept.
live_rows = api("/fixtures?live=all")
live_map = {
    int((row.get("fixture") or {}).get("id")): row
    for row in live_rows
    if int((row.get("fixture") or {}).get("id") or 0) in selected_ids
}

# A wider fixture snapshot is used only on the slower detail cycle.
detail_map = {}
if DETAIL_REFRESH and CONFIG.get("selection_date"):
    rows = api(f"/fixtures?date={CONFIG['selection_date']}")
    detail_map = {
        int((row.get("fixture") or {}).get("id")): row
        for row in rows
        if int((row.get("fixture") or {}).get("id") or 0) in selected_ids
    }

active_files = []
live_count = 0
next_kickoff_seconds = None

for selected in selected_matches:
    fixture_id = int(selected["fixture_id"])
    path = Path(f"live-data-{selected['slug']}.json")
    previous = read_json(path)
    old_match = previous.get("match") or {}
    old_status = str(old_match.get("status") or "NS").upper()
    row = live_map.get(fixture_id) or detail_map.get(fixture_id)

    # If a selected match was live but disappeared from live=all, verify it directly.
    if row is None and old_status in LIVE:
        rows = api(f"/fixtures?id={fixture_id}")
        row = rows[0] if rows else None

    current_status = old_status
    kickoff_value = old_match.get("kickoff_utc") or selected.get("kickoff_utc")

    if row is not None:
        fixture = row.get("fixture") or {}
        league = row.get("league") or {}
        teams = row.get("teams") or {}
        goals = row.get("goals") or {}
        score = row.get("score") or {}
        home = teams.get("home") or {}
        away = teams.get("away") or {}
        current_status = str((fixture.get("status") or {}).get("short") or old_status or "NS").upper()

        stats_rows = []
        events_rows = []
        if DETAIL_REFRESH and current_status in LIVE:
            try:
                stats_rows = api(f"/fixtures/statistics?fixture={fixture_id}")
            except Exception:
                stats_rows = []
            try:
                events_rows = api(f"/fixtures/events?fixture={fixture_id}")
            except Exception:
                events_rows = []

        old_stats = old_match.get("stats") or {}

        def keep(kind, label):
            home_value = value_for(stats_rows, home.get("id"), label) if stats_rows else None
            away_value = value_for(stats_rows, away.get("id"), label) if stats_rows else None
            old = old_stats.get(kind) or {}
            return {
                "home": old.get("home") if home_value is None else home_value,
                "away": old.get("away") if away_value is None else away_value,
            }

        match_stats = {
            "attacks": keep("attacks", "Attacks"),
            "dangerous_attacks": keep("dangerous_attacks", "Dangerous Attacks"),
            "expected_goals": keep("expected_goals", "expected_goals"),
            "possession": keep("possession", "Ball Possession"),
            "shots": keep("shots", "Total Shots"),
            "shots_on_target": keep("shots_on_target", "Shots on Goal"),
            "shots_off_target": keep("shots_off_target", "Shots off Goal"),
            "blocked_shots": keep("blocked_shots", "Blocked Shots"),
            "shots_inside_box": keep("shots_inside_box", "Shots insidebox"),
            "shots_outside_box": keep("shots_outside_box", "Shots outsidebox"),
            "corners": keep("corners", "Corner Kicks"),
            "fouls": keep("fouls", "Fouls"),
            "offsides": keep("offsides", "Offsides"),
            "goalkeeper_saves": keep("goalkeeper_saves", "Goalkeeper Saves"),
            "total_passes": keep("total_passes", "Total passes"),
            "accurate_passes": keep("accurate_passes", "Passes accurate"),
            "pass_accuracy": keep("pass_accuracy", "Passes %"),
            "yellow_cards": keep("yellow_cards", "Yellow Cards"),
            "red_cards": keep("red_cards", "Red Cards"),
        }

        output = {
            "source": "api-football",
            "fetched_at_utc": now_text,
            "http_status": 200,
            "selection_date": CONFIG.get("selection_date"),
            "locked_at_utc": CONFIG.get("locked_at_utc"),
            "match": {
                "id": str(fixture.get("id") or fixture_id),
                "sport": "football",
                "league": league.get("name") or old_match.get("league"),
                "country": league.get("country") or old_match.get("country"),
                "home": {"name": home.get("name") or selected["home"], "short_name": home.get("name") or selected["home"]},
                "away": {"name": away.get("name") or selected["away"], "short_name": away.get("name") or selected["away"]},
                "kickoff_utc": fixture.get("date") or selected.get("kickoff_utc"),
                "status": current_status,
                "status_long": (fixture.get("status") or {}).get("long") or old_match.get("status_long"),
                "elapsed": (fixture.get("status") or {}).get("elapsed"),
                "score": {"home": goals.get("home"), "away": goals.get("away")},
                "halftime_score": score.get("halftime") or old_match.get("halftime_score") or {"home": None, "away": None},
                "fulltime_score": score.get("fulltime") or old_match.get("fulltime_score") or {"home": None, "away": None},
                "pick": selected["pick"],
                "pick_side": selected["pick_side"],
                "odds": selected["odds"],
                "confidence": selected["confidence"],
                "predicted_score": selected["predicted_score"],
                "btts": selected["btts"],
                "double_chance": selected["double_chance"],
                "asian_handicap": selected["asian_handicap"],
                "reason": selected["reason"],
                "stats": match_stats,
                "events": parse_events(events_rows) if events_rows else old_match.get("events") or [],
            },
        }
        path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        kickoff_value = output["match"]["kickoff_utc"]

    if current_status not in TERMINAL:
        active_files.append(path.name)
    if current_status in LIVE:
        live_count += 1
    elif current_status not in TERMINAL:
        kickoff = parse_iso(kickoff_value)
        if kickoff:
            seconds = (kickoff - now_dt).total_seconds()
            if seconds > 0 and (next_kickoff_seconds is None or seconds < next_kickoff_seconds):
                next_kickoff_seconds = seconds

Path("live-matches.json").write_text(
    json.dumps({
        "selection_date": CONFIG.get("selection_date"),
        "locked_at_utc": CONFIG.get("locked_at_utc"),
        "files": active_files,
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
Path("/tmp/nomad-live-state.json").write_text(
    json.dumps({
        "active": len(active_files),
        "live": live_count,
        "next_kickoff_seconds": next_kickoff_seconds,
    }),
    encoding="utf-8",
)
print(json.dumps({
    "active": len(active_files),
    "live": live_count,
    "detail_refresh": DETAIL_REFRESH,
    "next_kickoff_seconds": next_kickoff_seconds,
    "scope": "selected_ids_only",
}))
