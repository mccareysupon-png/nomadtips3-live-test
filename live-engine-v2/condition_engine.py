import re
import time
import hashlib
import json
from datetime import datetime, timezone


REQUIRED_STATS = (
    "attacks",
    "dangerous_attacks",
    "shots",
    "shots_on_target",
    "corners",
    "possession",
)
WEIGHTS = {
    "attacks": 0.16,
    "dangerous_attacks": 0.52,
    "shots": 2.0,
    "shots_on_target": 4.0,
    "corners": 1.25,
}


def number(value):
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("%", "").replace(",", "."))
    except (TypeError, ValueError):
        return None


def complete_statistics(stats):
    return all(
        number((stats.get(key) or {}).get(side)) is not None
        for key in REQUIRED_STATS
        for side in ("home", "away")
    )


def swap_stats(stats):
    return {
        key: {"home": value.get("away"), "away": value.get("home")}
        for key, value in (stats or {}).items()
        if isinstance(value, dict)
    }


def selected_sides(config):
    side = str(config.get("side") or "HOME").upper()
    if side == "BOTH":
        return ("HOME", "AWAY")
    return ("AWAY",) if side == "AWAY" else ("HOME",)


def _activity(current, previous, side):
    weighted = 0.0
    evidence = 0.0
    for key, weight in WEIGHTS.items():
        current_value = number((current.get(key) or {}).get(side))
        previous_value = number((previous.get(key) or {}).get(side))
        delta = (
            0.0
            if current_value is None or previous_value is None
            else max(0.0, current_value - previous_value)
        )
        weighted += delta * weight
        if key in {"dangerous_attacks", "shots", "shots_on_target", "corners"}:
            evidence += delta
    possession = number((current.get("possession") or {}).get(side)) or 0.0
    weighted += max(0.0, possession) * 0.07
    return {"weighted": weighted, "evidence": evidence}


def momentum(current, previous_row, now_ms, minute, config_version):
    if not previous_row:
        return None
    if str(previous_row.get("config_version") or "") != str(config_version or ""):
        return None
    age = now_ms - int(previous_row.get("last_sample_at") or 0)
    if age <= 0 or age > 8 * 60_000:
        return None
    if int(minute) < int(previous_row.get("last_minute") or 0):
        return None

    previous = previous_row.get("stats") or {}
    selected = _activity(current, previous, "home")
    opponent = _activity(current, previous, "away")
    total = selected["weighted"] + opponent["weighted"]
    percent = selected["weighted"] / total * 100 if total > 0 else 50.0
    last = number(previous_row.get("last_percent"))
    if last is not None:
        percent = last * 0.55 + percent * 0.45
    percent = max(0, min(100, round(percent)))
    return {
        "selected": percent,
        "opponent": 100 - percent,
        "evidence": selected["evidence"],
    }


def _is_side(value, team_name, side):
    text = str(value or "").strip().lower()
    team = str(team_name or "").strip().lower()
    if team and team in text:
        return True
    return text in ({"home", "1"} if side == "HOME" else {"away", "2"})


def _handicap(value):
    match = re.search(r"([+-]?(?:\d+(?:\.\d+)?|\.\d+))", str(value or "").replace(",", "."))
    return number(match.group(1)) if match else None


def _bet_containers(root):
    output = []
    seen = set()

    def walk(value, context=""):
        if not isinstance(value, (dict, list)) or id(value) in seen:
            return
        seen.add(id(value))
        if isinstance(value, list):
            for index, child in enumerate(value[:600]):
                walk(child, f"{context} {index}")
            return
        bet = value.get("bet") if isinstance(value.get("bet"), dict) else {}
        name = value.get("name") or bet.get("name") or value.get("label") or ""
        values = value.get("values") or value.get("outcomes") or value.get("selections")
        if isinstance(values, list):
            output.append({"name": str(name), "values": values, "context": context})
        for key, child in list(value.items())[:600]:
            walk(child, f"{context} {key} {name}")

    walk(root)
    return output


