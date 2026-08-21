#!/usr/bin/env python3
"""The King v7 — Goaloo-first full-time adapter.

Primary raw source: Goaloo fixture + H2H/previous-score pages.
The scoring/selection gates are inherited from The King core and remain:
Winner First, confidence >= .58, edge >= .12, locked odds >= 1.70, max 6.
No CAR live-engine files are imported or modified.
"""
import atexit
import json
import re
import shutil
from collections import Counter
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

import the_king_engine as core

GOALOO = "https://www.goaloo.com"
FIXTURE_URL = GOALOO + "/football/fixture"
MATCH_RE = re.compile(r"/football/[^?#]+/(?:summary|h2h|live)-(\d+)", re.I)
EXCLUDE = re.compile(r"(?:international[- ]club[- ]friendly|club[- ]friendly|friendly|u[- ]?\d{2}|youth|reserve)", re.I)
SCORE = re.compile(r"(?<!\d)(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\s*\([^)]*\))?")
_BROWSER = None
_CONTEXT = None
_CACHE = {}
STATS = {"goaloo_renders": 0, "goaloo_errors": 0, "goaloo_fixture_links": 0, "goaloo_h2h_pages": 0}


def chrome_path():
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        path = shutil.which(name)
        if path:
            return path
    return None


def ensure_browser():
    global _BROWSER, _CONTEXT
    if _BROWSER:
        return _CONTEXT
    from playwright.sync_api import sync_playwright
    exe = chrome_path()
    if not exe:
        raise RuntimeError("Chrome/Chromium not found")
    pw = sync_playwright().start()
    browser = pw.chromium.launch(executable_path=exe, headless=True,
                                 args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
    ctx = browser.new_context(user_agent=core.USER_AGENT, locale="en-US",
                              viewport={"width": 1440, "height": 1000})
    _BROWSER = (pw, browser)
    _CONTEXT = ctx
    return ctx


def close_browser():
    global _BROWSER, _CONTEXT
    if not _BROWSER:
        return
    try:
        pw, browser = _BROWSER
        if _CONTEXT:
            _CONTEXT.close()
        browser.close(); pw.stop()
    except Exception:
        pass
    _BROWSER = None; _CONTEXT = None


atexit.register(close_browser)


def render(url, wait_ms=1300):
    if url in _CACHE:
        return _CACHE[url]
    page = ensure_browser().new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(wait_ms)
        try:
            page.wait_for_load_state("networkidle", timeout=4000)
        except Exception:
            pass
        html = page.content()
        _CACHE[url] = html
        STATS["goaloo_renders"] += 1
        return html
    except Exception:
        STATS["goaloo_errors"] += 1
        raise
    finally:
        page.close()


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def same(a, b):
    x = re.sub(r"[^a-z0-9]+", "", (a or "").lower())
    y = re.sub(r"[^a-z0-9]+", "", (b or "").lower())
    return bool(x and y and (x == y or (len(x) > 5 and x in y) or (len(y) > 5 and y in x)))


def match_urls(href):
    href = urljoin(GOALOO + "/", href)
    m = MATCH_RE.search(href)
    if not m:
        return None
    mid = m.group(1)
    p = urlparse(href)
    prefix = re.sub(r"/(?:summary|h2h|live)-\d+/?$", "", p.path)
    base = GOALOO + prefix.rstrip("/")
    return {"id": mid, "summary": f"{base}/summary-{mid}", "h2h": f"{base}/h2h-{mid}", "live": f"{base}/live-{mid}"}


def parse_names(html, fallback_slug=""):
    soup = BeautifulSoup(html, "html.parser")
    candidates = []
    if soup.h1:
        candidates.append(clean(soup.h1.get_text(" ", strip=True)))
    if soup.title:
        candidates.append(clean(soup.title.get_text(" ", strip=True)))
    for s in candidates:
        m = re.search(r"^(.+?)\s+(?:VS|vs|V)\s+(.+?)(?:\s+(?:H2H|Analysis|Live|Summary|Prediction|Tips|\||-)|$)", s)
        if m:
            return clean(m.group(1)), clean(m.group(2))
    slug = fallback_slug.rsplit("/", 1)[-1]
    slug = re.sub(r"/(?:summary|h2h|live)-\d+$", "", slug)
    if "-vs-" in slug:
        a, b = slug.split("-vs-", 1)
        title = lambda z: re.sub(r"[-_]+", " ", z).title()
        return title(a), title(b)
    return None, None


def discover_goaloo(date_str):
    html = render(FIXTURE_URL, 1800)
    soup = BeautifulSoup(html, "html.parser")
    found = {}
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        urls = match_urls(href)
        if not urls:
            continue
        if EXCLUDE.search(href):
            continue
        found.setdefault(urls["id"], urls)
    STATS["goaloo_fixture_links"] = len(found)
    fixtures = []
    for mid, urls in list(found.items())[:220]:
        try:
            hhtml = render(urls["h2h"], 650)
            home, away = parse_names(hhtml, urls["h2h"])
            if not home or not away or EXCLUDE.search(f"{home} {away} {urls['h2h']}"):
                continue
            hsoup = BeautifulSoup(hhtml, "html.parser")
            page_text = clean(hsoup.get_text(" ", strip=True))
            league = ""
            crumb = hsoup.select_one("h1")
            if crumb:
                prev = crumb.find_previous(["a", "div"])
                league = clean(prev.get_text(" ", strip=True))[:100] if prev else ""
            fixtures.append({
                "goaloo_id": mid, "home": home, "away": away, "league": league,
                "kickoff": None, "h2h_url": urls["h2h"], "summary_url": urls["summary"],
                "live_url": urls["live"], "_h2h_html": hhtml, "_page_text": page_text,
            })
            STATS["goaloo_h2h_pages"] += 1
        except Exception:
            STATS["goaloo_errors"] += 1
    return fixtures


def rows_for_team(html, team, max_n=10):
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for tr in soup.find_all("tr"):
        cells = [clean(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
        if len(cells) < 4:
            continue
        raw = " | ".join(cells)
        if EXCLUDE.search(raw):
            continue
        score_idx = None; sm = None
        for i, c in enumerate(cells):
            m = SCORE.search(c)
            if m:
                score_idx, sm = i, m; break
        if score_idx is None or sm is None:
            continue
        home = next((cells[i] for i in range(score_idx - 1, -1, -1)
                     if cells[i] and not re.fullmatch(r"\d{1,2}/\d{1,2}(?:/\d{2,4})?", cells[i])), "")
        away = next((cells[i] for i in range(score_idx + 1, len(cells)) if cells[i] and not SCORE.search(cells[i])), "")
        if not (same(team, home) or same(team, away)):
            continue
        hg, ag = int(sm.group(1)), int(sm.group(2))
        is_home = same(team, home)
        gf, ga = (hg, ag) if is_home else (ag, hg)
        key = (home.lower(), away.lower(), hg, ag)
        if key in seen:
            continue
        seen.add(key)
        out.append({"gf": gf, "ga": ga, "result": "W" if gf > ga else "D" if gf == ga else "L",
                    "venue": "home" if is_home else "away"})
        if len(out) >= max_n:
            break
    return out


def h2h_edge(html, home, away):
    soup = BeautifulSoup(html, "html.parser")
    w = d = l = 0
    for tr in soup.find_all("tr"):
        raw = clean(tr.get_text(" ", strip=True))
        if not (same(home, raw) and same(away, raw)):
            continue
        m = SCORE.search(raw)
        if not m:
            continue
        # Only a low-weight directional hint; current form remains dominant.
        hg, ag = int(m.group(1)), int(m.group(2))
        cells = [clean(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
        joined = " | ".join(cells)
        first_home = joined.lower().find(home.lower()) < joined.lower().find(away.lower())
        gf, ga = (hg, ag) if first_home else (ag, hg)
        if gf > ga: w += 1
        elif gf == ga: d += 1
        else: l += 1
        if w + d + l >= 6:
            break
    n = w + d + l
    return ((w - l) / n if n else 0.0), n


def extract_goaloo_market(html):
    soup = BeautifulSoup(html, "html.parser")
    books = ["Bet365", "1xBet", "Pinnacle", "Crown", "Betfair", "William Hill"]
    for tr in soup.find_all("tr"):
        s = clean(tr.get_text(" ", strip=True))
        book = next((b for b in books if b.lower() in s.lower()), None)
        if not book:
            continue
        nums = [float(x) for x in re.findall(r"\b([1-9]\d?\.\d{2})\b", s)]
        nums = [x for x in nums if 1.01 <= x <= 30]
        if len(nums) >= 3:
            return {"bookmaker": book, "home": nums[0], "draw": nums[1], "away": nums[2]}
    return None


def market_for_fixture(fx):
    for url in (fx["summary_url"], fx["h2h_url"]):
        try:
            market = extract_goaloo_market(render(url, 700))
            if market:
                return market, url
        except Exception:
            pass
    return None, None


def analyse(fx, date_str):
    html = fx["_h2h_html"]
    hr = rows_for_team(html, fx["home"], 10)
    ar = rows_for_team(html, fx["away"], 10)
    if len(hr) < 5 or len(ar) < 5:
        return None, {"reason": "GOALOO_FORM_SHORT", "home_n": len(hr), "away_n": len(ar)}
    model = core.score_model(hr, ar)
    if not model or model["side"] == "draw" or not model["eligible"]:
        return None, {"reason": "MODEL_GATE", "home_n": len(hr), "away_n": len(ar)}
    # H2H is deliberately a small adjustment, capped at 2 percentage points.
    he, hn = h2h_edge(html, fx["home"], fx["away"])
    side = model["side"]
    adj = max(-.02, min(.02, .02 * he))
    conf = model["confidence"] + (adj if side == "home" else -adj)
    second = max(model["draw"], model["away_win"] if side == "home" else model["home_win"])
    edge = conf - second
    if conf < .58 or edge < .12:
        return None, {"reason": "WINNER_FIRST_GATE", "confidence": round(conf,4), "edge": round(edge,4)}
    market, odds_url = market_for_fixture(fx)
    if not market:
        return None, {"reason": "NO_GOALOO_1X2_ODDS", "home_n": len(hr), "away_n": len(ar)}
    locked = float(market[side])
    if locked < 1.70:
        return None, {"reason": "ODDS_GATE", "odds": locked}
    team = fx["home"] if side == "home" else fx["away"]
    return {
        "id": core.stable_id(date_str, fx["home"], fx["away"]), "goaloo_id": fx["goaloo_id"],
        "date": date_str, "kickoff": fx.get("kickoff"), "league": fx.get("league"),
        "home": fx["home"], "away": fx["away"], "pick": f"{team} Win", "side": side,
        "odds": round(locked, 2), "odds_source": market["bookmaker"],
        "confidence": round(conf, 4), "edge": round(edge * 100, 1), "result": "PENDING", "ft": None,
        "source_url": fx["h2h_url"], "summary_url": fx["summary_url"], "odds_url": odds_url,
        "model": {"lambda_home": model["lambda_home"], "lambda_away": model["lambda_away"],
                  "home_win": model["home_win"], "draw": model["draw"], "away_win": model["away_win"]},
        "data_quality": {"home_recent": len(hr), "away_recent": len(ar), "h2h_n": hn,
                         "primary_source": "Goaloo"},
    }, None


def selection(date_str):
    fixtures = discover_goaloo(date_str)
    qualified, rejected = [], []
    reasons = Counter()
    for fx in fixtures:
        rec, err = analyse(fx, date_str)
        if rec:
            qualified.append(rec)
        else:
            reasons[(err or {}).get("reason", "UNKNOWN")] += 1
            if len(rejected) < 12:
                rejected.append({"match": f"{fx['home']} vs {fx['away']}", **(err or {})})
    qualified.sort(key=lambda x: (x["confidence"], x["edge"]), reverse=True)
    qualified = qualified[:6]
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    history = feed.get("history") or []
    feed.update({"updated_at": core.now_iso(), "selection_date": date_str, "today": qualified,
                 "history": history, "engine": "the-king-v7-goaloo"})
    core.save_json(core.FEED_PATH, feed)
    state = {
        "engine": "the-king-v7-goaloo", "status": "OK" if fixtures else "SOURCE_EMPTY",
        "last_selection_run": core.now_iso(), "last_settlement_run": (core.load_json(core.STATE_PATH, {}) or {}).get("last_settlement_run"),
        "selection_date": date_str, "fixtures_seen": len(fixtures), "qualified": len(qualified),
        "pending": len(qualified), "primary_source": "Goaloo", "rejected": max(0, len(fixtures)-len(qualified)),
        "rejection_reasons": dict(reasons), "rejection_samples": rejected, "source_health": STATS,
    }
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"fixtures": len(fixtures), "qualified": len(qualified), "reasons": dict(reasons), **STATS}))


def parse_goaloo_ft(html, home, away):
    soup = BeautifulSoup(html, "html.parser")
    text = clean(soup.get_text(" ", strip=True))
    if not any(k in text.lower() for k in ("finished", "ft ", "full time")):
        return None
    # Prefer explicit FT score near the status.
    m = re.search(r"(?:FT|Finished)\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})", text, re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = SCORE.search(text)
    return (int(m.group(1)), int(m.group(2))) if m else None


def settle():
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    today = feed.get("today") or []
    history = feed.get("history") or []
    changed = 0
    for rec in today:
        if rec.get("result") in ("WIN", "LOSS"):
            continue
        ft = None
        for url in (rec.get("summary_url"), rec.get("source_url"), rec.get("live_url")):
            if not url:
                continue
            try:
                ft = parse_goaloo_ft(render(url, 500), rec["home"], rec["away"])
            except Exception:
                pass
            if ft:
                break
        if not ft:
            continue
        hg, ag = ft
        won = hg > ag if rec.get("side") == "home" else ag > hg
        rec["ft"] = f"{hg}-{ag}"; rec["result"] = "WIN" if won else "LOSS"
        if not any(x.get("id") == rec.get("id") for x in history):
            history.append(dict(rec))
        changed += 1
    feed["history"] = history; feed["updated_at"] = core.now_iso()
    core.save_json(core.FEED_PATH, feed)
    state = core.load_json(core.STATE_PATH, {})
    state["last_settlement_run"] = core.now_iso(); state["pending"] = sum(x.get("result") == "PENDING" for x in today)
    state["settled_this_run"] = changed; state["source_health"] = STATS
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"settled": changed, "pending": state["pending"], **STATS}))


def main():
    import argparse
    p = argparse.ArgumentParser(); sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("select"); s.add_argument("--date", required=True)
    sub.add_parser("settle"); sub.add_parser("self-test")
    a = p.parse_args()
    if a.cmd == "select": selection(a.date)
    elif a.cmd == "settle": settle()
    else:
        assert core.score_model([
            {"gf":2,"ga":0,"result":"W","venue":"home"}, {"gf":2,"ga":1,"result":"W","venue":"away"},
            {"gf":3,"ga":0,"result":"W","venue":"home"}, {"gf":1,"ga":0,"result":"W","venue":"away"},
            {"gf":2,"ga":0,"result":"W","venue":"home"}],
            [{"gf":0,"ga":2,"result":"L","venue":"away"}, {"gf":1,"ga":2,"result":"L","venue":"home"},
             {"gf":0,"ga":3,"result":"L","venue":"away"}, {"gf":1,"ga":1,"result":"D","venue":"home"},
             {"gf":0,"ga":2,"result":"L","venue":"away"}]) is not None
        print("the-king-v7-goaloo self-test OK")


if __name__ == "__main__":
    main()
