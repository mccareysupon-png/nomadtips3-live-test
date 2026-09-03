#!/usr/bin/env python3
"""THE KING v10 — KING V2 BETA core gates on the proven Goaloo collector.

This transition keeps Goaloo fixture/result/H2H/1X2 collection and the existing
settlement feed contract, but replaces legacy 58%/12pt/odds>=1.70/top-6
selection with KING V2 value-first logic.

Important: Goaloo xG/SoT/Big-Chance and confirmed-lineup feeds are not yet
proven in this repository. This engine therefore labels its 3/4 performance
gate as Goaloo-equivalent underlying form (goals, venue splits and defense),
never as xG. Missing market data fails closed with NO PICK.
"""
import json
from collections import Counter

import the_king_engine as core
import the_king_engine_v8 as v8
import the_king_engine_v9 as v9

ENGINE = "the-king-v10-king-v2-goaloo-transition"
POLICY = "KING_V2_BETA"
MAX_PICKS = None
MIN_MARKET_EDGE = 0.05
MIN_EV = 0.05
MAX_ODDS = 3.00
MIN_RECENT = 8


def fair_market(market):
    try:
        odds = {k: float(market[k]) for k in ("home", "draw", "away")}
    except Exception:
        return None
    if any(v <= 1.0 for v in odds.values()):
        return None
    raw = {k: 1.0 / v for k, v in odds.items()}
    overround = sum(raw.values())
    if overround <= 0:
        return None
    fair = {k: raw[k] / overround for k in raw}
    return {"odds": odds, "fair": fair, "overround": overround}


def _gd(stats):
    return float(stats["gf"]) - float(stats["ga"])


def equivalent_underlying_gate(home_rows, away_rows, side):
    """KING V2 transition 3/4 gate using only proven Goaloo form fields.

    These are equivalent underlying indicators, not xG/SoT. Every record keeps
    the basis explicit so the UI/audit layer cannot mislabel them.
    """
    ho = core.weighted_stats(home_rows)
    ao = core.weighted_stats(away_rows)
    hv = core.weighted_stats(home_rows, "home")
    av = core.weighted_stats(away_rows, "away")
    if not ho or not ao or not hv or not av:
        return None

    if side == "home":
        sel_o, opp_o, sel_ctx, opp_ctx = ho, ao, hv, av
    else:
        sel_o, opp_o, sel_ctx, opp_ctx = ao, ho, av, hv

    rolling_gd_edge = _gd(sel_o) - _gd(opp_o)
    contextual_gd_edge = _gd(sel_ctx) - _gd(opp_ctx)
    attack_edge = float(sel_o["gf"]) - float(opp_o["gf"])
    defense_delta = float(sel_o["ga"]) - float(opp_o["ga"])

    tests = {
        "A_rolling_goal_diff_edge": rolling_gd_edge >= 0.30,
        "B_home_away_goal_diff_edge": contextual_gd_edge >= 0.30,
        "C_scoring_attack_edge": attack_edge >= 0.20,
        "D_defensive_quality": defense_delta <= 0.15,
    }
    passed = sum(bool(v) for v in tests.values())
    return {
        "pass": passed >= 3,
        "passed": passed,
        "required": 3,
        "tests": tests,
        "metrics": {
            "rolling_goal_diff_edge": round(rolling_gd_edge, 4),
            "contextual_goal_diff_edge": round(contextual_gd_edge, 4),
            "scoring_attack_edge": round(attack_edge, 4),
            "defensive_ga_delta": round(defense_delta, 4),
        },
        "basis": "GOALOO_EQUIVALENT_UNDERLYING_FORM_NOT_XG",
    }


