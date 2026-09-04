#!/usr/bin/env python3
"""Authoritative reconciliation for The King settlement.

Only Goaloo direct bf_us rows may settle a pick. A record is trusted only when:
- exact goaloo_id exists in the direct index
- home/away names still match the selected fixture
- Goaloo terminal state is -1
- both final scores are integer values in the safe 0..30 range

Any current TODAY result that cannot be re-verified by those rules is reset to
PENDING. Current-day history entries are rebuilt from trusted direct finals only.
"""
import argparse
import json
import re

import the_king_engine as core
import the_king_engine_v8 as v8

SOURCE = "goaloo-bf_us-direct-index"
MAX_GOALS = 30


def norm(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def safe_score(value):
    try:
        number = float(value)
    except Exception:
        return None
    if not number.is_integer():
        return None
    number = int(number)
    return number if 0 <= number <= MAX_GOALS else None


def result_for(rec, home_goals, away_goals):
    side = str(rec.get("side") or "").lower()
    if side == "home":
        return "WIN" if home_goals > away_goals else "LOSS"
    if side == "away":
        return "WIN" if away_goals > home_goals else "LOSS"
    return None


def self_test():
    assert safe_score("2") == 2
    assert safe_score(30) == 30
    assert safe_score("81") is None
    assert safe_score("1.5") is None
    assert result_for({"side": "home"}, 2, 1) == "WIN"
    assert result_for({"side": "away"}, 2, 1) == "LOSS"
    assert result_for({"side": "home"}, 1, 1) == "LOSS"
    print("the-king-direct-reconcile self-test OK")


def reconcile():
    rows = v8.load_index()
    index = {str(row.get("id")): row for row in rows}
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    today = feed.get("today") or []
    history = feed.get("history") or []
    now = core.now_iso()

    today_ids = {str(rec.get("id")) for rec in today if rec.get("id") is not None}
    # Remove copies of current TODAY records from history first; trusted finals are re-added below.
    clean_history = [item for item in history if str(item.get("id")) not in today_ids]

    trusted = 0
    reset = 0
    missing_ids = 0
    team_mismatch = 0
    invalid_scores = 0
    non_terminal = 0

    for rec in today:
        row = index.get(str(rec.get("goaloo_id") or ""))
        reason = None
        if not row:
            missing_ids += 1
            reason = "MISSING_DIRECT_ID"
        elif norm(row.get("home")) != norm(rec.get("home")) or norm(row.get("away")) != norm(rec.get("away")):
            team_mismatch += 1
            reason = "TEAM_MISMATCH"
        elif row.get("state") != -1:
            non_terminal += 1
            reason = "NOT_FINAL"
        else:
            hg = safe_score(row.get("score_home"))
            ag = safe_score(row.get("score_away"))
            if hg is None or ag is None:
                invalid_scores += 1
                reason = "INVALID_SCORE"
            else:
                outcome = result_for(rec, hg, ag)
                if outcome is None:
                    reason = "INVALID_SIDE"
                else:
                    rec["ft"] = f"{hg}-{ag}"
                    rec["result"] = outcome
                    rec["settlement_source"] = SOURCE
                    rec["goaloo_terminal_state"] = -1
                    rec["settlement_verified_at"] = now
                    clean_history.append(dict(rec))
                    trusted += 1

        if reason:
            had_untrusted = rec.get("result") != "PENDING" or rec.get("ft") is not None or rec.get("settlement_source")
            rec["result"] = "PENDING"
            rec["ft"] = None
            for key in ("settlement_source", "goaloo_terminal_state", "settled_at", "settlement_verified_at"):
                rec.pop(key, None)
            if had_untrusted:
                reset += 1

    feed["history"] = clean_history
    feed["updated_at"] = now
    core.save_json(core.FEED_PATH, feed)

    state = core.load_json(core.STATE_PATH, {})
    state["last_settlement_run"] = now
    state["pending"] = sum(rec.get("result") == "PENDING" for rec in today)
    state["settled_this_run"] = trusted
    state["settlement_fallback"] = {
        "mode": "DISABLED",
        "reason": "Goaloo direct index is authoritative",
        "last_run": now,
    }
    state["direct_reconcile"] = {
        "source": SOURCE,
        "index_ok": bool(rows),
        "index_rows": len(rows),
        "trusted_settled": trusted,
        "reset_untrusted": reset,
        "missing_ids": missing_ids,
        "team_mismatch": team_mismatch,
        "invalid_scores": invalid_scores,
        "non_terminal": non_terminal,
        "last_run": now,
    }
    core.save_json(core.STATE_PATH, state)

    print(json.dumps({
        "source": SOURCE,
        "index_rows": len(rows),
        "trusted_settled": trusted,
        "reset_untrusted": reset,
        "pending": state["pending"],
        "missing_ids": missing_ids,
        "team_mismatch": team_mismatch,
        "invalid_scores": invalid_scores,
        "non_terminal": non_terminal,
    }))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("self-test", "reconcile"))
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
    else:
        reconcile()


if __name__ == "__main__":
    main()
