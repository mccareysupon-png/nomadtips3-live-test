import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KEY = os.environ["API_FOOTBALL_KEY"]
BASE = "https://v3.football.api-sports.io"
TERMINAL = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO", "PST"}
VOID_STATUSES = {"CANC", "ABD", "AWD", "WO", "PST"}
LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"}
NOT_STARTED = {"NS", "TBD"}
DETAIL_REFRESH = os.environ.get("DETAIL_REFRESH") == "1"
STALE_NS_MINUTES = max(120, int(os.environ.get("STALE_NS_MINUTES", "180")))
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


def finite_score(value):
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def is_stale_not_started(match, now_dt):
    status = str(match.get("status") or "").upper()
    if status not in NOT_STARTED:
        return False
    kickoff = parse_iso(match.get("kickoff_utc"))
    if not kickoff:
        return False
    return now_dt >= kickoff + timedelta(minutes=STALE_NS_MINUTES)


def settle_result(selected, match, now_dt):
    status = str(match.get("status") or "").upper()
    auto_void = is_stale_not_started(match, now_dt)
    if auto_void or status in VOID_STATUSES:
        return "void", None, None, auto_void
    if status not in TERMINAL:
        return "pending", None, None, False

    fulltime = match.get("fulltime_score") or {}
    current = match.get("score") or {}
    home_score = finite_score(fulltime.get("home"))
    away_score = finite_score(fulltime.get("away"))
    if home_score is None or away_score is None:
        home_score = finite_score(current.get("home"))
        away_score = finite_score(current.get("away"))
    if home_score is None or away_score is None:
        return "pending", None, None, False

    actual = "home" if home_score > away_score else "away" if away_score > home_score else "draw"
    pick_side = str(selected.get("pick_side") or "").lower()
    outcome = "correct" if actual == pick_side else "incorrect"
    return outcome, home_score, away_score, False


selected_matches = CONFIG.get("matches") or []
selected_ids = {int(item["fixture_id"]) for item in selected_matches}
now_dt = datetime.now(timezone.utc)
now_text = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

live_rows = api("/fixtures?live=all")
live_map = {
    int((row.get("fixture") or {}).get("id")): row
    for row in live_rows
    if int((row.get("fixture") or {}).get("id") or 0) in selected_ids
}

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
result_feed = []

for selected in selected_matches:
    fixture_id = int(selected["fixture_id"])
    path = Path(f"live-data-{selected['slug']}.json")
    previous = read_json(path)
    old_match = previous.get("match") or {}
    old_status = str(old_match.get("status") or "NS").upper()
    row = live_map.get(fixture_id) or detail_map.get(fixture_id)

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
        previous = output
        old_match = output["match"]
        kickoff_value = old_match["kickoff_utc"]

    match = read_json(path).get("match") or old_match
    status = str(match.get("status") or current_status or "NS").upper()
    outcome, final_home, final_away, auto_void = settle_result(selected, match, now_dt)
    effective_status = "NOT_CONFIRMED" if auto_void else status
    result_confirmed = outcome != "pending" and (status in TERMINAL or auto_void)
    current_score = match.get("score") or {}

    if not result_confirmed:
        active_files.append(path.name)
    if effective_status in LIVE:
        live_count += 1
    elif not result_confirmed:
        kickoff = parse_iso(match.get("kickoff_utc") or kickoff_value)
        if kickoff:
            seconds = (kickoff - now_dt).total_seconds()
            if seconds > 0 and (next_kickoff_seconds is None or seconds < next_kickoff_seconds):
                next_kickoff_seconds = seconds

    counted = str(selected.get("pick_side") or "").lower() in {"home", "away", "draw"}
    result_feed.append({
        "fixtureId": str(fixture_id),
        "slug": selected["slug"],
        "home": selected["home"],
        "away": selected["away"],
        "kickoffUtc": match.get("kickoff_utc") or selected.get("kickoff_utc"),
        "status": effective_status,
        "providerStatus": status,
        "statusLong": "Match not confirmed after scheduled kickoff" if auto_void else match.get("status_long"),
        "elapsed": match.get("elapsed"),
        "homeScore": final_home if final_home is not None else finite_score(current_score.get("home")),
        "awayScore": final_away if final_away is not None else finite_score(current_score.get("away")),
        "outcome": outcome,
        "resultConfirmed": result_confirmed,
        "autoVoid": auto_void,
        "voidReason": "Fixture remained not started for three hours after kickoff" if auto_void else None,
        "resultSource": "API-FOOTBALL / NOMAD VALIDATION" if auto_void else "API-FOOTBALL",
        "updatedAt": previous.get("fetched_at_utc") or now_text,
        "counted": counted,
    })

counted_results = [item for item in result_feed if item["counted"]]
summary = {
    "total": len(counted_results),
    "correct": sum(item["outcome"] == "correct" for item in counted_results),
    "incorrect": sum(item["outcome"] == "incorrect" for item in counted_results),
    "void": sum(item["outcome"] == "void" for item in counted_results),
    "pending": sum(item["outcome"] == "pending" for item in counted_results),
}
summary["settled"] = summary["correct"] + summary["incorrect"]
summary["allSettled"] = summary["pending"] == 0
summary["accuracy"] = round((summary["correct"] / summary["settled"]) * 100, 2) if summary["settled"] else 0.0
summary["finalizedAt"] = now_text if summary["allSettled"] else None

Path("live-matches.json").write_text(
    json.dumps({
        "selection_date": CONFIG.get("selection_date"),
        "locked_at_utc": CONFIG.get("locked_at_utc"),
        "files": active_files,
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
Path("result-feed.json").write_text(
    json.dumps({
        "selectionDate": CONFIG.get("selection_date"),
        "generatedAt": now_text,
        "source": "API-FOOTBALL",
        "staleNotStartedMinutes": STALE_NS_MINUTES,
        "summary": summary,
        "results": result_feed,
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
Path("/tmp/nomad-live-state.json").write_text(
    json.dumps({
        "active": len(active_files),
        "live": live_count,
        "next_kickoff_seconds": next_kickoff_seconds,
        "all_settled": summary["allSettled"],
    }),
    encoding="utf-8",
)
print(json.dumps({
    "active": len(active_files),
    "live": live_count,
    "detail_refresh": DETAIL_REFRESH,
    "next_kickoff_seconds": next_kickoff_seconds,
    "result_feed": len(result_feed),
    "all_settled": summary["allSettled"],
    "scope": "selected_ids_only",
}))
