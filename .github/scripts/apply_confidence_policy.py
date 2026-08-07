import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

RULES_PATH = Path("config/nomad-auto-rules.json")
SELECTED_PATH = Path("selected-live-matches.json")
REPORT_PATH = Path("auto-selection-report.json")
BASE = "https://v3.football.api-sports.io"
KEY = os.environ.get("API_FOOTBALL_KEY", "")
HEADERS = {"x-apisports-key": KEY} if KEY else {}
STANDINGS_CONTEXT_VERSION = 1


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def finite_number(value, fallback=None):
    try:
        number = float(value)
        return number if number == number else fallback
    except (TypeError, ValueError):
        return fallback


def finite_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def api(path, params=None, tries=2):
    if not KEY:
        raise RuntimeError("API_FOOTBALL_KEY unavailable")
    query = f"?{urllib.parse.urlencode(params or {})}" if params else ""
    last_error = None
    for attempt in range(tries):
        try:
            request = urllib.request.Request(BASE + path + query, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=35) as response:
                payload = json.load(response)
            errors = payload.get("errors")
            if errors:
                raise RuntimeError(str(errors))
            return payload.get("response") or []
        except Exception as error:
            last_error = error
            if attempt + 1 < tries:
                time.sleep(1.5 + attempt)
    raise last_error


def fixture_team_result(row, team_id):
    teams = row.get("teams") or {}
    home = teams.get("home") or {}
    away = teams.get("away") or {}
    goals = row.get("goals") or {}
    home_id = finite_int(home.get("id"))
    away_id = finite_int(away.get("id"))
    home_goals = finite_int(goals.get("home"))
    away_goals = finite_int(goals.get("away"))
    if team_id not in {home_id, away_id} or home_goals is None or away_goals is None:
        return None
    is_home = team_id == home_id
    gf = home_goals if is_home else away_goals
    ga = away_goals if is_home else home_goals
    opponent = away if is_home else home
    return {
        "opponent_id": finite_int(opponent.get("id")),
        "opponent_name": opponent.get("name") or "Unknown",
        "points": 3 if gf > ga else 1 if gf == ga else 0,
    }


def recent_opponent_map(history, team_id, sample):
    games = []
    for row in history:
        item = fixture_team_result(row, team_id)
        if not item or not item.get("opponent_id"):
            continue
        games.append(item)
        if len(games) >= sample:
            break
    mapped = {}
    for item in games:
        bucket = mapped.setdefault(
            item["opponent_id"],
            {"name": item["opponent_name"], "points": []},
        )
        bucket["points"].append(item["points"])
    return mapped


def flatten_standings(response):
    by_team = {}
    if not response:
        return by_team
    league = (response[0] or {}).get("league") or {}
    groups = league.get("standings") or []
    for group in groups:
        for row in group or []:
            team = row.get("team") or {}
            team_id = finite_int(team.get("id"))
            rank = finite_int(row.get("rank"))
            if team_id and rank:
                by_team[team_id] = {
                    "rank": rank,
                    "name": team.get("name") or "Unknown",
                    "points": finite_int(row.get("points")),
                    "played": finite_int(((row.get("all") or {}).get("played"))),
                }
    return by_team


def standing_quality(rank, team_count):
    if not rank or team_count <= 1:
        return 0.5
    normalized = (rank - 1) / max(1, team_count - 1)
    return max(0.25, min(1.0, 1.0 - (0.75 * normalized)))


def calculated_confidence(match, minimum, maximum, scale):
    analysis = match.get("auto_analysis") or {}
    strength = finite_number(analysis.get("adjustedStrength"))
    if strength is None:
        strength = finite_number(analysis.get("absoluteStrength"))
    if strength is None:
        strength = abs(finite_number(analysis.get("strengthScore"), 0.0))
    raw = 50.0 + (strength * scale)
    return max(0, min(maximum, int(round(raw))))


