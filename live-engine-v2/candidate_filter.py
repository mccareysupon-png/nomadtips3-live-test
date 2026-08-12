import json
from pathlib import Path

LIVE_STATUSES = {"1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"}

DEFAULT_CONFIG = {
    "enabled": True,
    "statuses": sorted(LIVE_STATUSES),
    "side": "BOTH",
    "minute_min": 50,
    "minute_max": 89,
    "market": "AH",
    "odds_min": 1.20,
    "odds_max": None,
    "ah_min": 0.75,
    "ah_max": None,
    "momentum_min": 10,
    "attack_evidence_enabled": False,
    "confirmation_rounds": 1,
    "goal_gap_enabled": False,
    "max_goal_gap": 99,
    "score_states": ["ANY"],
    "statistics_enabled": True,
    "live_odds_enabled": True,
    "statistics_ttl_seconds": 60,
    "live_odds_ttl_seconds": 15,
}


def _value(source, snake_name, camel_name=None, default=None):
    if snake_name in source:
        return source[snake_name]
    if camel_name and camel_name in source:
        return source[camel_name]
    return default


def _number_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _boolean(value, default=False):
    if isinstance(value, bool):
        return value
    if value in (1, "1", "true", "TRUE", "yes", "on"):
        return True
    if value in (0, "0", "false", "FALSE", "no", "off"):
        return False
    return default


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
    source = config if isinstance(config, dict) else {}
    result = dict(DEFAULT_CONFIG)
    result["enabled"] = _boolean(_value(source, "enabled", default=True), True)
    result["statuses"] = [
        str(value).upper()
        for value in _value(source, "statuses", default=DEFAULT_CONFIG["statuses"])
        or DEFAULT_CONFIG["statuses"]
    ]
    raw_side = str(_value(source, "side", default="BOTH")).upper()
    result["side"] = raw_side if raw_side in {"HOME", "AWAY", "BOTH"} else "BOTH"
    result["minute_min"] = max(1, int(_value(source, "minute_min", "minuteMin", 50)))
    result["minute_max"] = min(
        120,
        max(result["minute_min"], int(_value(source, "minute_max", "minuteMax", 89))),
    )
    result["market"] = (
        "WIN" if str(_value(source, "market", default="AH")).upper() == "WIN" else "AH"
    )
    result["odds_min"] = max(
        1.01, float(_value(source, "odds_min", "oddsMin", 1.20))
    )
    result["odds_max"] = _number_or_none(
        _value(source, "odds_max", "oddsMax", None)
    )
    if result["odds_max"] is not None:
        result["odds_max"] = max(result["odds_min"], result["odds_max"])
    result["ah_min"] = float(_value(source, "ah_min", "ahMin", 0.75))
    result["ah_max"] = _number_or_none(_value(source, "ah_max", "ahMax", None))
    if result["ah_max"] is not None:
        result["ah_max"] = max(result["ah_min"], result["ah_max"])
    result["momentum_min"] = max(
        1, min(99, int(_value(source, "momentum_min", "momentumMin", 10)))
    )
    result["attack_evidence_enabled"] = _boolean(
        _value(source, "attack_evidence_enabled", "attackEvidenceEnabled", False),
        False,
    )
    result["confirmation_rounds"] = max(
        1,
        min(10, int(_value(source, "confirmation_rounds", "confirmationRounds", 1))),
    )
    result["goal_gap_enabled"] = _boolean(
        _value(source, "goal_gap_enabled", "goalGapLimited", False), False
    )
    result["max_goal_gap"] = max(
        0, int(_value(source, "max_goal_gap", "maxGoalGap", 99))
    )
    result["score_states"] = [
        str(value).upper()
        for value in _value(source, "score_states", default=["ANY"]) or ["ANY"]
    ]

    # The full Car 3 contract always needs statistics and live odds. These are
    # intentionally not optional in the VPS engine.
    result["statistics_enabled"] = True
    result["live_odds_enabled"] = True
    result["statistics_ttl_seconds"] = max(
        30, int(_value(source, "statistics_ttl_seconds", default=60))
    )
    result["live_odds_ttl_seconds"] = max(
        5, int(_value(source, "live_odds_ttl_seconds", default=15))
    )
    result["signal_limit_enabled"] = False
    result["signal_limit"] = None
    result["signal_limit_policy"] = "UNLIMITED"
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
