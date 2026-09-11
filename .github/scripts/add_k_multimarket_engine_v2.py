#!/usr/bin/env python3
"""Prediction2 ADD K v2 — correct Goaloo Asian Handicap sign semantics.

Goaloo goal50.xml exposes the AH line using the opposite sign convention from
NOMAD's public pick/settlement convention. V1 passed that line through for HOME
and only negated AWAY, so + / - were reversed on Prediction2 AH picks.

This wrapper keeps the existing 1X2/O-U engine intact, normalizes the Goaloo AH
line once at ingestion, and repairs only same-day pending AH picks that were
created by the affected v1 engine. It does not touch CAR/NOMAD 3.41/3.42/3.43.
"""
from __future__ import annotations

import argparse
import copy
import json

import add_k_multimarket_engine as base

OLD_ENGINE = "add-k-multimarket-goaloo-v1"
ENGINE = "add-k-multimarket-goaloo-v2-ah-sign"

_raw_parse_goal50_markets = base.parse_goal50_markets


def parse_goal50_markets(source):
    """Return Goaloo markets with AH normalized to NOMAD team handicap signs."""
    out = _raw_parse_goal50_markets(source)
    for record in out.values():
        ah = record.get("asianHandicap")
        if not ah:
            continue
        raw_line = base._number(ah.get("line"))
        if raw_line is None:
            continue
        ah["source_line"] = raw_line
        ah["line"] = -raw_line
        ah["sign_convention"] = "NOMAD_TEAM_HANDICAP"
    return out


# Patch only the Prediction2 ADD K module runtime.
base.parse_goal50_markets = parse_goal50_markets
base.ENGINE = ENGINE


def _is_affected_pending_ah(rec):
    return (
        str(rec.get("market") or "").upper() == "AH"
        and str(rec.get("result") or "PENDING").upper() == "PENDING"
        and str(rec.get("engine") or "") == OLD_ENGINE
    )


def _repair_same_day_pending_ah(date_str):
    feed = base.core.load_json(base.core.FEED_PATH, {"today": [], "history": []})
    today = list(feed.get("today") or [])
    if feed.get("selection_date") != date_str or not any(_is_affected_pending_ah(r) for r in today):
        return False

    fixtures = base.v8.date_matches(date_str)
    fixture_by_id = {str(row.get("id")): row for row in fixtures}
    odds_map = base.load_markets()

    repaired = []
    dropped = []
    next_today = []
    for rec in today:
        if not _is_affected_pending_ah(rec):
            next_today.append(rec)
            continue

        row = fixture_by_id.get(str(rec.get("goaloo_id") or ""))
        if not row:
            dropped.append({"id": rec.get("id"), "reason": "FIXTURE_NOT_AVAILABLE"})
            continue

        replacement, err = base.analyse(row, date_str, odds_map)
        if replacement:
            next_today.append(replacement)
            repaired.append({
                "goaloo_id": rec.get("goaloo_id"),
                "old_pick": rec.get("pick"),
                "new_pick": replacement.get("pick"),
                "new_market": replacement.get("market"),
            })
        else:
            dropped.append({
                "goaloo_id": rec.get("goaloo_id"),
                "old_pick": rec.get("pick"),
                "reason": (err or {}).get("reason", "NO_CORRECTED_PICK"),
            })

    feed["today"] = next_today
    feed["engine"] = ENGINE
    feed["updated_at"] = base.core.now_iso()
    profile = copy.deepcopy(feed.get("selection_profile") or {})
    profile["ah_sign_convention"] = "Goaloo raw sign inverted before HOME/AWAY assignment"
    feed["selection_profile"] = profile
    base.core.save_json(base.core.FEED_PATH, feed)

    state = base.core.load_json(base.core.STATE_PATH, {})
    state.update({
        "engine": ENGINE,
        "ah_sign_fix": {
            "status": "ACTIVE",
            "convention": "goal50 raw AH line inverted once at ingestion",
            "repaired_same_day": repaired,
            "dropped_invalid_same_day": dropped,
            "at": base.core.now_iso(),
        },
        "pending": sum(str(x.get("result") or "PENDING").upper() == "PENDING" for x in next_today),
    })
    base.core.save_json(base.core.STATE_PATH, state)

    print(json.dumps({
        "date": date_str,
        "engine": ENGINE,
        "ah_sign_fix": True,
        "repaired": repaired,
        "dropped": dropped,
        "today_count": len(next_today),
    }))
    return True


def selection(date_str):
    if _repair_same_day_pending_ah(date_str):
        return
    base.selection(date_str)


def self_test():
    xml = "<c><match><m>3018359,1,-0.25,0.82,0.96,2,1.80,3.20,4.50,3,2.5,.80,.90</m></match></c>"
    markets = parse_goal50_markets(xml)["3018359"]
    ah = markets["asianHandicap"]
    assert ah["source_line"] == -0.25
    assert ah["line"] == 0.25
    assert float(ah["line"]) == 0.25       # HOME +0.25
    assert -float(ah["line"]) == -0.25    # AWAY -0.25
    assert base.result_label(base.settlement_score("AH", "HOME", 0.25, 1, 1)) == "HALF_WIN"
    assert base.result_label(base.settlement_score("AH", "AWAY", -0.25, 1, 1)) == "HALF_LOSS"
    assert markets["oneXtwo"]["home"] == 1.8
    assert markets["overUnder"]["over"] == 1.8
    print("ADD K v2 AH sign self-test OK")


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
        base.settle()
    else:
        self_test()


if __name__ == "__main__":
    main()