def apply_standings_context(match, rules, caches):
    analysis = match.setdefault("auto_analysis", {})
    existing = analysis.get("standingsContext") or {}
    if (
        existing.get("version") == STANDINGS_CONTEXT_VERSION
        and finite_number(analysis.get("adjustedStrength")) is not None
    ):
        return existing

    base_signed = finite_number(analysis.get("strengthScore"), 0.0)
    base_strength = abs(base_signed)
    analysis["baseAbsoluteStrength"] = base_strength

    fallback = {
        "version": STANDINGS_CONTEXT_VERSION,
        "available": False,
        "source": "API-FOOTBALL standings",
        "policy": "Fallback to original NOMAD strength when standings are unavailable",
        "strengthAdjustment": 0.0,
        "adjustedStrength": round(base_strength, 4),
    }
    analysis["adjustedStrength"] = round(base_strength, 4)

    if not bool(rules.get("use_standings_context", True)) or not KEY:
        fallback["reason"] = "standings context disabled or API key unavailable"
        analysis["standingsContext"] = fallback
        return fallback

    fixture_id = finite_int(match.get("fixture_id"))
    if not fixture_id:
        fallback["reason"] = "fixture id unavailable"
        analysis["standingsContext"] = fallback
        return fallback

    fixture_cache = caches["fixture"]
    standings_cache = caches["standings"]
    history_cache = caches["history"]

    try:
        if fixture_id not in fixture_cache:
            rows = api("/fixtures", {"id": fixture_id})
            fixture_cache[fixture_id] = rows[0] if rows else None
        fixture_row = fixture_cache.get(fixture_id)
        if not fixture_row:
            raise RuntimeError("fixture metadata unavailable")

        league = fixture_row.get("league") or {}
        teams = fixture_row.get("teams") or {}
        home = teams.get("home") or {}
        away = teams.get("away") or {}
        league_id = finite_int(league.get("id"))
        season = finite_int(league.get("season"))
        home_id = finite_int(home.get("id"))
        away_id = finite_int(away.get("id"))
        if not league_id or not season or not home_id or not away_id:
            raise RuntimeError("league, season or team id unavailable")

        standings_key = (league_id, season)
        if standings_key not in standings_cache:
            standings_cache[standings_key] = flatten_standings(
                api("/standings", {"league": league_id, "season": season})
            )
        table = standings_cache.get(standings_key) or {}
        home_row = table.get(home_id)
        away_row = table.get(away_id)
        if not home_row or not away_row:
            raise RuntimeError("standings unavailable for one or both teams")

        team_count = len(table)
        pick_side = str(match.get("pick_side") or "home").lower()
        selected_id = home_id if pick_side == "home" else away_id
        opponent_id = away_id if pick_side == "home" else home_id
        selected_row = table.get(selected_id)
        opponent_row = table.get(opponent_id)
        selected_rank = selected_row["rank"]
        opponent_rank = opponent_row["rank"]
        direct_rank_edge = (opponent_rank - selected_rank) / max(1, team_count - 1)

        history_fetch = int(rules.get("history_fetch", 20))
        sample = int(rules.get("overall_sample", 6))
        for team_id in (home_id, away_id):
            cache_key = (team_id, history_fetch)
            if cache_key not in history_cache:
                history_cache[cache_key] = api(
                    "/fixtures",
                    {"team": team_id, "last": history_fetch, "status": "FT", "timezone": "UTC"},
                )

        home_map = recent_opponent_map(history_cache[(home_id, history_fetch)], home_id, sample)
        away_map = recent_opponent_map(history_cache[(away_id, history_fetch)], away_id, sample)
        selected_map = home_map if pick_side == "home" else away_map
        opponent_map = away_map if pick_side == "home" else home_map

        shared = sorted(set(selected_map) & set(opponent_map))
        ranked_rows = []
        weighted_sum = 0.0
        weight_total = 0.0
        for shared_id in shared:
            rank_row = table.get(shared_id)
            if not rank_row:
                continue
            selected_points = sum(selected_map[shared_id]["points"]) / len(selected_map[shared_id]["points"])
            opponent_points = sum(opponent_map[shared_id]["points"]) / len(opponent_map[shared_id]["points"])
            point_edge = (selected_points - opponent_points) / 3.0
            quality = standing_quality(rank_row["rank"], team_count)
            weighted_sum += point_edge * quality
            weight_total += quality
            ranked_rows.append({
                "teamId": shared_id,
                "team": rank_row.get("name") or selected_map[shared_id].get("name") or "Unknown",
                "rank": rank_row["rank"],
                "selectedPoints": round(selected_points, 3),
                "opponentPoints": round(opponent_points, 3),
                "pointEdge": round(point_edge, 4),
                "qualityWeight": round(quality, 4),
            })

        ranked_common_edge = weighted_sum / weight_total if weight_total else 0.0
        direct_mix = float(rules.get("standings_direct_rank_mix", 0.55))
        common_mix = float(rules.get("standings_ranked_common_mix", 0.45))
        mix_total = direct_mix + common_mix
        if mix_total <= 0:
            direct_mix, common_mix, mix_total = 0.55, 0.45, 1.0
        context_score = (
            (direct_rank_edge * direct_mix) + (ranked_common_edge * common_mix)
        ) / mix_total

        strength_weight = float(rules.get("standings_strength_weight", 0.20))
        cap = abs(float(rules.get("standings_adjustment_cap", 0.20)))
        adjustment = max(-cap, min(cap, context_score * strength_weight))
        adjusted_strength = max(0.0, base_strength + adjustment)
        analysis["adjustedStrength"] = round(adjusted_strength, 4)

        context = {
            "version": STANDINGS_CONTEXT_VERSION,
            "available": True,
            "source": "API-FOOTBALL standings",
            "leagueId": league_id,
            "season": season,
            "teamCount": team_count,
            "selectedTeamId": selected_id,
            "selectedRank": selected_rank,
            "opponentTeamId": opponent_id,
            "opponentRank": opponent_rank,
            "directRankEdge": round(direct_rank_edge, 4),
            "rankedCommonOpponentCount": len(ranked_rows),
            "rankedCommonOpponentEdge": round(ranked_common_edge, 4),
            "rankedCommonOpponents": ranked_rows,
            "contextScore": round(context_score, 4),
            "strengthAdjustment": round(adjustment, 4),
            "adjustedStrength": round(adjusted_strength, 4),
            "policy": "League rank supports A-B-C/common-opponent analysis; missing standings fall back to the original NOMAD model",
        }
        analysis["standingsContext"] = context
        return context
    except Exception as error:
        fallback["reason"] = str(error)
        analysis["standingsContext"] = fallback
        return fallback


