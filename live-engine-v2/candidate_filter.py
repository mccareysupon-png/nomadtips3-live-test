import json
from pathlib import Path

LIVE_STATUSES = {"1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"}

DEFAULT_CONFIG = {
    "enabled": True,
    "statuses": sorted(LIVE_STATUSES),
    "minute_min": 1,
    "minute_max": 120,
    "goal_gap_enabled": False,
    "max_goal_gap": 99,
    "score_states": ["ANY"],
    "statistics_enabled": False,
    "live_odds_enabled": False,
    "statistics_ttl_seconds": 60,
    "live_odds_ttl_seconds": 10,
}


def load_condition_config(path):
    config = dict(DEFAULT_CONFIG)
    target = Path(path)
    if not target.exists():
        return config

    raw = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("condition config must be a JSON object")
    config.update(raw)
    return normalize_config(config)


def normalize_config(config):
    result = dict(DEFAULT_CONFIG)
    result.update(config or {})
    result["enabled"] = bool(result.get("enabled", True))
    result["statuses"] = [str(value).upper() for value in result.get("statuses") or DEFAULT_CONFIG["statuses"]]
    result["minute_min"] = max(0, int(result.get("minute_min", 1)))
    result["minute_max"] = max(result["minute_min"], int(result.get("minute_max", 120)))
    result["goal_gap_enabled"] = bool(result.get("goal_gap_enabled", False))
    result["max_goal_gap"] = max(0, int(result.get("max_goal_gap", 99)))
    result["score_states"] = [str(value).upper() for value in result.get("score_states") or ["ANY"]]
    result["statistics_enabled"] = bool(result.get("statistics_enabled", False))
    result["live_odds_enabled"] = bool(result.get("live_odds_enabled", False))
    result["statistics_ttl_seconds"] = max(30, int(result.get("statistics_ttl_seconds", 60)))
    result["live_odds_ttl_seconds"] = max(5, int(result.get("live_odds_ttl_seconds", 10)))
    return result


def score_state(home_score, away_score):
    if home_score is None or away_score is None:
        return "UNKNOWN"
    if home_score > away_score:
        return "HOME_LEADING"
    if home_score < away_score:
        return "AWAY_LEADING"
    return "TIED"


def preliminary_match(fixture, config):
    if not config.get("enabled", True):
        return False, "SCANNER_DISABLED"

    status = str(fixture.get("status") or "").upper()
    if status not in set(config.get("statuses") or []):
        return False, "STATUS"

    minute = fixture.get("minute")
    if minute is None:
        return False, "MINUTE_MISSING"
    try:
        minute_value = int(minute)
    except (TypeError, ValueError):
        return False, "MINUTE_INVALID"

    if minute_value < int(config["minute_min"]) or minute_value > int(config["minute_max"]):
        return False, "MINUTE_RANGE"

    home_score = fixture.get("home_score")
    away_score = fixture.get("away_score")
    if home_score is None or away_score is None:
        return False, "SCORE_MISSING"

    state = score_state(home_score, away_score)
    allowed_states = set(config.get("score_states") or ["ANY"])
    if "ANY" not in allowed_states and state not in allowed_states:
        return False, "SCORE_STATE"

    if config.get("goal_gap_enabled"):
        if abs(int(home_score) - int(away_score)) > int(config.get("max_goal_gap", 99)):
            return False, "GOAL_GAP"

    return True, "MATCH"


def filter_preliminary(fixtures, config):
    candidates = []
    rejected = {}

    for fixture in fixtures:
        matched, reason = preliminary_match(fixture, config)
        if matched:
            candidates.append(fixture)
        else:
            rejected[reason] = rejected.get(reason, 0) + 1

    return {
        "candidates": candidates,
        "candidate_count": len(candidates),
        "rejected": rejected,
    }