def markets_for(odds_item, team_name, side):
    win = None
    ah = None
    ah_odds = None
    root = (odds_item or {}).get("odds") if isinstance(odds_item, dict) else odds_item
    for box in _bet_containers(root or odds_item):
        name = f"{box['name']} {box['context']}".lower()
        is_win = re.search(r"match winner|1x2|fulltime result|moneyline|winner", name)
        is_ah = re.search(r"asian handicap|asian line|\bah\b", name)
        if not is_win and not is_ah:
            continue
        values = sorted(box["values"], key=lambda item: bool(item.get("main")), reverse=True)
        for value in values:
            if not isinstance(value, dict):
                continue
            side_text = (
                value.get("value")
                or value.get("name")
                or value.get("label")
                or value.get("team")
            )
            if not _is_side(side_text, team_name, side):
                continue
            odd = number(
                value.get("odd")
                or value.get("odds")
                or value.get("price")
                or value.get("decimal")
            )
            if is_win and win is None and odd is not None:
                win = odd
            if is_ah and ah is None:
                ah = _handicap(
                    value.get("handicap")
                    or value.get("line")
                    or value.get("hdp")
                    or side_text
                )
                if ah is not None:
                    ah_odds = odd
    return {"win": win, "ah": ah, "ah_odds": ah_odds}


def in_range(value, minimum, maximum):
    if value is None or value < float(minimum):
        return False
    return maximum is None or value <= float(maximum)