def main():
    rules = read_json(RULES_PATH)
    selected = read_json(SELECTED_PATH)
    system = str(selected.get("system") or "").upper()
    if "AUTO" not in system or not isinstance(selected.get("matches"), list):
        print(json.dumps({"status": "SKIPPED_NON_AUTO_SET"}))
        return

    minimum = int(rules.get("minimum_confidence", 58))
    maximum = int(rules.get("maximum_confidence", 85))
    scale = float(rules.get("confidence_strength_scale", 15))
    caches = {"fixture": {}, "standings": {}, "history": {}}

    published = []
    rejected = []
    standings_available = 0
    standings_fallback = 0

    for match in selected.get("matches") or []:
        context = apply_standings_context(match, rules, caches)
        if context.get("available"):
            standings_available += 1
        else:
            standings_fallback += 1

        confidence = calculated_confidence(match, minimum, maximum, scale)
        if confidence < minimum:
            rejected.append({
                "fixture_id": match.get("fixture_id"),
                "match": f"{match.get('home')} vs {match.get('away')}",
                "confidence": confidence,
                "reason": f"confidence below minimum {minimum}% after standings context",
            })
            continue

        match["confidence"] = confidence
        markets = match.get("markets") or {}
        for market in markets.values():
            if isinstance(market, dict):
                market["confidence"] = confidence

        analysis = match.setdefault("auto_analysis", {})
        analysis["confidenceScore"] = confidence
        analysis["confidenceMethod"] = (
            f"50 + ({scale:g} × standings-adjusted NOMAD strength), capped by policy; "
            "league rank and ranked common-opponent context are used when available"
        )
        published.append(match)

    selected["matches"] = published
    rule_meta = selected.setdefault("rules", {})
    rule_meta.pop("confidence_fixed", None)
    rule_meta["confidence_minimum"] = minimum
    rule_meta["confidence_maximum"] = maximum
    rule_meta["confidence_dynamic"] = True
    rule_meta["standings_context"] = True
    rule_meta["standings_missing_policy"] = "Fallback to original NOMAD weighted strength; never reject solely because standings are unavailable"
    rule_meta["confidence_policy"] = (
        f"Calculated per match from NOMAD weighted strength plus standings context when available; "
        f"only confidence >= {minimum}% is published; maximum displayed confidence {maximum}%"
    )
    selected["confidencePolicy"] = {
        "type": "DYNAMIC_MINIMUM_WITH_STANDINGS",
        "minimum": minimum,
        "maximum": maximum,
        "scale": scale,
        "formula": f"round(50 + adjustedStrength × {scale:g}), capped at {maximum}",
        "inputs": [
            "overall PPG",
            "home/away PPG",
            "goal-difference rate",
            "common-opponent edge",
            "league standing rank",
            "rank-weighted common-opponent A-B-C context",
        ],
        "standings": {
            "enabled": bool(rules.get("use_standings_context", True)),
            "strengthWeight": float(rules.get("standings_strength_weight", 0.20)),
            "adjustmentCap": float(rules.get("standings_adjustment_cap", 0.20)),
            "availableMatches": standings_available,
            "fallbackMatches": standings_fallback,
            "missingPolicy": "Use original NOMAD strength when standings do not exist or are not covered",
        },
        "note": "NOMAD model confidence score; not a guaranteed outcome probability",
        "rejectedBelowMinimum": len(rejected),
    }
    write_json(SELECTED_PATH, selected)

    if REPORT_PATH.exists():
        report = read_json(REPORT_PATH)
        report["confidencePolicy"] = selected["confidencePolicy"]
        report["confidenceRejected"] = len(rejected)
        report["publishedAfterConfidence"] = len(published)
        report["standingsContext"] = {
            "available": standings_available,
            "fallback": standings_fallback,
        }
        report.setdefault("rejections", {})
        if rejected:
            report["rejections"]["confidence below minimum after standings context"] = (
                int(report["rejections"].get("confidence below minimum after standings context", 0))
                + len(rejected)
            )
        write_json(REPORT_PATH, report)

    print(json.dumps({
        "status": "CONFIDENCE_AND_STANDINGS_POLICY_APPLIED",
        "minimum": minimum,
        "maximum": maximum,
        "published": len(published),
        "rejected": len(rejected),
        "standingsAvailable": standings_available,
        "standingsFallback": standings_fallback,
        "confidenceRange": [
            min((item["confidence"] for item in published), default=None),
            max((item["confidence"] for item in published), default=None),
        ],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