def analyse(row, date_str, odds_map):
    raw = f"{row.get('league','')} {row.get('home','')} {row.get('away','')}"
    if v8.EXCLUDE.search(raw):
        return None, {"reason": "COMPETITION_QUALITY"}

    try:
        html = v8.get_h2h_html(row)
    except Exception as exc:
        return None, {"reason": "GOALOO_H2H_FETCH_FAILED", "detail": str(exc)[:120]}

    hr = v9.rows_for_team(html, row["home"], 10)
    ar = v9.rows_for_team(html, row["away"], 10)
    if len(hr) < MIN_RECENT or len(ar) < MIN_RECENT:
        return None, {"reason": "DATA_QUALITY_RECENT_SAMPLE", "home_n": len(hr), "away_n": len(ar)}

    h2h_edge, h2h_n = v8.h2h_hint(html, row["home"], row["away"])
    model = v9.composite_model(hr, ar, h2h_edge)
    if not model:
        return None, {"reason": "MODEL_DATA_SHORT"}

    side = model.get("side")
    if side not in ("home", "away"):
        return None, {"reason": "DRAW_NOT_MAIN_PICK", "model_probability": model.get("confidence")}

    underlying = equivalent_underlying_gate(hr, ar, side)
    if not underlying or not underlying["pass"]:
        return None, {"reason": "UNDERLYING_PERFORMANCE", "underlying": underlying}

    market = odds_map.get(row["id"])
    priced = fair_market(market) if market else None
    if not priced:
        return None, {"reason": "NO_RELIABLE_1X2_MARKET"}

    locked = priced["odds"][side]
    if locked > MAX_ODDS:
        return None, {"reason": "BETA_ODDS_CAP", "odds": round(locked, 2)}

    model_probability = float(model["home_win"] if side == "home" else model["away_win"])
    market_fair_probability = float(priced["fair"][side])
    market_edge = model_probability - market_fair_probability
    ev = model_probability * locked - 1.0

    if market_edge < MIN_MARKET_EDGE:
        return None, {
            "reason": "MARKET_EDGE",
            "market_edge": round(market_edge, 4),
            "required": MIN_MARKET_EDGE,
        }
    if ev < MIN_EV:
        return None, {"reason": "EV_GATE", "ev": round(ev, 4), "required": MIN_EV}

    team = row["home"] if side == "home" else row["away"]
    return {
        "id": core.stable_id(date_str, row["home"], row["away"]),
        "goaloo_id": row["id"],
        "date": date_str,
        "kickoff": row["kickoff"],
        "league": row["league"],
        "home": row["home"],
        "away": row["away"],
        "pick": f"{team} Win",
        "side": side,
        "odds": round(locked, 2),
        "odds_source": "1xBet / Goaloo goal50.xml",
        "model_probability": round(model_probability, 4),
        "market_fair_probability": round(market_fair_probability, 4),
        "market_edge": round(market_edge, 4),
        "ev": round(ev, 4),
        "confidence": round(model_probability, 4),
        "edge": round(market_edge * 100, 1),
        "result": "PENDING",
        "ft": None,
        "source_url": row["h2h_url"],
        "summary_url": row["summary_url"],
        "policy": POLICY,
        "engine": ENGINE,
        "gates": {
            "data_quality": "PASS",
            "competition_quality": "PASS",
            "underlying_performance": "PASS",
            "market_edge": "PASS",
            "ev": "PASS",
            "beta_odds_cap": "PASS",
            "lineup": "PENDING_PREKICK_RECHECK",
            "market_movement": "BASELINE_RECORDED",
            "rest_rotation": "UNVERIFIED_GOALOO_TRANSITION",
        },
        "underlying": underlying,
        "model": {
            "lambda_home": model["lambda_home"],
            "lambda_away": model["lambda_away"],
            "home_win": model["home_win"],
            "draw": model["draw"],
            "away_win": model["away_win"],
            "h2h_adjustment": model.get("h2h_adjustment"),
        },
        "data_quality": {
            "home_recent": len(hr),
            "away_recent": len(ar),
            "h2h_n": h2h_n,
            "primary_source": "Goaloo direct feeds",
            "underlying_basis": "equivalent form; xG/SoT feed not yet proven",
        },
    }, None


