#!/usr/bin/env python3
"""The King v4 orchestration diagnostics.

Uses the v3 Soccerway adapter and the unchanged v1/v2 model/gates. Adds only
health/rejection telemetry so source failures are distinguishable from a real
NO PICK day.
"""
import json
from collections import Counter

import the_king_engine as core
import the_king_engine_v3  # applies current source adapters to core


def selection_with_diagnostics(date_str):
    http = core.Http()
    feed = core.load_json(core.FEED_PATH, {"history": [], "today": []})
    fixtures, errors = core.discover_fixtures(http, date_str)
    qualified, rejected = [], []
    reasons = Counter()
    samples = []

    for fx in fixtures[:180]:
        try:
            rec, rej = core.analyse_fixture(http, fx, date_str)
            if rec:
                qualified.append(rec)
                continue
            rej = rej or {"reason": "UNKNOWN_REJECT"}
            reason = str(rej.get("reason") or "UNKNOWN_REJECT")
            home_n = int(rej.get("home_n") or 0)
            away_n = int(rej.get("away_n") or 0)
            if reason == "MODEL_GATE" and (home_n < 5 or away_n < 5):
                reason = "FORM_DATA_SHORT"
            reasons[reason] += 1
            rejected.append({"match": f'{fx["home"]} vs {fx["away"]}', **rej})
            if len(samples) < 8:
                samples.append({"match": f'{fx["home"]} vs {fx["away"]}', "reason": reason,
                                "home_n": home_n, "away_n": away_n,
                                "odds": rej.get("odds")})
        except Exception as e:
            reasons["ENGINE_ERROR"] += 1
            rejected.append({"match": f'{fx["home"]} vs {fx["away"]}', "reason": "ENGINE_ERROR", "detail": str(e)[:160]})
            if len(samples) < 8:
                samples.append({"match": f'{fx["home"]} vs {fx["away"]}', "reason": "ENGINE_ERROR"})

    qualified.sort(key=lambda x: (x["confidence"], x["edge"], x["odds"]), reverse=True)
    qualified = qualified[:6]
    history = feed.get("history") or []
    known = {x.get("id") for x in history if x.get("id")}
    for rec in qualified:
        if rec["id"] not in known:
            history.append(rec.copy())

    feed.update({
        "today": qualified,
        "history": history,
        "updated_at": core.now_iso(),
        "dataset": "the-king-live",
        "note": "Automated Full-Time Winner First feed. Supplemental markets remain unpublished."
    })
    core.save_json(core.FEED_PATH, feed)

    state = core.load_json(core.STATE_PATH, {})
    state.update({
        "engine": "the-king-v4",
        "last_selection_run": core.now_iso(),
        "selection_date": date_str,
        "fixtures_seen": len(fixtures),
        "qualified": len(qualified),
        "rejected": len(rejected),
        "rejection_reasons": dict(sorted(reasons.items())),
        "rejection_samples": samples,
        "pending": sum(1 for x in history if x.get("result") == "PENDING"),
        "source_health": http.health,
        "discovery_errors": errors,
        "status": "OK" if fixtures else "SOURCE_EMPTY"
    })
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"mode": "select", "date": date_str, "fixtures": len(fixtures),
                      "qualified": len(qualified), "reasons": dict(reasons),
                      "pending": state["pending"]}))


core.selection = selection_with_diagnostics

if __name__ == "__main__":
    core.main()