def config_version(condition, condition_meta):
    remote_version = int((condition_meta or {}).get("version") or 0)
    if remote_version:
        return f"remote:{remote_version}"
    encoded = json.dumps(
        condition,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"local:{hashlib.sha256(encoded).hexdigest()}"


def _iso_now(now_ms):
    return datetime.fromtimestamp(now_ms / 1000, timezone.utc).isoformat()


class ConditionEngine:
    def __init__(self, store, inbox_dir):
        self.store = store
        self.inbox_dir = inbox_dir

    def evaluate(self, fixtures, statistics, live_odds, condition, condition_meta=None):
        now_ms = int(time.time() * 1000)
        version = config_version(condition, condition_meta or {})
        samples = []
        emitted = []
        counts = {
            "preliminary": len(fixtures),
            "complete_stats": 0,
            "complete_markets": 0,
            "red_safe": 0,
            "momentum_ready": 0,
            "passing": 0,
            "triggered": 0,
            "new_signals": 0,
        }

        for fixture in fixtures:
            fixture_id = int(fixture["fixture_id"])
            stats = statistics.get(fixture_id) or statistics.get(str(fixture_id)) or {}
            stats = stats.get("statistics") or {}
            if not complete_statistics(stats):
                continue
            counts["complete_stats"] += 1
            odds_item = live_odds.get(fixture_id) or live_odds.get(str(fixture_id))
            fixture_market_ready = False

            for side in selected_sides(condition):
                away_selected = side == "AWAY"
                selected_team = fixture["away"] if away_selected else fixture["home"]
                opponent = fixture["home"] if away_selected else fixture["away"]
                selected_score = fixture["away_score"] if away_selected else fixture["home_score"]
                opponent_score = fixture["home_score"] if away_selected else fixture["away_score"]
                selected_stats = swap_stats(stats) if away_selected else stats
                markets = markets_for(odds_item, selected_team, side)
                if any(value is not None for value in markets.values()):
                    fixture_market_ready = True
                selected_odds = markets["ah_odds"] if condition["market"] == "AH" else markets["win"]
                if not in_range(selected_odds, condition["odds_min"], condition["odds_max"]):
                    continue
                if not in_range(markets["ah"], condition["ah_min"], condition["ah_max"]):
                    continue
                selected_red = number((selected_stats.get("red_cards") or {}).get("home")) or 0
                opponent_red = number((selected_stats.get("red_cards") or {}).get("away")) or 0
                if selected_red > opponent_red:
                    continue
                counts["red_safe"] += 1

                key = f"{fixture_id}:{side}"
                previous = self.store.state_for(key)
                calculated = momentum(
                    selected_stats,
                    previous,
                    now_ms,
                    int(fixture["minute"]),
                    version,
                )
                if calculated:
                    counts["momentum_ready"] += 1
                passed = bool(
                    calculated
                    and calculated["selected"] >= condition["momentum_min"]
                    and (
                        not condition["attack_evidence_enabled"]
                        or calculated["evidence"] >= 1
                    )
                )
                if passed:
                    counts["passing"] += 1
                streak = (int(previous.get("streak") or 0) + 1) if passed and previous else int(passed)
                triggered = bool(
                    (previous and previous.get("triggered")) or self.store.has_signal(key)
                )

                signal = None
                if not triggered and passed and streak >= condition["confirmation_rounds"]:
                    signal = {
                        "schema": "nomadtips3.car3.live-signal.v1",
                        "signal_id": f"VPS-{fixture_id}-{side}-{now_ms}",
                        "signal_key": key,
                        "fixture_id": str(fixture_id),
                        "created_at": _iso_now(now_ms),
                        "home": fixture["home"],
                        "away": fixture["away"],
                        "market": condition["market"],
                        "selection": side,
                        "selected_team": selected_team,
                        "opponent": opponent,
                        "minute": int(fixture["minute"]),
                        "score": {
                            "home": int(fixture["home_score"]),
                            "away": int(fixture["away_score"]),
                        },
                        "selected_score": int(selected_score),
                        "opponent_score": int(opponent_score),
                        "confidence": calculated["selected"],
                        "attack_evidence": calculated["evidence"],
                        "target_odds": selected_odds,
                        "ah_line": markets["ah"],
                        "ah_odds": markets["ah_odds"],
                        "reason": f"Car 3 momentum {calculated['selected']}%, streak {streak}",
                        "source": "NOMAD CAR 3 VPS LIVE ENGINE",
                        "mode": "PAPER_ONLY",
                    }
                    if self.store.insert_signal(key, fixture_id, side, signal, now_ms):
                        self.store.write_signal(self.inbox_dir, signal)
                        emitted.append(signal)
                        counts["new_signals"] += 1
                        triggered = True

                if triggered:
                    counts["triggered"] += 1
                self.store.save_state(
                    key=key,
                    fixture_id=fixture_id,
                    selected_side=side,
                    stats=selected_stats,
                    last_percent=calculated["selected"] if calculated else None,
                    streak=streak,
                    triggered=triggered,
                    last_minute=int(fixture["minute"]),
                    last_sample_at=now_ms,
                    config_version=version,
                )
                samples.append(
                    {
                        "fixture_id": fixture_id,
                        "side": side,
                        "selected_team": selected_team,
                        "opponent": opponent,
                        "minute": int(fixture["minute"]),
                        "score": f"{selected_score}-{opponent_score}",
                        "momentum": calculated["selected"] if calculated else None,
                        "evidence": calculated["evidence"] if calculated else None,
                        "streak": streak,
                        "market": condition["market"],
                        "selected_odds": selected_odds,
                        "ah_line": markets["ah"],
                        "ah_odds": markets["ah_odds"],
                        "triggered": triggered,
                    }
                )
            if fixture_market_ready:
                counts["complete_markets"] += 1

        self.store.cleanup_states(now_ms - 6 * 60 * 60_000)
        return {
            "mode": "SCANNING" if condition.get("enabled", True) else "STOPPED_BY_CONFIG",
            "paper_only": True,
            "signal_policy": "UNLIMITED",
            "signal_limit": None,
            "config_version": version,
            "counts": counts,
            "active_candidates": samples[:100],
            "new_signals": emitted,
            "recent_signals": self.store.recent_signals(50),
        }
