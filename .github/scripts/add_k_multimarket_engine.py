#!/usr/bin/env python3
"""ADD K Multi-Market pre-match engine for Prediction2 only.

Scope is intentionally isolated to The King / Prediction2 files.
Markets: 1X2, Asian Handicap, Over/Under. BTTS is intentionally excluded.
The engine scans every eligible Goaloo fixture, evaluates all available supported
markets, and publishes exactly one strongest qualified pick per match.

Existing daily rotation is preserved. A same-day feed that is already locked is
never replaced by a deploy/manual rerun; the new engine takes over on the next
selection day.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter

import the_king_engine as core
import the_king_engine_v8 as v8
import the_king_engine_v9 as v9

ENGINE = "add-k-multimarket-goaloo-v1"
POLICY = "ADD_K_MULTI_170_STRONGEST"
PROFILE = "ADD_K_AUTO_1X2_AH_OU"
MIN_ODDS = 1.70
MAX_ODDS_SAFETY = 6.00
MIN_RECENT = 8
MIN_EV = 0.02
MAX_PICKS = None
MARKETS = ("1X2", "AH", "OU")
ODDS_SOURCE = "1xBet / Goaloo goal50.xml"
FINAL_RESULTS = {"WIN", "HALF_WIN", "PUSH", "HALF_LOSS", "LOSS"}


def _number(value):
    try:
        n = float(value)
    except Exception:
        return None
    return n if math.isfinite(n) else None


def _hk_decimal(value):
    n = _number(value)
    if n is None or n < 0:
        return None
    return round(1.0 + n, 3)


def _fmt_line(value):
    n = _number(value)
    if n is None:
        return ""
    return f"{n:+g}"


def parse_goal50_markets(source):
    """Parse verified Goaloo goal50.xml layout without changing shared CAR code."""
    out = {}
    for match in re.finditer(r"<m>([^<]+)</m>", str(source or "")):
        row = [x.strip() for x in match.group(1).split(",")]
        if len(row) < 13 or not row[0].isdigit():
            continue
        one_home, one_draw, one_away = _number(row[6]), _number(row[7]), _number(row[8])
        ah_line, ah_home_raw, ah_away_raw = _number(row[2]), _number(row[3]), _number(row[4])
        ou_line, ou_over_raw, ou_under_raw = _number(row[10]), _number(row[11]), _number(row[12])
        record = {"bookmaker": "1xBet", "oneXtwo": None, "asianHandicap": None, "overUnder": None}
        if all(x is not None and x > 1.0 for x in (one_home, one_draw, one_away)):
            record["oneXtwo"] = {"home": one_home, "draw": one_draw, "away": one_away}
        ah_home, ah_away = _hk_decimal(ah_home_raw), _hk_decimal(ah_away_raw)
        if ah_line is not None and ah_home and ah_away and min(ah_home, ah_away) > 1.0:
            record["asianHandicap"] = {
                "line": ah_line, "home": ah_home, "away": ah_away,
                "raw": {"home": ah_home_raw, "away": ah_away_raw},
            }
        ou_over, ou_under = _hk_decimal(ou_over_raw), _hk_decimal(ou_under_raw)
        if ou_line is not None and ou_over and ou_under and min(ou_over, ou_under) > 1.0:
            record["overUnder"] = {
                "line": ou_line, "over": ou_over, "under": ou_under,
                "raw": {"over": ou_over_raw, "under": ou_under_raw},
            }
        if record["oneXtwo"] or record["asianHandicap"] or record["overUnder"]:
            out[row[0]] = record
    return out


def load_markets():
    try:
        markets = parse_goal50_markets(v8.fetch_text(v8.ODDS_URL))
        v8.HEALTH.update({"odds_ok": bool(markets), "odds_rows": len(markets)})
        return markets
    except Exception as exc:
        v8.HEALTH["errors"].append(f"ADD K goal50.xml: {exc}")
        return {}


def split_quarter_line(line):
    n = _number(line)
    if n is None:
        return []
    q = round(n * 4.0) / 4.0
    if int(round(abs(q * 4))) % 2 == 0:
        return [q]
    lower = math.floor(q * 2.0) / 2.0
    upper = math.ceil(q * 2.0) / 2.0
    return [lower] if lower == upper else [lower, upper]


def _component(value):
    return 1 if value > 0 else -1 if value < 0 else 0


def settlement_score(market, selection, line, home_goals, away_goals):
    h, a = _number(home_goals), _number(away_goals)
    if h is None or a is None:
        return None
    market = str(market or "1X2").upper()
    selection = str(selection or "").upper()
    if market == "1X2":
        if selection == "HOME":
            return 1.0 if h > a else -1.0
        if selection == "AWAY":
            return 1.0 if a > h else -1.0
        return None
    parts = split_quarter_line(line)
    if not parts:
        return None
    if market == "AH":
        if selection == "HOME":
            legs = [_component((h + part) - a) for part in parts]
        elif selection == "AWAY":
            legs = [_component((a + part) - h) for part in parts]
        else:
            return None
    elif market == "OU":
        total = h + a
        if selection == "OVER":
            legs = [_component(total - part) for part in parts]
        elif selection == "UNDER":
            legs = [_component(part - total) for part in parts]
        else:
            return None
    else:
        return None
    return sum(legs) / len(legs)


def result_label(score):
    if score is None:
        return None
    score = round(float(score), 4)
    if score >= 0.999:
        return "WIN"
    if score >= 0.499:
        return "HALF_WIN"
    if score <= -0.999:
        return "LOSS"
    if score <= -0.499:
        return "HALF_LOSS"
    return "PUSH"


def settle_record(rec, home_goals, away_goals):
    market = str(rec.get("market") or "1X2").upper()
    selection = str(rec.get("selection") or "").upper()
    if not selection and market == "1X2":
        selection = str(rec.get("side") or "").upper()
    score = settlement_score(market, selection, rec.get("line"), home_goals, away_goals)
    label = result_label(score)
    return None if label is None else {"result": label, "settlement_score": score}


def profit_for_result(result, odds, stake=100.0):
    price = _number(odds)
    if price is None:
        return None
    win_profit = stake * (price - 1.0)
    return {
        "WIN": win_profit,
        "HALF_WIN": win_profit * 0.5,
        "PUSH": 0.0,
        "HALF_LOSS": -stake * 0.5,
        "LOSS": -stake,
    }.get(str(result or "").upper())


def _fair_probability(prices, key):
    try:
        inv = {k: 1.0 / float(v) for k, v in prices.items() if float(v) > 1.0}
    except Exception:
        return None
    total = sum(inv.values())
    return None if total <= 0 or key not in inv else inv[key] / total


def _distribution_metrics(matrix, market, selection, line, odds):
    confidence = 0.0
    expected_profit = 0.0
    distribution = Counter()
    for h, row in enumerate(matrix):
        for a, probability in enumerate(row):
            score = settlement_score(market, selection, line, h, a)
            if score is None:
                continue
            label = result_label(score)
            distribution[label] += probability
            confidence += probability * ((score + 1.0) / 2.0)
            unit_profit = profit_for_result(label, odds, 1.0)
            expected_profit += probability * (unit_profit if unit_profit is not None else 0.0)
    return confidence, expected_profit, dict(distribution)


def required_confidence(odds):
    price = float(odds)
    if price < 1.90:
        return 0.60
    if price < 2.40:
        return 0.56
    if price <= 3.20:
        return 0.58
    return 0.62


def _candidate_gate(candidate):
    odds = float(candidate["odds"])
    minimum = required_confidence(odds)
    if odds < MIN_ODDS:
        return "ODDS_MIN"
    if odds > MAX_ODDS_SAFETY:
        return "ODDS_SAFETY_MAX"
    if float(candidate["confidence"]) < minimum:
        return "CONFIDENCE_GATE"
    if float(candidate["ev"]) < MIN_EV:
        return "VALUE_GATE"
    return None


def market_candidates(row, model, market):
    matrix = core.dixon_coles_matrix(float(model["lambda_home"]), float(model["lambda_away"]))
    candidates = []

    one = market.get("oneXtwo")
    if one:
        one_probs = {"home": float(model["home_win"]), "away": float(model["away_win"])}
        one_side = max(one_probs, key=one_probs.get)
        selection = one_side.upper()
        odds = float(one[one_side])
        confidence = one_probs[one_side]
        fair = _fair_probability(one, one_side)
        ev = confidence * odds - 1.0
        team = row[one_side]
        candidates.append({
            "market": "1X2", "selection": selection, "side": one_side, "line": None,
            "pick": f"{team} Win", "odds": odds, "confidence": confidence,
            "market_fair_probability": fair, "market_edge": None if fair is None else confidence - fair,
            "ev": ev, "settlement_distribution": None,
        })

    ah = market.get("asianHandicap")
    if ah:
        pair = {"home": float(ah["home"]), "away": float(ah["away"])}
        for side in ("home", "away"):
            selection = side.upper()
            line = float(ah["line"]) if side == "home" else -float(ah["line"])
            odds = pair[side]
            confidence, ev, distribution = _distribution_metrics(matrix, "AH", selection, line, odds)
            fair = _fair_probability(pair, side)
            candidates.append({
                "market": "AH", "selection": selection, "side": side, "line": line,
                "pick": f"{row[side]} {_fmt_line(line)}",
                "odds": odds, "confidence": confidence,
                "market_fair_probability": fair, "market_edge": None if fair is None else confidence - fair,
                "ev": ev, "settlement_distribution": distribution,
            })

    ou = market.get("overUnder")
    if ou:
        pair = {"over": float(ou["over"]), "under": float(ou["under"])}
        line = float(ou["line"])
        for direction in ("over", "under"):
            selection = direction.upper()
            odds = pair[direction]
            confidence, ev, distribution = _distribution_metrics(matrix, "OU", selection, line, odds)
            fair = _fair_probability(pair, direction)
            candidates.append({
                "market": "OU", "selection": selection, "side": None, "line": line,
                "pick": f"{selection.title()} {line:g}",
                "odds": odds, "confidence": confidence,
                "market_fair_probability": fair, "market_edge": None if fair is None else confidence - fair,
                "ev": ev, "settlement_distribution": distribution,
            })

    for candidate in candidates:
        candidate["gate"] = _candidate_gate(candidate)
        candidate["required_confidence"] = required_confidence(candidate["odds"])
    return candidates


def _pick_id(date_str, row, chosen):
    line = "" if chosen.get("line") is None else str(chosen["line"]).replace("-", "m").replace(".", "p")
    suffix = f"{chosen['market']}-{chosen['selection']}-{line}".strip("-")
    suffix = re.sub(r"[^A-Za-z0-9_-]+", "", suffix)
    return f"{core.stable_id(date_str, row['home'], row['away'])}-{suffix}"


def analyse(row, date_str, odds_map):
    raw = f"{row.get('league','')} {row.get('home','')} {row.get('away','')}"
    if v8.EXCLUDE.search(raw):
        return None, {"reason": "COMPETITION_QUALITY"}
    try:
        html = v8.get_h2h_html(row)
    except Exception as exc:
        return None, {"reason": "GOALOO_H2H_FETCH_FAILED", "detail": str(exc)[:120]}

    home_rows = v9.rows_for_team(html, row["home"], 10)
    away_rows = v9.rows_for_team(html, row["away"], 10)
    if len(home_rows) < MIN_RECENT or len(away_rows) < MIN_RECENT:
        return None, {"reason": "GOALOO_FORM_SHORT", "home_n": len(home_rows), "away_n": len(away_rows)}

    h2h_edge, h2h_n = v8.h2h_hint(html, row["home"], row["away"])
    model = v9.composite_model(home_rows, away_rows, h2h_edge)
    if not model:
        return None, {"reason": "MODEL_DATA_SHORT"}

    market = odds_map.get(str(row["id"]))
    if not market:
        return None, {"reason": "NO_GOALOO_MARKETS"}

    candidates = market_candidates(row, model, market)
    passed = [c for c in candidates if not c.get("gate")]
    if not passed:
        best = max(candidates, key=lambda c: (float(c.get("confidence") or 0), float(c.get("ev") or -9)), default=None)
        return None, {
            "reason": "NO_MARKET_PASSED",
            "best_market": None if not best else best.get("market"),
            "best_pick": None if not best else best.get("pick"),
            "confidence": None if not best else round(float(best.get("confidence") or 0), 4),
            "odds": None if not best else round(float(best.get("odds") or 0), 2),
            "gate": None if not best else best.get("gate"),
        }

    chosen = max(passed, key=lambda c: (float(c["confidence"]), float(c["ev"]), float(c["odds"])))
    market_edge = chosen.get("market_edge")
    return {
        "id": _pick_id(date_str, row, chosen),
        "goaloo_id": str(row["id"]),
        "date": date_str,
        "kickoff": row["kickoff"],
        "league": row["league"],
        "home": row["home"],
        "away": row["away"],
        "market": chosen["market"],
        "selection": chosen["selection"],
        "line": chosen.get("line"),
        "pick": chosen["pick"],
        "side": chosen.get("side"),
        "odds": round(float(chosen["odds"]), 2),
        "odds_source": ODDS_SOURCE,
        "confidence": round(float(chosen["confidence"]), 4),
        "model_probability": round(float(chosen["confidence"]), 4),
        "market_fair_probability": None if market_edge is None else round(float(chosen["market_fair_probability"]), 4),
        "market_edge": None if market_edge is None else round(float(market_edge), 4),
        "edge": "—" if market_edge is None else round(float(market_edge) * 100.0, 1),
        "ev": round(float(chosen["ev"]), 4),
        "required_confidence": round(float(chosen["required_confidence"]), 4),
        "result": "PENDING",
        "ft": None,
        "locked_at": core.now_iso(),
        "source_url": row["h2h_url"],
        "summary_url": row["summary_url"],
        "policy": POLICY,
        "engine": ENGINE,
        "selection_profile": {
            "name": PROFILE, "markets": list(MARKETS), "minimum_odds": MIN_ODDS,
            "minimum_ev": MIN_EV, "recent_sample_min_each": MIN_RECENT,
            "daily_cap": MAX_PICKS, "reverse_prediction": False,
            "rule": "ONE_STRONGEST_MARKET_PER_MATCH",
        },
        "gates": {
            "data_quality": "PASS", "competition_quality": "PASS", "goaloo_market": "PASS",
            "odds_min": "PASS", "confidence_by_price": "PASS", "value": "PASS",
            "reverse_prediction": "OFF", "daily_cap": "UNLIMITED",
        },
        "model": {
            "lambda_home": model["lambda_home"], "lambda_away": model["lambda_away"],
            "home_win": model["home_win"], "draw": model["draw"], "away_win": model["away_win"],
            "h2h_adjustment": model.get("h2h_adjustment"), "manual_set2": model.get("manual_set2"),
            "venue_fallback": model.get("venue_fallback"),
        },
        "data_quality": {
            "home_recent": len(home_rows), "away_recent": len(away_rows), "h2h_n": h2h_n,
            "primary_source": "Goaloo direct feeds",
        },
    }, None


def selection(date_str):
    existing = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    if existing.get("selection_date") == date_str and (existing.get("today") or []):
        print(json.dumps({
            "date": date_str, "locked_existing_day": True,
            "existing_engine": existing.get("engine"), "existing_picks": len(existing.get("today") or []),
            "message": "Existing daily picks preserved; ADD K activates on next daily selection rollover.",
        }))
        return

    fixtures = v8.date_matches(date_str)
    odds_map = load_markets()
    qualified, rejected, reasons, near = [], [], Counter(), []
    for row in fixtures:
        rec, err = analyse(row, date_str, odds_map)
        if rec:
            qualified.append(rec)
            continue
        err = err or {"reason": "UNKNOWN"}
        reasons[err.get("reason", "UNKNOWN")] += 1
        if len(rejected) < 30:
            rejected.append({"match": f"{row['home']} vs {row['away']}", **err})
        if err.get("confidence") is not None:
            near.append({"match": f"{row['home']} vs {row['away']}", **err})

    qualified.sort(key=lambda x: (float(x.get("confidence") or 0), float(x.get("ev") or 0)), reverse=True)
    near.sort(key=lambda x: float(x.get("confidence") or 0), reverse=True)
    feed = existing
    feed.update({
        "updated_at": core.now_iso(), "selection_date": date_str, "today": qualified,
        "history": feed.get("history") or [], "engine": ENGINE, "policy": POLICY,
        "selection_profile": {
            "name": PROFILE, "markets": list(MARKETS), "minimum_odds": MIN_ODDS,
            "minimum_ev": MIN_EV, "recent_sample_min_each": MIN_RECENT,
            "max_picks": MAX_PICKS, "reverse_prediction": False,
            "rule": "ONE_STRONGEST_MARKET_PER_MATCH",
        },
        "no_pick": not qualified,
        "no_pick_message": "NO ADD K PICK TODAY" if not qualified else None,
    })
    core.save_json(core.FEED_PATH, feed)

    prev = core.load_json(core.STATE_PATH, {})
    state = {
        "engine": ENGINE, "policy": POLICY, "status": "OK" if fixtures else "SOURCE_EMPTY",
        "last_selection_run": core.now_iso(), "last_settlement_run": prev.get("last_settlement_run"),
        "selection_date": date_str, "fixtures_seen": len(fixtures), "qualified": len(qualified),
        "pending": len(qualified), "max_daily_picks": MAX_PICKS, "no_pick": not qualified,
        "primary_source": "Goaloo bf_us.js + H2H + goal50.xml",
        "decision_layer": "ADD K strongest market across 1X2/AH/O-U; one pick per match",
        "rejected": max(0, len(fixtures) - len(qualified)), "rejection_reasons": dict(reasons),
        "rejection_samples": rejected, "near_gate_top": near[:20], "source_health": v8.HEALTH,
        "policy_limits": {
            "markets": list(MARKETS), "minimum_odds": MIN_ODDS, "maximum_odds_safety": MAX_ODDS_SAFETY,
            "minimum_ev": MIN_EV, "recent_sample_min_each": MIN_RECENT, "max_daily_picks": MAX_PICKS,
            "reverse_prediction": False, "one_pick_per_match": True,
            "confidence_by_price": {"1.70-1.89": 0.60, "1.90-2.39": 0.56, "2.40-3.20": 0.58, "3.21-6.00": 0.62},
        },
        "transition_notes": [
            "Prediction2 only; no CAR 3.41/3.42 files are touched.",
            "BTTS is excluded by owner instruction.",
            "All eligible fixtures are scanned; no daily pick-count cap.",
            "Each match publishes only the strongest qualified market among 1X2, AH and O/U.",
            "Published odds must be at least 1.70 and the published side itself passes the gate.",
            "Reverse prediction is disabled.",
        ],
    }
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({
        "date": date_str, "engine": ENGINE, "fixtures": len(fixtures), "qualified": len(qualified),
        "markets": dict(Counter(x["market"] for x in qualified)), "reasons": dict(reasons),
        "picks": [{"match": f"{x['home']} vs {x['away']}", "market": x["market"], "pick": x["pick"],
                   "confidence": x["confidence"], "odds": x["odds"]} for x in qualified],
    }))


def safe_score(value):
    n = _number(value)
    if n is None or not float(n).is_integer():
        return None
    n = int(n)
    return n if 0 <= n <= 30 else None


def settle():
    rows = v8.load_index()
    index = {str(row.get("id")): row for row in rows}
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    today = feed.get("today") or []
    history = feed.get("history") or []
    changed = 0

    def apply(rec):
        nonlocal changed
        if str(rec.get("result") or "PENDING").upper() in FINAL_RESULTS:
            return False
        row = index.get(str(rec.get("goaloo_id") or ""))
        if not row or row.get("state") != -1:
            return False
        hg, ag = safe_score(row.get("score_home")), safe_score(row.get("score_away"))
        if hg is None or ag is None:
            return False
        settled = settle_record(rec, hg, ag)
        if not settled:
            return False
        rec["ft"] = f"{hg}-{ag}"
        rec["result"] = settled["result"]
        rec["settlement_score"] = settled["settlement_score"]
        rec["profit"] = round(float(profit_for_result(rec["result"], rec.get("odds"), 100.0) or 0.0), 2)
        rec["settlement_source"] = "goaloo-bf_us-direct-index"
        rec["goaloo_terminal_state"] = -1
        rec["settled_at"] = core.now_iso()
        changed += 1
        return True

    for rec in today:
        apply(rec)
    for rec in history:
        apply(rec)

    by_id = {str(item.get("id")): item for item in history if item.get("id") is not None}
    for rec in today:
        if str(rec.get("result") or "").upper() in FINAL_RESULTS:
            by_id[str(rec.get("id"))] = dict(rec)
    feed["history"] = list(by_id.values())
    feed["updated_at"] = core.now_iso()
    core.save_json(core.FEED_PATH, feed)

    state = core.load_json(core.STATE_PATH, {})
    state["last_settlement_run"] = core.now_iso()
    state["settled_this_run"] = changed
    state["pending"] = sum(str(x.get("result") or "PENDING").upper() == "PENDING" for x in today)
    state["source_health"] = v8.HEALTH
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"settled": changed, "pending": state["pending"], "index_rows": len(rows)}))


def self_test():
    xml = "<c><match><m>3018359,1,-0.25,0.82,0.96,2,1.80,3.20,4.50,3,2.5,.80,.90</m></match></c>"
    markets = parse_goal50_markets(xml)["3018359"]
    assert markets["oneXtwo"]["home"] == 1.8
    assert markets["asianHandicap"]["line"] == -0.25
    assert markets["asianHandicap"]["home"] == 1.82
    assert markets["overUnder"]["over"] == 1.8
    assert split_quarter_line(-0.25) == [-0.5, 0.0]
    assert result_label(settlement_score("AH", "HOME", -0.25, 1, 1)) == "HALF_LOSS"
    assert result_label(settlement_score("AH", "AWAY", 0.25, 1, 1)) == "HALF_WIN"
    assert result_label(settlement_score("OU", "OVER", 2.25, 2, 0)) == "HALF_LOSS"
    assert result_label(settlement_score("OU", "UNDER", 2.25, 2, 0)) == "HALF_WIN"
    assert result_label(settlement_score("1X2", "HOME", None, 2, 1)) == "WIN"
    assert profit_for_result("HALF_WIN", 2.0, 100) == 50.0
    assert profit_for_result("HALF_LOSS", 2.0, 100) == -50.0
    assert required_confidence(1.70) == 0.60
    assert required_confidence(2.00) == 0.56
    print("ADD K multi-market self-test OK")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    select_parser = sub.add_parser("select")
    select_parser.add_argument("--date", required=True)
    sub.add_parser("settle")
    sub.add_parser("self-test")
    args = parser.parse_args()
    if args.cmd == "select":
        selection(args.date)
    elif args.cmd == "settle":
        settle()
    else:
        self_test()


if __name__ == "__main__":
    main()
