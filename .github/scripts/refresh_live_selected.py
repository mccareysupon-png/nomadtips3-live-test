import json
import os
import re
import time
import unicodedata
import urllib.parse
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
CONFIG_PATH = Path("selected-live-matches.json")
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
HEADERS = {"x-apisports-key": KEY}


def api(path: str, params=None, tries: int = 3):
    if params:
        path = f"{path}?{urllib.parse.urlencode(params)}"
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


def finite_score(value):
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_name(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii").lower()
    tokens = re.findall(r"[a-z0-9]+", text)
    ignored = {"fc", "fk", "cf", "club", "women", "woman", "ladies", "lady", "w", "femenino", "feminin"}
    return [token for token in tokens if token not in ignored]


def name_score(api_name, candidates):
    api_tokens = normalize_name(api_name)
    api_compact = "".join(api_tokens)
    best = 0.0
    for candidate in candidates:
        wanted = normalize_name(candidate)
        wanted_compact = "".join(wanted)
        if not wanted or not api_tokens:
            continue
        overlap = len(set(api_tokens) & set(wanted)) / max(1, len(set(api_tokens) | set(wanted)))
        containment = 1.0 if wanted_compact in api_compact or api_compact in wanted_compact else 0.0
        prefix = 1.0 if api_tokens[0] == wanted[0] else 0.0
        best = max(best, overlap * 0.55 + containment * 0.35 + prefix * 0.10)
    return best


def aliases(selected, side):
    values = [selected.get(side)]
    values.extend(selected.get(f"{side}_aliases") or [])
    return [value for value in values if value]


def resolve_fixture_ids(selected_matches):
    changed = False
    unresolved = [item for item in selected_matches if not finite_score(item.get("fixture_id"))]
    if not unresolved:
        return changed

    by_date = {}
    for selected in unresolved:
        kickoff = parse_iso(selected.get("kickoff_utc"))
        date_key = kickoff.astimezone(timezone.utc).date().isoformat() if kickoff else CONFIG.get("selection_date")
        by_date.setdefault(date_key, []).append(selected)

    used_ids = {finite_score(item.get("fixture_id")) for item in selected_matches if finite_score(item.get("fixture_id"))}
    for date_key, items in by_date.items():
        rows = api("/fixtures", {"date": date_key, "timezone": "UTC"})
        for selected in items:
            target_kickoff = parse_iso(selected.get("kickoff_utc"))
            best_row = None
            best_value = -1.0
            for row in rows:
                fixture_id = finite_score((row.get("fixture") or {}).get("id"))
                if not fixture_id or fixture_id in used_ids:
                    continue
                teams = row.get("teams") or {}
                home_value = name_score((teams.get("home") or {}).get("name"), aliases(selected, "home"))
                away_value = name_score((teams.get("away") or {}).get("name"), aliases(selected, "away"))
                score = home_value + away_value
                provider_kickoff = parse_iso((row.get("fixture") or {}).get("date"))
                if target_kickoff and provider_kickoff:
                    delta_hours = abs((provider_kickoff - target_kickoff).total_seconds()) / 3600
                    if delta_hours <= 0.75:
                        score += 0.35
                    elif delta_hours <= 3:
                        score += 0.15
                    elif delta_hours > 8:
                        continue
                if home_value >= 0.45 and away_value >= 0.45 and score > best_value:
                    best_row = row
                    best_value = score
            if best_row:
                fixture = best_row.get("fixture") or {}
                fixture_id = int(fixture["id"])
                selected["fixture_id"] = fixture_id
                selected["provider_home"] = ((best_row.get("teams") or {}).get("home") or {}).get("name")
                selected["provider_away"] = ((best_row.get("teams") or {}).get("away") or {}).get("name")
                selected["provider_kickoff_utc"] = fixture.get("date")
                used_ids.add(fixture_id)
                changed = True
            else:
                print(f"Fixture resolution pending: {selected.get('home')} vs {selected.get('away')} on {date_key}")

    if changed:
        CONFIG_PATH.write_text(json.dumps(CONFIG, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


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


def is_stale_not_started(match, now_dt):
    status = str(match.get("status") or "").upper()
    if status not in NOT_STARTED:
        return False
    kickoff = parse_iso(match.get("kickoff_utc"))
    return bool(kickoff and now_dt >= kickoff + timedelta(minutes=STALE_NS_MINUTES))


def final_scores(match):
    fulltime = match.get("fulltime_score") or {}
    current = match.get("score") or {}
    home_score = finite_score(fulltime.get("home"))
    away_score = finite_score(fulltime.get("away"))
    if home_score is None or away_score is None:
        home_score = finite_score(current.get("home"))
        away_score = finite_score(current.get("away"))
    return home_score, away_score


def settle_main(selected, match, now_dt):
    status = str(match.get("status") or "").upper()
    auto_void = is_stale_not_started(match, now_dt)
    if auto_void or status in VOID_STATUSES:
        return "void", None, None, auto_void
    if status not in TERMINAL:
        return "pending", None, None, False
    home_score, away_score = final_scores(match)
    if home_score is None or away_score is None:
        return "pending", None, None, False
    actual = "home" if home_score > away_score else "away" if away_score > home_score else "draw"
    outcome = "correct" if actual == str(selected.get("pick_side") or "").lower() else "incorrect"
    return outcome, home_score, away_score, False


def market_config(selected, key):
    markets = selected.get("markets") or {}
    value = markets.get(key)
    if isinstance(value, dict):
        return value
    legacy_key = {"doubleChance": "double_chance", "asianHandicap": "asian_handicap"}.get(key, key)
    legacy = selected.get(legacy_key)
    return {"pick": legacy} if legacy else {"pick": "N/A"}


def standard_market_result(market, outcome):
    return {
        "pick": market.get("pick") or "N/A",
        "odds": market.get("odds"),
        "oddsStatus": "LOCKED" if market.get("odds") else "PENDING",
        "confidence": market.get("confidence", 0),
        "outcome": outcome,
    }


def settle_btts(selected, match, auto_void):
    market = market_config(selected, "btts")
    status = str(match.get("status") or "").upper()
    if auto_void or status in VOID_STATUSES:
        return standard_market_result(market, "void")
    if status not in TERMINAL:
        return standard_market_result(market, "pending")
    home_score, away_score = final_scores(match)
    if home_score is None or away_score is None:
        return standard_market_result(market, "pending")
    actual = "yes" if home_score > 0 and away_score > 0 else "no"
    chosen = str(market.get("pick") or "").strip().lower()
    return standard_market_result(market, "correct" if chosen == actual else "incorrect")


def settle_double_chance(selected, match, auto_void):
    market = market_config(selected, "doubleChance")
    status = str(match.get("status") or "").upper()
    if auto_void or status in VOID_STATUSES:
        return standard_market_result(market, "void")
    if status not in TERMINAL:
        return standard_market_result(market, "pending")
    home_score, away_score = final_scores(match)
    if home_score is None or away_score is None:
        return standard_market_result(market, "pending")
    actual = "1" if home_score > away_score else "2" if away_score > home_score else "X"
    chosen = str(market.get("code") or market.get("pick") or "").upper().replace(" ", "")[:2]
    accepted = {"1X": {"1", "X"}, "X2": {"X", "2"}, "12": {"1", "2"}}
    return standard_market_result(market, "correct" if actual in accepted.get(chosen, set()) else "incorrect")


def component_settlement(margin, line):
    adjusted = margin + line
    if adjusted > 1e-9:
        return "win"
    if adjusted < -1e-9:
        return "loss"
    return "push"


def asian_settlement(margin, line):
    quarter = int(round(float(line) * 4))
    if quarter % 2 == 0:
        return component_settlement(margin, quarter / 4)
    parts = [component_settlement(margin, (quarter - 1) / 4), component_settlement(margin, (quarter + 1) / 4)]
    combo = tuple(sorted(parts))
    if combo == ("win", "win"):
        return "win"
    if combo == ("push", "win"):
        return "half-win"
    if combo == ("push", "push"):
        return "push"
    if combo == ("loss", "push"):
        return "half-loss"
    if combo == ("loss", "loss"):
        return "loss"
    return "push"


def settle_asian_handicap(selected, match, auto_void):
    market = market_config(selected, "asianHandicap")
    result = standard_market_result(market, "pending")
    status = str(match.get("status") or "").upper()
    if auto_void or status in VOID_STATUSES:
        result["outcome"] = "void"
        result["settlement"] = "void"
        return result
    if status not in TERMINAL:
        return result
    home_score, away_score = final_scores(match)
    if home_score is None or away_score is None:
        return result
    side = str(market.get("side") or selected.get("pick_side") or "").lower()
    line = market.get("line")
    if side not in {"home", "away"} or line is None:
        return result
    margin = home_score - away_score if side == "home" else away_score - home_score
    settlement = asian_settlement(margin, float(line))
    result["outcome"] = settlement
    result["settlement"] = settlement
    result["line"] = float(line)
    result["side"] = side
    return result


def aggregate_standard(items, key):
    values = [item["markets"][key] for item in items if item.get("counted")]
    correct = sum(value.get("outcome") == "correct" for value in values)
    incorrect = sum(value.get("outcome") == "incorrect" for value in values)
    voids = sum(value.get("outcome") == "void" for value in values)
    pending = len(values) - correct - incorrect - voids
    settled = correct + incorrect
    return {
        "total": len(values), "correct": correct, "incorrect": incorrect, "void": voids,
        "pending": pending, "settled": settled,
        "accuracy": round(correct / settled * 100, 2) if settled else 0.0,
    }


def aggregate_asian(items):
    values = [item["markets"]["asianHandicap"] for item in items if item.get("counted")]
    labels = [value.get("outcome", "pending") for value in values]
    counts = {name: labels.count(name) for name in ["win", "half-win", "push", "half-loss", "loss", "void", "pending"]}
    decisions = counts["win"] + counts["half-win"] + counts["half-loss"] + counts["loss"]
    counts.update({
        "total": len(values),
        "decisions": decisions,
        "weightedRate": round((counts["win"] + counts["half-win"] * 0.5) / decisions * 100, 2) if decisions else 0.0,
    })
    return counts


selected_matches = CONFIG.get("matches") or []
config_changed = resolve_fixture_ids(selected_matches)
resolved_ids = [finite_score(item.get("fixture_id")) for item in selected_matches]
selected_ids = {value for value in resolved_ids if value}
now_dt = datetime.now(timezone.utc)
now_text = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

current_map = {}
if selected_ids:
    rows = api("/fixtures", {"ids": "-".join(str(value) for value in sorted(selected_ids)), "timezone": "UTC"})
    current_map = {int((row.get("fixture") or {}).get("id")): row for row in rows}

active_files = []
live_count = 0
next_kickoff_seconds = None
result_feed = []

for selected in selected_matches:
    fixture_id = finite_score(selected.get("fixture_id"))
    client_fixture_id = str(selected.get("client_fixture_id") or fixture_id or selected.get("slug"))
    path = Path(f"live-data-{selected['slug']}.json")
    previous = read_json(path)
    old_match = previous.get("match") or {}
    old_status = str(old_match.get("status") or "NS").upper()
    row = current_map.get(fixture_id) if fixture_id else None
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
                stats_rows = api("/fixtures/statistics", {"fixture": fixture_id})
            except Exception as error:
                print(f"Statistics unavailable for {fixture_id}: {error}")
            try:
                events_rows = api("/fixtures/events", {"fixture": fixture_id})
            except Exception as error:
                print(f"Events unavailable for {fixture_id}: {error}")

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
                "client_fixture_id": client_fixture_id,
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
                "btts": market_config(selected, "btts").get("pick"),
                "double_chance": market_config(selected, "doubleChance").get("pick"),
                "asian_handicap": market_config(selected, "asianHandicap").get("pick"),
                "markets": selected.get("markets") or {},
                "reason": selected["reason"],
                "stats": match_stats,
                "events": parse_events(events_rows) if events_rows else old_match.get("events") or [],
            },
        }
        path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        previous = output
        old_match = output["match"]
        kickoff_value = old_match["kickoff_utc"]
    elif not path.exists():
        placeholder = {
            "source": "api-football",
            "fetched_at_utc": now_text,
            "http_status": 200,
            "selection_date": CONFIG.get("selection_date"),
            "locked_at_utc": CONFIG.get("locked_at_utc"),
            "match": {
                "id": str(fixture_id) if fixture_id else None,
                "client_fixture_id": client_fixture_id,
                "league": selected.get("league"),
                "country": selected.get("country"),
                "home": {"name": selected["home"], "short_name": selected["home"]},
                "away": {"name": selected["away"], "short_name": selected["away"]},
                "kickoff_utc": selected.get("kickoff_utc"),
                "status": "NS" if fixture_id else "TBD",
                "status_long": "Waiting for provider fixture resolution" if not fixture_id else "Not Started",
                "elapsed": None,
                "score": {"home": None, "away": None},
                "fulltime_score": {"home": None, "away": None},
                "pick": selected["pick"], "pick_side": selected["pick_side"], "odds": selected["odds"],
                "confidence": selected["confidence"], "predicted_score": selected["predicted_score"],
                "btts": market_config(selected, "btts").get("pick"),
                "double_chance": market_config(selected, "doubleChance").get("pick"),
                "asian_handicap": market_config(selected, "asianHandicap").get("pick"),
                "markets": selected.get("markets") or {}, "reason": selected["reason"], "stats": {}, "events": [],
            },
        }
        path.write_text(json.dumps(placeholder, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        previous = placeholder
        old_match = placeholder["match"]

    match = read_json(path).get("match") or old_match
    status = str(match.get("status") or current_status or "NS").upper()
    outcome, final_home, final_away, auto_void = settle_main(selected, match, now_dt)
    effective_status = "NOT_CONFIRMED" if auto_void else status
    result_confirmed = outcome != "pending" and (status in TERMINAL or auto_void)
    current_score = match.get("score") or {}
    markets = {
        "btts": settle_btts(selected, match, auto_void),
        "doubleChance": settle_double_chance(selected, match, auto_void),
        "asianHandicap": settle_asian_handicap(selected, match, auto_void),
    }

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
        "fixtureId": client_fixture_id,
        "providerFixtureId": str(fixture_id) if fixture_id else None,
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
        "markets": markets,
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
market_summary = {
    "btts": aggregate_standard(result_feed, "btts"),
    "doubleChance": aggregate_standard(result_feed, "doubleChance"),
    "asianHandicap": aggregate_asian(result_feed),
}

Path("live-matches.json").write_text(json.dumps({
    "selection_date": CONFIG.get("selection_date"),
    "locked_at_utc": CONFIG.get("locked_at_utc"),
    "files": active_files,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
Path("result-feed.json").write_text(json.dumps({
    "selectionDate": CONFIG.get("selection_date"),
    "generatedAt": now_text,
    "source": "API-FOOTBALL",
    "staleNotStartedMinutes": STALE_NS_MINUTES,
    "summary": summary,
    "marketSummary": market_summary,
    "results": result_feed,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
Path("/tmp/nomad-live-state.json").write_text(json.dumps({
    "active": len(active_files),
    "live": live_count,
    "next_kickoff_seconds": next_kickoff_seconds,
    "all_settled": summary["allSettled"],
}), encoding="utf-8")
print(json.dumps({
    "active": len(active_files), "live": live_count, "detail_refresh": DETAIL_REFRESH,
    "next_kickoff_seconds": next_kickoff_seconds, "result_feed": len(result_feed),
    "all_settled": summary["allSettled"], "scope": "selected_matches_only",
    "resolved_fixture_ids": len(selected_ids), "config_changed": config_changed,
}))
