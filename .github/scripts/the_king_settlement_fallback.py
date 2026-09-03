#!/usr/bin/env python3
"""Conservative page-level fallback for The King settlement.

Primary settlement remains the Goaloo direct index handled by v8/v9.
This fallback only touches records still PENDING after that pass and only
accepts a full-time score when the rendered Goaloo page places an explicit
FT/Finished/Full Time marker next to the score.
"""
import json
import re

from bs4 import BeautifulSoup

import the_king_engine as core
import the_king_engine_v7 as v7

FINAL_NEAR_SCORE = (
    re.compile(r"(?:\bFT\b|\bFinished\b|\bFull\s*Time\b)\D{0,120}(\d{1,2})\s*[-–:]\s*(\d{1,2})", re.I),
    re.compile(r"(\d{1,2})\s*[-–:]\s*(\d{1,2})\D{0,120}(?:\bFT\b|\bFinished\b|\bFull\s*Time\b)", re.I),
)


def explicit_goaloo_ft(html):
    text = re.sub(r"\s+", " ", BeautifulSoup(html, "html.parser").get_text(" ", strip=True))
    for rx in FINAL_NEAR_SCORE:
        m = rx.search(text)
        if m:
            return int(m.group(1)), int(m.group(2))
    return None


def sync_history(history, rec):
    rid = rec.get("id")
    for i, item in enumerate(history):
        if item.get("id") == rid:
            history[i] = dict(rec)
            return
    history.append(dict(rec))


def settle_fallback():
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    today = feed.get("today") or []
    history = feed.get("history") or []
    checked = 0
    changed = 0
    errors = []

    for rec in today:
        if rec.get("result") != "PENDING":
            continue

        checked += 1
        ft = None
        for url in (rec.get("summary_url"), rec.get("source_url"), rec.get("live_url")):
            if not url:
                continue
            try:
                ft = explicit_goaloo_ft(v7.render(url, 500))
            except Exception as exc:
                errors.append(f"{rec.get('id') or 'unknown'}:{type(exc).__name__}")
                continue
            if ft:
                break

        if not ft:
            continue

        hg, ag = ft
        won = hg > ag if rec.get("side") == "home" else ag > hg
        rec["ft"] = f"{hg}-{ag}"
        rec["result"] = "WIN" if won else "LOSS"
        sync_history(history, rec)
        changed += 1

    feed["history"] = history
    if changed:
        feed["updated_at"] = core.now_iso()
        core.save_json(core.FEED_PATH, feed)

    state = core.load_json(core.STATE_PATH, {})
    state["settlement_fallback"] = {
        "checked": checked,
        "settled": changed,
        "errors": errors[:12],
        "mode": "Goaloo page explicit-FT only",
        "last_run": core.now_iso(),
    }
    state["pending"] = sum(x.get("result") == "PENDING" for x in today)
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({
        "fallback_checked": checked,
        "fallback_settled": changed,
        "pending": state["pending"],
        "errors": errors[:12],
    }))


if __name__ == "__main__":
    settle_fallback()
