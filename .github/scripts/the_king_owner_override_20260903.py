#!/usr/bin/env python3
"""Owner one-day threshold override for 2026-09-03.

For this date only, use the Goaloo fixture/H2H/1X2 collector and composite
probability model, with the owner's requested publication thresholds:

- selected 1X2 winner probability >= 40%
- selected-side decimal odds >= 1.88
- no daily pick-count cap

Keep the current structural safety guards: at least 8 recent matches per side,
a valid Goaloo 1X2 price, non-draw winner side, and the existing beta odds
safety ceiling of 3.00. KING V2 underlying/market-edge/EV hard gates and the
legacy v9 58%/12pt gate are not publication gates for this one-day run.
Other dates continue through the normal KING V2 engine.
"""
import argparse
import json
from collections import Counter

import the_king_engine as core
import the_king_engine_v8 as v8
import the_king_engine_v9 as v9
import the_king_engine_v10 as v10

OVERRIDE_DATE = "2026-09-03"
MIN_CONFIDENCE = 0.40
MIN_ODDS = 1.88
MAX_ODDS = v10.MAX_ODDS
MAX_PICKS = None
MIN_RECENT = v10.MIN_RECENT
ENGINE = "the-king-owner-override-20260903-goaloo-composite"
POLICY = "OWNER_ONE_DAY_THRESHOLD_OVERRIDE"
OVERRIDE_NAME = "OWNER_ONE_DAY_2026-09-03"


def _override_meta():
    return {
        "name": OVERRIDE_NAME,
        "date": OVERRIDE_DATE,
        "minimum_confidence": MIN_CONFIDENCE,
        "minimum_odds": MIN_ODDS,
        "maximum_odds_safety": MAX_ODDS,
        "recent_sample_min_each": MIN_RECENT,
        "max_picks": MAX_PICKS,
        "scope": "ONE_DAY_ONLY",
        "normal_engine_after_date": v10.ENGINE,
    }


def analyse_owner(row, date_str, odds_map):
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

    side = model.get("side")
    if side not in ("home", "away"):
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
        locked = float(market[side])
    except Exception:
        return None, {"reason": "INVALID_SELECTED_ODDS"}

    confidence = float(model["home_win"] if side == "home" else model["away_win"])
    if confidence < MIN_CONFIDENCE:
        return None, {
            "reason": "OWNER_MIN_CONFIDENCE",
            "confidence": round(confidence, 4),
            "required": MIN_CONFIDENCE,
            "odds": round(locked, 2),
        }
    if locked < MIN_ODDS:
        return None, {
            "reason": "OWNER_MIN_ODDS",
            "odds": round(locked, 2),
            "required": MIN_ODDS,
            "confidence": round(confidence, 4),
        }
    if locked > MAX_ODDS:
        return None, {
            "reason": "ODDS_SAFETY_MAX",
            "odds": round(locked, 2),
            "maximum": MAX_ODDS,
            "confidence": round(confidence, 4),
        }

    priced = v10.fair_market(market)
    market_fair_probability = None
    market_edge = None
    ev = confidence * locked - 1.0
    if priced:
        market_fair_probability = float(priced["fair"][side])
        market_edge = confidence - market_fair_probability

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
        "confidence": round(confidence, 4),
        "model_probability": round(confidence, 4),
        "market_fair_probability": None if market_fair_probability is None else round(market_fair_probability, 4),
        "market_edge": None if market_edge is None else round(market_edge, 4),
        "ev": round(ev, 4),
        "edge": "—" if market_edge is None else round(market_edge * 100, 1),
        "result": "PENDING",
        "ft": None,
        "source_url": row["h2h_url"],
        "summary_url": row["summary_url"],
        "policy": POLICY,
        "engine": ENGINE,
        "selection_override": _override_meta(),
        "gates": {
            "data_quality": "PASS",
            "competition_quality": "PASS",
            "goaloo_1x2_market": "PASS",
            "owner_confidence_min": "PASS",
            "owner_odds_min": "PASS",
            "odds_safety_max": "PASS",
            "owner_daily_cap": "UNLIMITED",
            "king_v2_underlying": "NOT_A_GATE_TODAY",
            "king_v2_market_edge": "INFO_ONLY_TODAY",
            "king_v2_ev": "INFO_ONLY_TODAY",
            "lineup": "NOT_A_GATE_TODAY",
            "market_movement": "NOT_A_GATE_TODAY",
            "rest_rotation": "NOT_A_GATE_TODAY",
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
    if date_str != OVERRIDE_DATE:
        raise SystemExit(f"owner override is only valid for {OVERRIDE_DATE}; got {date_str}")

    fixtures = v8.date_matches(date_str)
    odds_map = v8.load_odds()
    qualified, rejected, reasons, near = [], [], Counter(), []

    for row in fixtures:
        rec, err = analyse_owner(row, date_str, odds_map)
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
    # No slice: owner explicitly requested unlimited qualified picks today.
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
        "selection_override": _override_meta(),
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
        "decision_layer": "Owner one-day Goaloo composite threshold override with current safety guards",
        "selection_override": _override_meta(),
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
            "goaloo_1x2_required": True,
            "king_v2_underlying_gate": "BYPASSED_TODAY",
            "king_v2_market_edge_gate": "BYPASSED_TODAY",
            "king_v2_ev_gate": "BYPASSED_TODAY",
            "legacy_58pct_12pt_gate": "BYPASSED_TODAY",
        },
        "transition_notes": [
            "Owner one-day override applies only on 2026-09-03.",
            "Active owner publication thresholds today: selected winner probability >=40% and selected-side odds >=1.88.",
            "No daily pick-count cap today.",
            "Current structural guards stay active: >=8 recent matches per team, valid Goaloo 1X2, non-draw side and beta odds safety ceiling <=3.00.",
            "KING V2 underlying/market-edge/EV hard gates and legacy v9 58%/12pt eligibility are bypassed for this date only.",
            "Scheduled selections on all other dates continue through the normal KING V2 engine.",
        ],
    }
    core.save_json(core.STATE_PATH, state)

    print(json.dumps({
        "date": date_str,
        "override": OVERRIDE_NAME,
        "fixtures": len(fixtures),
        "qualified": len(qualified),
        "picks": [
            {
                "match": f"{x['home']} vs {x['away']}",
                "pick": x["pick"],
                "confidence": x["confidence"],
                "odds": x["odds"],
                "goaloo_id": x["goaloo_id"],
            }
            for x in qualified
        ],
        "no_pick": not qualified,
        "reasons": dict(reasons),
        "health": v8.HEALTH,
    }))


def self_test():
    assert OVERRIDE_DATE == "2026-09-03"
    assert MIN_CONFIDENCE == 0.40
    assert MIN_ODDS == 1.88
    assert MAX_ODDS == 3.00
    assert MAX_PICKS is None
    assert MIN_RECENT == 8
    assert v10.MAX_PICKS is None
    print("the-king-owner-override-20260903 self-test OK")


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
