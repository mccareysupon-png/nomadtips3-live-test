#!/usr/bin/env python3
"""Owner one-day selection override for 2026-09-03.

This wrapper preserves the normal KING V2 / Goaloo analysis gates, then adds
owner-requested minimum confidence and minimum odds filters and removes the
normal daily pick cap for this date only. It publishes into the same feed/state
contract so settlement/history continue through the normal flow.
"""
import argparse
import json
from collections import Counter

import the_king_engine as core
import the_king_engine_v8 as v8
import the_king_engine_v10 as v10

OVERRIDE_DATE = "2026-09-03"
MIN_CONFIDENCE = 0.40
MIN_ODDS = 1.88
MAX_PICKS = None
OVERRIDE_NAME = "OWNER_ONE_DAY_2026-09-03"


def selection(date_str):
    if date_str != OVERRIDE_DATE:
        raise SystemExit(f"owner override is only valid for {OVERRIDE_DATE}; got {date_str}")

    fixtures = v8.date_matches(date_str)
    odds_map = v8.load_odds()
    qualified, rejected, reasons, near = [], [], Counter(), []

    for row in fixtures:
        rec, err = v10.analyse(row, date_str, odds_map)
        if rec:
            confidence = float(rec.get("confidence") or 0.0)
            locked_odds = float(rec.get("odds") or 0.0)
            if confidence < MIN_CONFIDENCE:
                err = {
                    "reason": "OWNER_MIN_CONFIDENCE",
                    "confidence": round(confidence, 4),
                    "required": MIN_CONFIDENCE,
                }
            elif locked_odds < MIN_ODDS:
                err = {
                    "reason": "OWNER_MIN_ODDS",
                    "odds": round(locked_odds, 2),
                    "required": MIN_ODDS,
                }
            else:
                rec = dict(rec)
                gates = dict(rec.get("gates") or {})
                gates.update({
                    "owner_confidence_min": "PASS",
                    "owner_odds_min": "PASS",
                    "owner_daily_cap": "UNLIMITED",
                })
                rec["gates"] = gates
                rec["selection_override"] = {
                    "name": OVERRIDE_NAME,
                    "date": OVERRIDE_DATE,
                    "minimum_confidence": MIN_CONFIDENCE,
                    "minimum_odds": MIN_ODDS,
                    "max_picks": MAX_PICKS,
                }
                qualified.append(rec)
                continue

        err = err or {"reason": "UNKNOWN"}
        reason = err.get("reason", "UNKNOWN")
        reasons[reason] += 1
        if len(rejected) < 24:
            rejected.append({"match": f"{row['home']} vs {row['away']}", **err})
        if err.get("market_edge") is not None or err.get("ev") is not None:
            near.append({"match": f"{row['home']} vs {row['away']}", **err})

    qualified.sort(
        key=lambda x: (x["ev"], x["market_edge"], x["model_probability"]),
        reverse=True,
    )
    # Intentionally no slice: owner requested unlimited qualified picks today.

    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    feed.update({
        "updated_at": core.now_iso(),
        "selection_date": date_str,
        "today": qualified,
        "history": feed.get("history") or [],
        "engine": v10.ENGINE,
        "policy": v10.POLICY,
        "selection_override": {
            "name": OVERRIDE_NAME,
            "date": OVERRIDE_DATE,
            "minimum_confidence": MIN_CONFIDENCE,
            "minimum_odds": MIN_ODDS,
            "max_picks": MAX_PICKS,
            "scope": "ONE_DAY_ONLY",
        },
        "no_pick": len(qualified) == 0,
        "no_pick_message": "NO KING PICK TODAY" if not qualified else None,
    })
    core.save_json(core.FEED_PATH, feed)

    prev = core.load_json(core.STATE_PATH, {})
    state = {
        "engine": v10.ENGINE,
        "policy": v10.POLICY,
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
        "decision_layer": "KING V2 + owner one-day override",
        "selection_override": {
            "name": OVERRIDE_NAME,
            "date": OVERRIDE_DATE,
            "minimum_confidence": MIN_CONFIDENCE,
            "minimum_odds": MIN_ODDS,
            "max_picks": MAX_PICKS,
            "scope": "ONE_DAY_ONLY",
        },
        "rejected": max(0, len(fixtures) - len(qualified)),
        "rejection_reasons": dict(reasons),
        "rejection_samples": rejected,
        "near_gate_top": near[:12],
        "source_health": v8.HEALTH,
        "policy_limits": {
            "confidence_min": MIN_CONFIDENCE,
            "minimum_odds": MIN_ODDS,
            "max_daily_picks": MAX_PICKS,
            "market_edge_min": v10.MIN_MARKET_EDGE,
            "ev_min": v10.MIN_EV,
            "odds_max": v10.MAX_ODDS,
            "underlying_required": "3/4",
            "recent_sample_min_each": v10.MIN_RECENT,
        },
        "transition_notes": [
            "Owner one-day override applies only on 2026-09-03.",
            "Confidence >= 40%, odds >= 1.88, no daily pick cap.",
            "All existing KING V2 data-quality, competition, underlying 3/4, market-edge, EV and beta max-odds gates remain active.",
            "Scheduled selections on other dates continue through the normal KING V2 engine.",
        ],
    }
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({
        "date": date_str,
        "override": OVERRIDE_NAME,
        "fixtures": len(fixtures),
        "qualified": len(qualified),
        "no_pick": not qualified,
        "reasons": dict(reasons),
        "health": v8.HEALTH,
    }))


def self_test():
    assert OVERRIDE_DATE == "2026-09-03"
    assert MIN_CONFIDENCE == 0.40
    assert MIN_ODDS == 1.88
    assert MAX_PICKS is None
    assert v10.MAX_PICKS == 2
    print("the-king-owner-override-20260903 self-test OK")


def main():
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
