import json
import os
import shutil
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import enrich_selected_odds as odds_helper

KEY = os.environ["API_FOOTBALL_KEY"]
BASE = "https://v3.football.api-sports.io"
HEADERS = {"x-apisports-key": KEY}
RULES_PATH = Path("config/nomad-auto-rules.json")
SELECTED_PATH = Path("selected-live-matches.json")
RESULT_PATH = Path("result-feed.json")
STATE_PATH = Path("auto-selection-state.json")
REPORT_PATH = Path("auto-selection-report.json")
ARCHIVE_DIR = Path("archive/auto-selections")
NOT_STARTED = {"NS", "TBD"}
API_CALLS = 0
API_LOCK = threading.Lock()


def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def api(path, params=None, tries=3):
    global API_CALLS
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
            with API_LOCK:
                API_CALLS += 1
            return payload.get("response") or []
        except Exception as error:
            last_error = error
            time.sleep(2 + attempt * 2)
    raise last_error


def parse_iso(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def finite_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_score(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def fixture_status(row):
    return str((((row.get("fixture") or {}).get("status") or {}).get("short")) or "").upper()


def fixture_kickoff(row):
    return parse_iso((row.get("fixture") or {}).get("date"))


def fetch_window_fixtures(start_local, cutoff_local, zone):
    rows = []
    current = start_local.date()
    while current <= cutoff_local.date():
        rows.extend(api("/fixtures", {"date": current.isoformat(), "timezone": str(zone)}))
        current += timedelta(days=1)
    unique = {}
    for row in rows:
        fixture_id = finite_int((row.get("fixture") or {}).get("id"))
        kickoff = fixture_kickoff(row)
        if not fixture_id or not kickoff or fixture_status(row) not in NOT_STARTED:
            continue
        local_kickoff = kickoff.astimezone(zone)
        if start_local <= local_kickoff <= cutoff_local:
            unique[fixture_id] = row
    return sorted(unique.values(), key=lambda row: fixture_kickoff(row) or datetime.max.replace(tzinfo=timezone.utc))


def fetch_team_history(team_id, count):
    return api("/fixtures", {"team": int(team_id), "last": int(count), "status": "FT", "timezone": "UTC"})


def result_for_team(row, team_id):
    teams = row.get("teams") or {}
    home = teams.get("home") or {}
    away = teams.get("away") or {}
    goals = row.get("goals") or {}
    home_id = finite_int(home.get("id"))
    away_id = finite_int(away.get("id"))
    home_goals = safe_score(goals.get("home"))
    away_goals = safe_score(goals.get("away"))
    if team_id not in {home_id, away_id} or home_goals is None or away_goals is None:
        return None
    is_home = team_id == home_id
    gf = home_goals if is_home else away_goals
    ga = away_goals if is_home else home_goals
    return {
        "is_home": is_home,
        "gf": gf,
        "ga": ga,
        "points": 3 if gf > ga else 1 if gf == ga else 0,
        "opponent_id": away_id if is_home else home_id,
        "btts": gf > 0 and ga > 0,
    }


def summarize(history, team_id, sample, venue=None):
    games = []
    ordered = sorted(history, key=lambda item: fixture_kickoff(item) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    for row in ordered:
        item = result_for_team(row, team_id)
        if not item:
            continue
        if venue == "home" and not item["is_home"]:
            continue
        if venue == "away" and item["is_home"]:
            continue
        games.append(item)
        if len(games) >= sample:
            break
    n = len(games)
    if not n:
        return {"sample": 0, "ppg": 0.0, "gfpg": 0.0, "gapg": 0.0, "gdpg": 0.0, "win_rate": 0.0, "btts_rate": 0.0, "games": []}
    points = sum(item["points"] for item in games)
    gf = sum(item["gf"] for item in games)
    ga = sum(item["ga"] for item in games)
    return {
        "sample": n,
        "ppg": points / n,
        "gfpg": gf / n,
        "gapg": ga / n,
        "gdpg": (gf - ga) / n,
        "win_rate": sum(item["points"] == 3 for item in games) / n,
        "btts_rate": sum(item["btts"] for item in games) / n,
        "games": games,
    }


def common_opponent_edge(home_summary, away_summary):
    home_map, away_map = {}, {}
    for item in home_summary.get("games") or []:
        if item.get("opponent_id"):
            home_map.setdefault(item["opponent_id"], []).append(item["points"])
    for item in away_summary.get("games") or []:
        if item.get("opponent_id"):
            away_map.setdefault(item["opponent_id"], []).append(item["points"])
    common = sorted(set(home_map) & set(away_map))
    if not common:
        return 0.0, 0
    differences = []
    for opponent_id in common:
        hp = sum(home_map[opponent_id]) / len(home_map[opponent_id])
        ap = sum(away_map[opponent_id]) / len(away_map[opponent_id])
        differences.append((hp - ap) / 3.0)
    return sum(differences) / len(differences), len(common)


def predicted_score(side, selected_metrics, opponent_metrics):
    selected_goals = max(0.4, (selected_metrics["gfpg"] + opponent_metrics["gapg"]) / 2)
    opponent_goals = max(0.2, (opponent_metrics["gfpg"] + selected_metrics["gapg"]) / 2)
    selected_score = min(4, max(1, int(round(selected_goals))))
    opponent_score = min(3, max(0, int(round(opponent_goals))))
    if selected_score <= opponent_score:
        selected_score = min(4, opponent_score + 1)
    return f"{selected_score}–{opponent_score}" if side == "home" else f"{opponent_score}–{selected_score}"


def market_shell(pick, confidence, **extra):
    return {"pick": pick, "odds": None, "confidence": confidence, "bookmaker": "N/A", "oddsStatus": "N/A", "oddsSource": "NOT FOUND", **extra}


def public_metrics(summary):
    return {key: round(value, 4) if isinstance(value, float) else value for key, value in summary.items() if key != "games"}


def make_candidate(row, histories, rules, locked_at):
    fixture = row.get("fixture") or {}
    league = row.get("league") or {}
    teams = row.get("teams") or {}
    home = teams.get("home") or {}
    away = teams.get("away") or {}
    home_id = finite_int(home.get("id"))
    away_id = finite_int(away.get("id"))
    fixture_id = finite_int(fixture.get("id"))
    if not home_id or not away_id or not fixture_id:
        return None, "missing team or fixture id"

    overall_n = int(rules["overall_sample"])
    venue_n = int(rules["venue_sample"])
    minimum_sample = int(rules["minimum_sample"])
    home_overall = summarize(histories.get(home_id, []), home_id, overall_n)
    away_overall = summarize(histories.get(away_id, []), away_id, overall_n)
    home_venue = summarize(histories.get(home_id, []), home_id, venue_n, "home")
    away_venue = summarize(histories.get(away_id, []), away_id, venue_n, "away")
    if min(home_overall["sample"], away_overall["sample"], home_venue["sample"], away_venue["sample"]) < minimum_sample:
        return None, "insufficient recent or venue-specific sample"

    common_edge, common_count = common_opponent_edge(home_overall, away_overall)
    score = (
        (home_overall["ppg"] - away_overall["ppg"]) * 0.34
        + (home_venue["ppg"] - away_venue["ppg"]) * 0.36
        + (home_overall["gdpg"] - away_overall["gdpg"]) * 0.18
        + common_edge * 0.12
    )
    if abs(score) < float(rules["minimum_strength_score"]):
        return None, "strength score below threshold"

    side = "home" if score > 0 else "away"
    selected_overall = home_overall if side == "home" else away_overall
    opponent_overall = away_overall if side == "home" else home_overall
    selected_venue = home_venue if side == "home" else away_venue
    opponent_venue = away_venue if side == "home" else home_venue
    if selected_overall["ppg"] - opponent_overall["ppg"] < float(rules["minimum_overall_ppg_edge"]):
        return None, "overall form edge below threshold"
    if selected_venue["ppg"] - opponent_venue["ppg"] < float(rules["minimum_venue_ppg_edge"]):
        return None, "home/away split edge below threshold"

    selected_name = home.get("name") if side == "home" else away.get("name")
    confidence = int(rules["fixed_confidence"])
    btts_rate = (home_overall["btts_rate"] + away_overall["btts_rate"]) / 2
    btts_pick = "Yes" if btts_rate >= 0.55 else "No"
    dc_code = "1X" if side == "home" else "X2"
    handicap_line = -0.5 if abs(score) >= 1.05 else 0.0
    handicap_label = f"{selected_name} {handicap_line:+g}".replace("+0", "0")
    kickoff = fixture_kickoff(row)
    selected = {
        "client_fixture_id": f"AUTO-{fixture_id}",
        "fixture_id": fixture_id,
        "slug": f"auto-{fixture_id}",
        "league": league.get("name") or "Unknown competition",
        "country": league.get("country"),
        "home": home.get("name"),
        "home_aliases": [home.get("name")],
        "away": away.get("name"),
        "away_aliases": [away.get("name")],
        "kickoff_utc": kickoff.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "pick": f"{selected_name} Win",
        "pick_side": side,
        "odds": None,
        "bookmaker": "N/A",
        "oddsStatus": "N/A",
        "oddsSource": "NOT FOUND",
        "oddsLockedAt": locked_at,
        "confidence": confidence,
        "predicted_score": predicted_score(side, selected_venue, opponent_venue),
        "markets": {
            "btts": market_shell(btts_pick, confidence),
            "doubleChance": market_shell(f"{dc_code} — {selected_name} or Draw", confidence, code=dc_code),
            "asianHandicap": market_shell(handicap_label, confidence, side=side, line=handicap_line),
        },
        "reason": (
            f"Automatic NOMAD screening: overall PPG {selected_overall['ppg']:.2f} vs {opponent_overall['ppg']:.2f}; "
            f"venue PPG {selected_venue['ppg']:.2f} vs {opponent_venue['ppg']:.2f}; "
            f"goal-difference rate {selected_overall['gdpg']:.2f} vs {opponent_overall['gdpg']:.2f}."
        ),
        "abc_result": f"Common-opponent edge {common_edge:+.2f} from {common_count} shared opponent(s)" if common_count else "LIMITED — no reliable common-opponent sample",
        "auto_analysis": {
            "strengthScore": round(score, 4),
            "absoluteStrength": round(abs(score), 4),
            "homeOverall": public_metrics(home_overall),
            "awayOverall": public_metrics(away_overall),
            "homeVenue": public_metrics(home_venue),
            "awayVenue": public_metrics(away_venue),
            "commonOpponentCount": common_count,
            "commonOpponentEdge": round(common_edge, 4),
        },
    }
    return selected, None


def lock_odds(selected, locked_at, minimum_main_odds):
    rows = api("/odds", {"fixture": int(selected["fixture_id"])})
    candidates = odds_helper.extract_candidates(rows, selected)
    main_options = candidates.get("main") or []
    if not main_options:
        return False, "main 1X2 odds unavailable"
    main = sorted(main_options, key=lambda item: odds_helper.candidate_rank(item, locked_at))[0]
    if float(main["odds"]) < float(minimum_main_odds):
        return False, "main odds below minimum"
    odds_helper.apply_candidate(selected, main, "LOCKED", locked_at)
    for kind in ("btts", "doubleChance", "asianHandicap"):
        options = candidates.get(kind) or []
        market = selected["markets"][kind]
        if options:
            best = sorted(options, key=lambda item: odds_helper.candidate_rank(item, locked_at))[0]
            odds_helper.apply_candidate(market, best, "LOCKED", locked_at)
        else:
            market.update({"odds": None, "bookmaker": "N/A", "oddsStatus": "N/A", "oddsSource": "NOT FOUND", "oddsLockedAt": locked_at})
    return True, None


def main():
    rules = read_json(RULES_PATH)
    now_utc = datetime.now(timezone.utc)
    now_text = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    zone = ZoneInfo(rules.get("timezone", "Asia/Bangkok"))
    now_local = now_utc.astimezone(zone)
    start_local = now_local + timedelta(minutes=int(rules.get("minimum_lead_minutes", 45)))
    cutoff_local = datetime.combine(now_local.date() + timedelta(days=1), datetime.min.time(), tzinfo=zone).replace(hour=int(rules.get("cutoff_hour_local", 8)))
    window_key = cutoff_local.isoformat()
    result_feed = read_json(RESULT_PATH)
    state = read_json(STATE_PATH)
    report = {
        "generatedAt": now_text,
        "environment": "TEST_ONLY",
        "windowStartLocal": start_local.isoformat(),
        "windowEndLocal": cutoff_local.isoformat(),
        "windowKey": window_key,
        "status": "STARTED",
        "apiCalls": 0,
        "fixturesScanned": 0,
        "fixturesAnalyzed": 0,
        "prequalified": 0,
        "published": 0,
        "rejections": {},
    }

    if not rules.get("enabled", False):
        report["status"] = "DISABLED"
        write_json(REPORT_PATH, report)
        return
    if os.environ.get("FORCE_AUTO_SELECT") != "1" and not (result_feed.get("summary") or {}).get("allSettled", False):
        report["status"] = "WAITING_FOR_CURRENT_SET_TO_SETTLE"
        write_json(REPORT_PATH, report)
        return
    if state.get("lastSuccessfulWindowKey") == window_key:
        report["status"] = "ALREADY_SELECTED_FOR_WINDOW"
        report["published"] = state.get("lastPublishedCount", 0)
        write_json(REPORT_PATH, report)
        return

    fixtures = fetch_window_fixtures(start_local, cutoff_local, zone)
    report["fixturesScanned"] = len(fixtures)
    maximum = int(rules.get("maximum_fixtures_to_analyze", 240))
    if maximum > 0 and len(fixtures) > maximum:
        fixtures = fixtures[:maximum]
        report["truncatedTo"] = maximum
    report["fixturesAnalyzed"] = len(fixtures)

    team_ids = set()
    for row in fixtures:
        teams = row.get("teams") or {}
        for side in ("home", "away"):
            team_id = finite_int((teams.get(side) or {}).get("id"))
            if team_id:
                team_ids.add(team_id)

    histories, history_errors = {}, {}
    workers = min(8, max(1, len(team_ids)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_team_history, team_id, int(rules.get("history_fetch", 20))): team_id for team_id in team_ids}
        for future in as_completed(futures):
            team_id = futures[future]
            try:
                histories[team_id] = future.result()
            except Exception as error:
                histories[team_id] = []
                history_errors[str(team_id)] = str(error)

    selections, rejection_counts = [], {}
    for row in fixtures:
        selected, reason = make_candidate(row, histories, rules, now_text)
        if not selected:
            rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
            continue
        report["prequalified"] += 1
        try:
            ok, odds_reason = lock_odds(selected, now_text, rules.get("minimum_main_odds", 1.7))
        except Exception as error:
            ok, odds_reason = False, f"odds API error: {error}"
        if not ok:
            rejection_counts[odds_reason] = rejection_counts.get(odds_reason, 0) + 1
            continue
        selections.append(selected)

    selections.sort(key=lambda item: (item["kickoff_utc"], -float((item.get("auto_analysis") or {}).get("absoluteStrength", 0))))
    maximum_selections = int(rules.get("maximum_selections", 0))
    if maximum_selections > 0:
        selections = selections[:maximum_selections]
    report.update({"rejections": rejection_counts, "historyErrors": history_errors, "apiCalls": API_CALLS, "published": len(selections)})

    if not selections:
        report["status"] = "NO_QUALIFYING_SELECTIONS_KEEPING_CURRENT_SET"
        state.update({"lastAttemptAt": now_text, "lastAttemptWindowKey": window_key, "lastAttemptStatus": report["status"], "lastPublishedCount": 0})
        write_json(STATE_PATH, state)
        write_json(REPORT_PATH, report)
        return

    if SELECTED_PATH.exists():
        old = read_json(SELECTED_PATH)
        archive_name = f"{old.get('selection_date') or 'unknown-date'}-{now_utc.strftime('%Y%m%dT%H%M%SZ')}.json"
        ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SELECTED_PATH, ARCHIVE_DIR / archive_name)
        report["archivedPreviousSet"] = str(ARCHIVE_DIR / archive_name)

    selection_date = now_local.date().isoformat()
    payload = {
        "selection_date": selection_date,
        "locked_at_utc": now_text,
        "window_end_local": cutoff_local.isoformat(),
        "system": "NOMAD SYSTEM / AUTO TEST v.1",
        "environment": "TEST_ONLY",
        "rules": {
            "market": "1X2 team win",
            "odds_min": float(rules.get("minimum_main_odds", 1.7)),
            "confidence_fixed": int(rules.get("fixed_confidence", 58)),
            "manual_analysis_only": False,
            "automatic_selection": True,
            "unlimited_qualifying_matches": int(rules.get("maximum_selections", 0)) == 0,
            "overall_sample": int(rules.get("overall_sample", 6)),
            "venue_sample": int(rules.get("venue_sample", 5)),
            "common_opponents": True,
            "separate_market_statistics": True,
        },
        "matches": selections,
        "oddsPolicy": {
            "markets": ["1X2", "BTTS", "Double Chance", "Asian Handicap"],
            "lockRule": "first real API price selected by bookmaker priority; missing secondary prices are N/A; prices are never estimated",
            "source": "API-FOOTBALL",
        },
        "autoSelection": {
            "windowKey": window_key,
            "windowStartLocal": start_local.isoformat(),
            "windowEndLocal": cutoff_local.isoformat(),
            "generatedAt": now_text,
            "report": "auto-selection-report.json",
        },
    }
    write_json(SELECTED_PATH, payload)
    state.update({
        "lastAttemptAt": now_text,
        "lastAttemptWindowKey": window_key,
        "lastAttemptStatus": "PUBLISHED",
        "lastSuccessfulAt": now_text,
        "lastSuccessfulWindowKey": window_key,
        "lastPublishedCount": len(selections),
        "lastSelectionDate": selection_date,
    })
    report["status"] = "PUBLISHED"
    write_json(STATE_PATH, state)
    write_json(REPORT_PATH, report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
