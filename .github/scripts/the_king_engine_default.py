#!/usr/bin/env python3
"""THE KING default selection — persistent owner threshold profile.

Default publication gates:
- selected 1X2 winner probability >= 40%
- selected-side decimal odds >= 1.88
- selected-side decimal odds <= 3.00
- at least 8 recent matches per team
- draw cannot be the published main pick
- no daily pick-count cap

Reverse publication experiment:
- analysis and qualification remain on the model-selected HOME/AWAY side
- final published pick is reversed HOME <-> AWAY
- final published odds come from the reversed side's real Goaloo 1X2 price

KING V2 underlying/market-edge/EV hard gates are not publication gates in this
default profile. Market edge and EV are still calculated and stored for audit.
"""
import argparse
import json
from collections import Counter

import the_king_engine as core
import the_king_engine_v8 as v8
import the_king_engine_v9 as v9
import the_king_engine_v10 as v10

MIN_CONFIDENCE = 0.40
MIN_ODDS = 1.88
MAX_ODDS = 3.00
MAX_PICKS = None
MIN_RECENT = 8
REVERSE_PREDICTION = True
ENGINE = "the-king-default-goaloo-composite-40pct-188"
POLICY = "KING_DEFAULT_40_188"
PROFILE_NAME = "OWNER_DEFAULT_40_188"


def reverse_side(side):
    if side == "home":
        return "away"
    if side == "away":
        return "home"
    return None


def _profile_meta(date_str):
    return {
        "name": PROFILE_NAME,
        "date": date_str,
        "minimum_confidence": MIN_CONFIDENCE,
        "minimum_odds": MIN_ODDS,
        "maximum_odds_safety": MAX_ODDS,
        "recent_sample_min_each": MIN_RECENT,
        "max_picks": MAX_PICKS,
        "scope": "DEFAULT_UNTIL_OWNER_CHANGES",
        "reverse_prediction": REVERSE_PREDICTION,
        "reverse_rule": "HOME_TO_AWAY__AWAY_TO_HOME",
        "king_v2_underlying_gate": "BYPASSED",
        "king_v2_market_edge_gate": "BYPASSED",
        "king_v2_ev_gate": "BYPASSED",
    }


