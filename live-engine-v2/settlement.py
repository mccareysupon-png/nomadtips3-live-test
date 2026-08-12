from __future__ import annotations

from datetime import datetime, timezone


TERMINAL_STATUSES = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"}
VOID_STATUSES = {"CANC", "ABD", "AWD", "WO"}


def number(value, default=None):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def integer(value):
    parsed = number(value)
    return None if parsed is None else int(parsed)


def round_units(value):
    return round(float(value) + 0.0, 2)


def split_handicap(line):
    rounded = round(float(line) * 4) / 4
    quarter_index = round(abs(rounded) * 4)
    if quarter_index % 2 == 1:
        lower = int(rounded * 2 // 1) / 2
        return [lower, lower + 0.5]
    return [rounded]


def settle_asian(goal_difference, line, odds, stake=1.0):
    parts = split_handicap(line)
    stake_part = float(stake) / len(parts)
    outcomes = []
    profit = 0.0
    for part in parts:
        adjusted = float(goal_difference) + part
        if adjusted > 0.00001:
            outcomes.append("WIN")
            profit += stake_part * (float(odds) - 1)
        elif adjusted < -0.00001:
            outcomes.append("LOSS")
            profit -= stake_part
        else:
            outcomes.append("PUSH")

    if all(value == "WIN" for value in outcomes):
        settlement = "FULL WIN"
    elif all(value == "LOSS" for value in outcomes):
        settlement = "FULL LOSS"
    elif "WIN" in outcomes and "PUSH" in outcomes:
        settlement = "HALF WIN"
    elif "LOSS" in outcomes and "PUSH" in outcomes:
        settlement = "HALF LOSS"
    elif all(value == "PUSH" for value in outcomes):
        settlement = "PUSH"
    else:
        settlement = "SPLIT"

    outcome = (
        "WIN" if "WIN" in settlement
        else "LOSS" if "LOSS" in settlement
        else "PUSH"
    )
    result = "CORRECT" if outcome == "WIN" else "INCORRECT" if outcome == "LOSS" else "NEUTRAL"
    profit = round_units(profit)
    return {
        "outcome": outcome,
        "result": result,
        "settlement": settlement,
        "profit_units": profit,
        "returned_units": round_units(float(stake) + profit),
        "split_lines": parts,
    }


def normalize_fixture(item):
    fixture = (item or {}).get("fixture") or {}
    status = fixture.get("status") or {}
    goals = (item or {}).get("goals") or {}
    score = (item or {}).get("score") or {}
    return {
        "fixture_id": integer(fixture.get("id")),
        "status": str(status.get("short") or "").upper(),
        "home_score": integer(goals.get("home")),
        "away_score": integer(goals.get("away")),
        "fulltime_home": integer((score.get("fulltime") or {}).get("home")),
        "fulltime_away": integer((score.get("fulltime") or {}).get("away")),
    }


def final_score(fixture):
    if fixture["status"] in {"AET", "PEN"}:
        if fixture["fulltime_home"] is not None and fixture["fulltime_away"] is not None:
            return fixture["fulltime_home"], fixture["fulltime_away"]
    return fixture["home_score"], fixture["away_score"]


def _iso_now(now_ms):
    return datetime.fromtimestamp(now_ms / 1000, timezone.utc).isoformat()


def _void_result(signal, fixture, now_ms, note, final_home=None, final_away=None):
    stake = number(signal.get("stake_units"), 1.0)
    return {
        "status": "VOID",
        "outcome": "VOID",
        "result": "NEUTRAL",
        "settlement": "VOID",
        "final_status": fixture["status"],
        "final_score": None if final_home is None else {"home": final_home, "away": final_away},
        "post_entry_selected_goals": None,
        "post_entry_opponent_goals": None,
        "profit_units": 0.0,
        "returned_units": round_units(stake),
        "split_lines": None,
        "settled_at": _iso_now(now_ms),
        "note": note,
    }


def settlement_for_signal(signal, fixture_item, now_ms):
    fixture = normalize_fixture(fixture_item)
    if fixture["status"] not in TERMINAL_STATUSES:
        return None
    if fixture["status"] in VOID_STATUSES:
        return _void_result(
            signal,
            fixture,
            now_ms,
            f"Void by fixture status {fixture['status']}",
        )

    final_home, final_away = final_score(fixture)
    if final_home is None or final_away is None:
        return None
    entry = signal.get("score") or {}
    entry_home = integer(entry.get("home"))
    entry_away = integer(entry.get("away"))
    if entry_home is None or entry_away is None:
        return _void_result(signal, fixture, now_ms, "Void because entry score is missing", final_home, final_away)
    if final_home < entry_home or final_away < entry_away:
        return _void_result(
            signal,
            fixture,
            now_ms,
            "Void because final score was lower than entry score",
            final_home,
            final_away,
        )

    away_selected = str(signal.get("selection") or "HOME").upper() == "AWAY"
    selected_final = final_away if away_selected else final_home
    opponent_final = final_home if away_selected else final_away
    selected_entry = entry_away if away_selected else entry_home
    opponent_entry = entry_home if away_selected else entry_away
    post_selected = selected_final - selected_entry
    post_opponent = opponent_final - opponent_entry
    stake = number(signal.get("stake_units"), 1.0)
    market = str(signal.get("market") or "AH").upper()

    if market == "WIN":
        odds = number(signal.get("target_odds"))
        if odds is None or odds <= 1:
            return _void_result(signal, fixture, now_ms, "Void because WIN odds are missing", final_home, final_away)
        won = selected_final > opponent_final
        profit = round_units(stake * (odds - 1) if won else -stake)
        settled = {
            "outcome": "WIN" if won else "LOSS",
            "result": "CORRECT" if won else "INCORRECT",
            "settlement": "FULL WIN" if won else "FULL LOSS",
            "profit_units": profit,
            "returned_units": round_units(stake + profit),
            "split_lines": None,
        }
    else:
        line = number(signal.get("ah_line"))
        odds = number(signal.get("ah_odds"), number(signal.get("target_odds")))
        if line is None or odds is None or odds <= 1:
            return _void_result(signal, fixture, now_ms, "Void because AH price is missing", final_home, final_away)
        settled = settle_asian(post_selected - post_opponent, line, odds, stake)

    return {
        "status": "SETTLED",
        **settled,
        "final_status": fixture["status"],
        "final_score": {"home": final_home, "away": final_away},
        "post_entry_selected_goals": post_selected,
        "post_entry_opponent_goals": post_opponent,
        "settled_at": _iso_now(now_ms),
        "note": "Settled automatically by VPS using the existing Car 3 PAPER contract",
    }
