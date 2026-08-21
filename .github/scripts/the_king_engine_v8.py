#!/usr/bin/env python3
"""The King v8 — Goaloo direct-feed engine.

Fixtures/status/results: verified Goaloo bf_us.js feed.
1X2 odds: verified Goaloo goal50.xml (1xBet) feed.
Recent form/H2H: Goaloo match H2H page, static first then browser fallback.
All The King selection gates remain isolated from CAR live engines.
"""
import json
import re
import time
from collections import Counter
from urllib.parse import quote

import requests

import the_king_engine as core
import the_king_engine_v7 as v7

INDEX_URLS = [
    "https://live10.goaloo28.com/gf/data/bf_us.js",
    "https://live10.goaloo28.com/gf/data/bf_us1.js",
]
ODDS_URL = "https://live10.goaloo28.com/gf/data/odds/en/goal50.xml"
GOALOO_BASE = "https://www.goaloo.com"
EXCLUDE = re.compile(r"\b(?:international club friendly|club friendly|friendly|u[- ]?\d{2}|youth|reserve)\b", re.I)
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": core.USER_AGENT, "Accept-Language": "en-US,en;q=0.8", "Accept": "*/*"})
HEALTH = {"index_url": None, "index_ok": False, "odds_ok": False, "index_rows": 0, "odds_rows": 0,
          "h2h_static_ok": 0, "h2h_browser_fallback": 0, "errors": []}


def fetch_text(url, timeout=22):
    sep = "&" if "?" in url else "?"
    u = f"{url}{sep}t={int(time.time())}"
    r = SESSION.get(u, timeout=timeout)
    r.raise_for_status()
    if len(r.text) < 20:
        raise RuntimeError(f"short response {len(r.text)}")
    return r.text


def js_scalar(s):
    s = (s or "").strip()
    if not s or s in ("null", "undefined"):
        return None
    if re.fullmatch(r"-?\d+(?:\.\d+)?", s):
        return float(s) if "." in s else int(s)
    return s


def split_js_array(body):
    out, token, quotech, esc = [], "", None, False
    for ch in body:
        if quotech:
            if esc:
                token += ch; esc = False; continue
            if ch == "\\":
                esc = True; continue
            if ch == quotech:
                quotech = None; continue
            token += ch; continue
        if ch in ("'", '"'):
            quotech = ch; continue
        if ch == ",":
            out.append(js_scalar(token)); token = ""; continue
        token += ch
    out.append(js_scalar(token))
    return out


def parse_arrays(src, var):
    out = {}
    rx = re.compile(rf"{re.escape(var)}\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;", re.M)
    for m in rx.finditer(src):
        out[int(m.group(1))] = split_js_array(m.group(2))
    return out


def parse_index(src):
    A, B = parse_arrays(src, "A"), parse_arrays(src, "B")
    rows = []
    for idx, row in A.items():
        if len(row) < 11:
            continue
        try:
            state = int(row[8]) if row[8] is not None else None
        except Exception:
            state = None
        if state is None:
            continue
        league_row = B.get(int(row[1])) if row[1] is not None else None
        league = str((league_row or [None, None, ""])[2] or "Goaloo")
        rows.append({
            "id": str(row[0]), "league": league, "home": str(row[4] or ""), "away": str(row[5] or ""),
            "kickoff": str(row[6] or ""), "state": state,
            "score_home": row[9], "score_away": row[10],
        })
    return rows


def load_index():
    errors = []
    for url in INDEX_URLS:
        try:
            src = fetch_text(url)
            rows = parse_index(src)
            if rows:
                HEALTH.update({"index_url": url, "index_ok": True, "index_rows": len(rows)})
                return rows
        except Exception as e:
            errors.append(f"{url}: {e}")
    HEALTH["errors"].extend(errors)
    return []


def parse_goal50(src):
    out = {}
    for m in re.finditer(r"<m>([^<]+)</m>", src):
        row = [x.strip() for x in m.group(1).split(",")]
        if len(row) < 9 or not row[0].isdigit():
            continue
        try:
            h, d, a = float(row[6]), float(row[7]), float(row[8])
        except Exception:
            continue
        if min(h, d, a) <= 1.0:
            continue
        out[row[0]] = {"bookmaker": "1xBet", "home": h, "draw": d, "away": a}
    return out


def load_odds():
    try:
        odds = parse_goal50(fetch_text(ODDS_URL))
        HEALTH.update({"odds_ok": bool(odds), "odds_rows": len(odds)})
        return odds
    except Exception as e:
        HEALTH["errors"].append(f"goal50.xml: {e}")
        return {}


def slugify(s):
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def h2h_url(row):
    slug = slugify(f"{row['league']} {row['home']} vs {row['away']}")
    return f"{GOALOO_BASE}/football/{slug}/h2h-{row['id']}"


def summary_url(row):
    slug = slugify(f"{row['league']} {row['home']} vs {row['away']}")
    return f"{GOALOO_BASE}/football/{slug}/summary-{row['id']}"


def date_matches(date_str):
    rows = load_index()
    selected = []
    for r in rows:
        raw = f"{r['league']} {r['home']} {r['away']}"
        if EXCLUDE.search(raw):
            continue
        # Goaloo kickoff string is calendar-like. Keep rows for the requested Bangkok-day label.
        if date_str not in r["kickoff"]:
            continue
        if r["state"] not in (0, -1):
            continue
        r["h2h_url"] = h2h_url(r); r["summary_url"] = summary_url(r)
        selected.append(r)
    return selected


def get_h2h_html(row):
    try:
        html = fetch_text(row["h2h_url"])
        # Static Goaloo H2H pages normally expose Previous Scores Statistics server-side.
        if "Previous Scores Statistics" in html or "Head to Head Statistics" in html:
            HEALTH["h2h_static_ok"] += 1
            return html
    except Exception:
        pass
    HEALTH["h2h_browser_fallback"] += 1
    return v7.render(row["h2h_url"], 700)


def h2h_hint(html, home, away):
    return v7.h2h_edge(html, home, away)


def analyse(row, date_str, odds_map):
    try:
        html = get_h2h_html(row)
    except Exception as e:
        return None, {"reason": "GOALOO_H2H_FETCH_FAILED", "detail": str(e)[:120]}
    hr = v7.rows_for_team(html, row["home"], 10)
    ar = v7.rows_for_team(html, row["away"], 10)
    if len(hr) < 5 or len(ar) < 5:
        return None, {"reason": "GOALOO_FORM_SHORT", "home_n": len(hr), "away_n": len(ar)}
    model = core.score_model(hr, ar)
    if not model or not model.get("eligible") or model.get("side") == "draw":
        return None, {"reason": "MODEL_GATE", "home_n": len(hr), "away_n": len(ar)}
    side = model["side"]
    he, hn = h2h_hint(html, row["home"], row["away"])
    adjustment = max(-.02, min(.02, .02 * he))
    conf = float(model["confidence"]) + (adjustment if side == "home" else -adjustment)
    second = max(float(model["draw"]), float(model["away_win"] if side == "home" else model["home_win"]))
    edge = conf - second
    if conf < .58 or edge < .12:
        return None, {"reason": "WINNER_FIRST_GATE", "confidence": round(conf,4), "edge": round(edge,4)}
    market = odds_map.get(row["id"])
    if not market:
        return None, {"reason": "NO_GOALOO_1X2_ODDS", "home_n": len(hr), "away_n": len(ar)}
    locked = float(market[side])
    if locked < 1.70:
        return None, {"reason": "ODDS_GATE", "odds": locked}
    team = row["home"] if side == "home" else row["away"]
    return {
        "id": core.stable_id(date_str, row["home"], row["away"]), "goaloo_id": row["id"],
        "date": date_str, "kickoff": row["kickoff"], "league": row["league"],
        "home": row["home"], "away": row["away"], "pick": f"{team} Win", "side": side,
        "odds": round(locked,2), "odds_source": "1xBet / Goaloo goal50.xml",
        "confidence": round(conf,4), "edge": round(edge*100,1), "result": "PENDING", "ft": None,
        "source_url": row["h2h_url"], "summary_url": row["summary_url"],
        "model": {"lambda_home": model["lambda_home"], "lambda_away": model["lambda_away"],
                  "home_win": model["home_win"], "draw": model["draw"], "away_win": model["away_win"]},
        "data_quality": {"home_recent": len(hr), "away_recent": len(ar), "h2h_n": hn,
                         "primary_source": "Goaloo direct feeds"},
    }, None


def selection(date_str):
    fixtures = date_matches(date_str)
    odds_map = load_odds()
    qualified, rejected, reasons = [], [], Counter()
    for row in fixtures:
        rec, err = analyse(row, date_str, odds_map)
        if rec:
            qualified.append(rec)
        else:
            reason = (err or {}).get("reason", "UNKNOWN")
            reasons[reason] += 1
            if len(rejected) < 12:
                rejected.append({"match": f"{row['home']} vs {row['away']}", **(err or {})})
    qualified.sort(key=lambda x: (x["confidence"], x["edge"]), reverse=True)
    qualified = qualified[:6]
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    feed.update({"updated_at": core.now_iso(), "selection_date": date_str, "today": qualified,
                 "history": feed.get("history") or [], "engine": "the-king-v8-goaloo-direct"})
    core.save_json(core.FEED_PATH, feed)
    prev = core.load_json(core.STATE_PATH, {})
    state = {"engine": "the-king-v8-goaloo-direct", "status": "OK" if fixtures else "SOURCE_EMPTY",
             "last_selection_run": core.now_iso(), "last_settlement_run": prev.get("last_settlement_run"),
             "selection_date": date_str, "fixtures_seen": len(fixtures), "qualified": len(qualified),
             "pending": len(qualified), "primary_source": "Goaloo bf_us.js + H2H + goal50.xml",
             "rejected": max(0, len(fixtures)-len(qualified)), "rejection_reasons": dict(reasons),
             "rejection_samples": rejected, "source_health": HEALTH}
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"fixtures": len(fixtures), "qualified": len(qualified), "reasons": dict(reasons), "health": HEALTH}))


def safe_int(v):
    try: return int(float(v))
    except Exception: return None


def settle():
    index = {r["id"]: r for r in load_index()}
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    today, history = feed.get("today") or [], feed.get("history") or []
    changed = 0
    for rec in today:
        if rec.get("result") in ("WIN", "LOSS"):
            continue
        row = index.get(str(rec.get("goaloo_id") or ""))
        if not row or row.get("state") != -1:
            continue
        hg, ag = safe_int(row.get("score_home")), safe_int(row.get("score_away"))
        if hg is None or ag is None:
            continue
        won = hg > ag if rec.get("side") == "home" else ag > hg
        rec["ft"] = f"{hg}-{ag}"; rec["result"] = "WIN" if won else "LOSS"
        if not any(x.get("id") == rec.get("id") for x in history):
            history.append(dict(rec))
        changed += 1
    # If Goaloo direct index temporarily misses a pending ID, v7 remains a page-level fallback.
    feed["history"] = history; feed["updated_at"] = core.now_iso()
    core.save_json(core.FEED_PATH, feed)
    state = core.load_json(core.STATE_PATH, {})
    state["last_settlement_run"] = core.now_iso(); state["settled_this_run"] = changed
    state["pending"] = sum(x.get("result") == "PENDING" for x in today); state["source_health"] = HEALTH
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"settled": changed, "pending": state["pending"], "health": HEALTH}))


def main():
    import argparse
    p = argparse.ArgumentParser(); sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("select"); s.add_argument("--date", required=True)
    sp.add_parser("settle"); sp.add_parser("self-test")
    a = p.parse_args()
    if a.cmd == "select": selection(a.date)
    elif a.cmd == "settle": settle()
    else:
        sample = "A[0]=[3018359,1,0,0,'Home FC','Away FC','2026-08-21 12:00:00','',0,0,0];\nB[1]=[1,0,'Test League'];"
        rows = parse_index(sample)
        assert rows and rows[0]["id"] == "3018359" and rows[0]["home"] == "Home FC"
        xml = "<c><match><m>3018359,1,0,1.0,0.8,2,1.80,3.20,4.50,3,2.5,.8,.9</m></match></c>"
        assert parse_goal50(xml)["3018359"]["home"] == 1.8
        print("the-king-v8-goaloo-direct self-test OK")

if __name__ == "__main__":
    main()