def analyse_default(row, date_str, odds_map):
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
        return None, {
            "reason": "GOALOO_FORM_SHORT",
            "home_n": len(home_rows),
            "away_n": len(away_rows),
            "required_each": MIN_RECENT,
        }

    h2h_edge, h2h_n = v8.h2h_hint(html, row["home"], row["away"])
    model = v9.composite_model(home_rows, away_rows, h2h_edge)
    if not model:
        return None, {
            "reason": "MODEL_DATA_SHORT",
            "home_n": len(home_rows),
            "away_n": len(away_rows),
        }

    model_side = model.get("side")
    if model_side not in ("home", "away"):
        return None, {
            "reason": "DRAW_NOT_MAIN_PICK",
            "model_probability": round(float(model.get("confidence") or 0.0), 4),
        }

    market = odds_map.get(row["id"])
    if not market:
        return None, {
            "reason": "NO_GOALOO_1X2_ODDS",
            "confidence": round(float(model.get("confidence") or 0.0), 4),
        }

    try:
        model_locked = float(market[model_side])
    except Exception:
        return None, {"reason": "INVALID_SELECTED_ODDS"}

    confidence = float(model["home_win"] if model_side == "home" else model["away_win"])
    if confidence < MIN_CONFIDENCE:
        return None, {
            "reason": "DEFAULT_MIN_CONFIDENCE",
            "confidence": round(confidence, 4),
            "required": MIN_CONFIDENCE,
            "odds": round(model_locked, 2),
        }
    if model_locked < MIN_ODDS:
        return None, {
            "reason": "DEFAULT_MIN_ODDS",
            "odds": round(model_locked, 2),
            "required": MIN_ODDS,
            "confidence": round(confidence, 4),
        }
    if model_locked > MAX_ODDS:
        return None, {
            "reason": "ODDS_SAFETY_MAX",
            "odds": round(model_locked, 2),
            "maximum": MAX_ODDS,
            "confidence": round(confidence, 4),
        }

    priced = v10.fair_market(market)
    market_fair_probability = None
    market_edge = None
    ev = confidence * model_locked - 1.0
    if priced:
        market_fair_probability = float(priced["fair"][model_side])
        market_edge = confidence - market_fair_probability

    published_side = reverse_side(model_side) if REVERSE_PREDICTION else model_side
    try:
        published_locked = float(market[published_side])
    except Exception:
        return None, {
            "reason": "INVALID_REVERSE_ODDS",
            "model_side": model_side,
            "published_side": published_side,
        }
    if published_locked <= 1.0:
        return None, {
            "reason": "INVALID_REVERSE_ODDS",
            "model_side": model_side,
            "published_side": published_side,
            "odds": published_locked,
        }

    model_team = row["home"] if model_side == "home" else row["away"]
    team = row["home"] if published_side == "home" else row["away"]
    return {
        "id": core.stable_id(date_str, row["home"], row["away"]),
        "goaloo_id": row["id"],
        "date": date_str,
        "kickoff": row["kickoff"],
        "league": row["league"],
        "home": row["home"],
        "away": row["away"],
        "pick": f"{team} Win",
        "side": published_side,
        "odds": round(published_locked, 2),
        "odds_source": "1xBet / Goaloo goal50.xml",
        "confidence": round(confidence, 4),
        "model_probability": round(confidence, 4),
        "market_fair_probability": None if market_fair_probability is None else round(market_fair_probability, 4),
        "market_edge": None if market_edge is None else round(market_edge, 4),
        "ev": round(ev, 4),
        "edge": "—" if market_edge is None else round(market_edge * 100, 1),
        "reverse_mode": REVERSE_PREDICTION,
        "model_side": model_side,
        "model_pick": f"{model_team} Win",
        "model_odds": round(model_locked, 2),
        "published_side": published_side,
        "result": "PENDING",
        "ft": None,
        "source_url": row["h2h_url"],
        "summary_url": row["summary_url"],
        "policy": POLICY,
        "engine": ENGINE,
        "selection_profile": _profile_meta(date_str),
        "gates": {
            "data_quality": "PASS",
            "competition_quality": "PASS",
            "goaloo_1x2_market": "PASS",
            "default_confidence_min": "PASS",
            "default_odds_min": "PASS",
            "odds_safety_max": "PASS",
            "reverse_prediction": "APPLIED" if REVERSE_PREDICTION else "OFF",
            "daily_cap": "UNLIMITED",
            "king_v2_underlying": "NOT_A_GATE",
            "king_v2_market_edge": "INFO_ONLY",
            "king_v2_ev": "INFO_ONLY",
            "lineup": "NOT_A_GATE",
            "market_movement": "NOT_A_GATE",
            "rest_rotation": "NOT_A_GATE",
        },
        "model": {
            "lambda_home": model["lambda_home"],
            "lambda_away": model["lambda_away"],
            "home_win": model["home_win"],
            "draw": model["draw"],
            "away_win": model["away_win"],
            "h2h_adjustment": model.get("h2h_adjustment"),
            "manual_set2": model.get("manual_set2"),
            "venue_fallback": model.get("venue_fallback"),
        },
        "data_quality": {
            "home_recent": len(home_rows),
            "away_recent": len(away_rows),
            "h2h_n": h2h_n,
            "primary_source": "Goaloo direct feeds",
        },
    }, None