def selection(date_str):
    fixtures = v8.date_matches(date_str)
    odds_map = v8.load_odds()
    qualified, rejected, reasons, near = [], [], Counter(), []

    for row in fixtures:
        rec, err = analyse(row, date_str, odds_map)
        if rec:
            qualified.append(rec)
        else:
            err = err or {"reason": "UNKNOWN"}
            reason = err.get("reason", "UNKNOWN")
            reasons[reason] += 1
            if len(rejected) < 16:
                rejected.append({"match": f"{row['home']} vs {row['away']}", **err})
            if err.get("market_edge") is not None or err.get("ev") is not None:
                near.append({"match": f"{row['home']} vs {row['away']}", **err})

    qualified.sort(key=lambda x: (x["ev"], x["market_edge"], x["model_probability"]), reverse=True)
    # Publish every candidate that passes all KING V2 gates; no daily count cap.

    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    feed.update({
        "updated_at": core.now_iso(),
        "selection_date": date_str,
        "today": qualified,
        "history": feed.get("history") or [],
        "engine": ENGINE,
        "policy": POLICY,
        "no_pick": len(qualified) == 0,
        "no_pick_message": "NO KING PICK TODAY" if not qualified else None,
    })
    core.save_json(core.FEED_PATH, feed)

    prev = core.load_json(core.STATE_PATH, {})
    state = {
        "engine": ENGINE,
        "policy": POLICY,
        "status": "OK" if fixtures else "SOURCE_EMPTY",
        "last_selection_run": core.now_iso(),
        "last_settlement_run": prev.get("last_settlement_run"),
        "selection_date": date_str,
        "fixtures_seen": len(fixtures),
        "qualified": len(qualified),
        "pending": len(qualified),
        "max_daily_picks": MAX_PICKS,
        "no_pick": len(qualified) == 0,
        "primary_source": "Goaloo bf_us.js + H2H + goal50.xml",
        "decision_layer": "KING V2 value-first transition",
        "rejected": max(0, len(fixtures) - len(qualified)),
        "rejection_reasons": dict(reasons),
        "rejection_samples": rejected,
        "near_gate_top": near[:12],
        "source_health": v8.HEALTH,
        "policy_limits": {
            "market_edge_min": MIN_MARKET_EDGE,
            "ev_min": MIN_EV,
            "odds_max": MAX_ODDS,
            "minimum_odds": None,
            "underlying_required": "3/4",
            "recent_sample_min_each": MIN_RECENT,
        },
        "transition_notes": [
            "No daily pick-count cap: every candidate passing all KING V2 gates is published.",
            "Legacy confidence>=58%, edge>=12pt and odds>=1.70 gates retired for selection.",
            "Goaloo-equivalent underlying form is used until xG/SoT feeds are proven.",
            "Lineup/rest-rotation enrichment is not yet proven in the Goaloo collector and is explicitly flagged, not fabricated.",
        ],
    }
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({
        "fixtures": len(fixtures),
        "qualified": len(qualified),
        "no_pick": not qualified,
        "reasons": dict(reasons),
        "health": v8.HEALTH,
    }))


def self_test():
    priced = fair_market({"home": 2.0, "draw": 3.5, "away": 4.0})
    assert priced and abs(sum(priced["fair"].values()) - 1.0) < 1e-9
    assert MAX_PICKS is None and MIN_MARKET_EDGE == 0.05 and MIN_EV == 0.05 and MAX_ODDS == 3.0
    assert 1.25 <= MAX_ODDS
    print("the-king-v10-king-v2-goaloo-transition self-test OK")


def main():
    import argparse
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("select")
    s.add_argument("--date", required=True)
    sp.add_parser("self-test")
    a = p.parse_args()
    if a.cmd == "select":
        selection(a.date)
    else:
        self_test()


if __name__ == "__main__":
    main()