def selection(date_str):
    fixtures = v8.date_matches(date_str)
    odds_map = v8.load_odds()
    qualified, rejected, reasons, near = [], [], Counter(), []

    for row in fixtures:
        rec, err = analyse_default(row, date_str, odds_map)
        if rec:
            qualified.append(rec)
            continue

        err = err or {"reason": "UNKNOWN"}
        reason = err.get("reason", "UNKNOWN")
        reasons[reason] += 1
        if len(rejected) < 30:
            rejected.append({"match": f"{row['home']} vs {row['away']}", **err})
        if err.get("confidence") is not None or err.get("odds") is not None:
            near.append({"match": f"{row['home']} vs {row['away']}", **err})

    qualified.sort(
        key=lambda x: (float(x.get("confidence") or 0), float(x.get("odds") or 0)),
        reverse=True,
    )
    near.sort(
        key=lambda x: (float(x.get("confidence") or 0), float(x.get("odds") or 0)),
        reverse=True,
    )

    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    feed.update({
        "updated_at": core.now_iso(),
        "selection_date": date_str,
        "today": qualified,
        "history": feed.get("history") or [],
        "engine": ENGINE,
        "policy": POLICY,
        "selection_profile": _profile_meta(date_str),
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
        "decision_layer": "Persistent owner default Goaloo composite thresholds + reverse publication HOME/AWAY",
        "selection_profile": _profile_meta(date_str),
        "rejected": max(0, len(fixtures) - len(qualified)),
        "rejection_reasons": dict(reasons),
        "rejection_samples": rejected,
        "near_gate_top": near[:20],
        "source_health": v8.HEALTH,
        "policy_limits": {
            "confidence_min": MIN_CONFIDENCE,
            "minimum_odds": MIN_ODDS,
            "maximum_odds_safety": MAX_ODDS,
            "max_daily_picks": MAX_PICKS,
            "recent_sample_min_each": MIN_RECENT,
            "draw_main_pick": "REJECT",
            "goaloo_1x2_required": true,
            "reverse_prediction": REVERSE_PREDICTION,
            "reverse_rule": "HOME_TO_AWAY__AWAY_TO_HOME",
            "king_v2_underlying_gate": "BYPASSED",
            "king_v2_market_edge_gate": "BYPASSED",
            "king_v2_ev_gate": "BYPASSED"
        },
        "transition_notes": [
            "Owner default profile is active until the owner explicitly changes it.",
            "Qualification remains on the model-selected side: probability >=40%, odds >=1.88 and <=3.00.",
            "Reverse publication experiment is active: model HOME publishes AWAY; model AWAY publishes HOME.",
            "Published odds are read from the reversed side's real Goaloo 1X2 price.",
            "No daily pick-count cap.",
            "Structural guards: >=8 recent matches per team, valid Goaloo 1X2, non-draw model side.",
            "KING V2 underlying/market-edge/EV remain audit information, not publication hard gates."
        ]
    }
    core.save_json(core.STATE_PATH, state)

    print(json.dumps({
        "date": date_str,
        "profile": PROFILE_NAME,
        "fixtures": len(fixtures),
        "qualified": len(qualified),
        "reverse_prediction": REVERSE_PREDICTION,
        "picks": [
            {
                "match": f"{x['home']} vs {x['away']}",
                "model_pick": x.get("model_pick"),
                "pick": x["pick"],
                "confidence": x["confidence"],
                "model_odds": x.get("model_odds"),
                "odds": x["odds"],
                "goaloo_id": x["goaloo_id"]
            }
            for x in qualified
        ],
        "no_pick": not qualified,
        "reasons": dict(reasons),
        "health": v8.HEALTH
    }))


def self_test():
    assert MIN_CONFIDENCE == 0.40
    assert MIN_ODDS == 1.88
    assert MAX_ODDS == 3.00
    assert MAX_PICKS is None
    assert MIN_RECENT == 8
    assert REVERSE_PREDICTION is True
    assert reverse_side("home") == "away"
    assert reverse_side("away") == "home"
    assert reverse_side("draw") is None
    print("the-king-engine-default self-test OK")


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    select_parser = sp.add_parser("select")
    select_parser.add_argument("--date", required=True)
    sp.add_parser("self-test")
    args = p.parse_args()
    if args.cmd == "select":
        selection(args.date)
    else:
        self_test()


if __name__ == "__main__":
    main()
