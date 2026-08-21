#!/usr/bin/env python3
"""Browser fallback for current Soccerway client-rendered team/odds data.

Fast path remains requests/BeautifulSoup. Headless Chrome is started only when
static HTML does not expose enough recent results or verified 1X2 odds.
"""
import atexit
import json
import shutil
import time
from urllib.parse import urlparse, urlunparse

import the_king_engine as core
import the_king_engine_v5  # applies v5 result-row parser + v4 diagnostics + v3 routes

_BROWSER = None
_CONTEXT = None
_RENDER_CACHE = {}
_BROWSER_STATS = {"started": False, "renders": 0, "errors": 0}


def chrome_path():
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        p = shutil.which(name)
        if p:
            return p
    return None


def ensure_browser():
    global _BROWSER, _CONTEXT
    if _BROWSER is not None:
        return _BROWSER, _CONTEXT
    from playwright.sync_api import sync_playwright
    exe = chrome_path()
    if not exe:
        raise RuntimeError("Headless Chrome executable not found")
    pw = sync_playwright().start()
    browser = pw.chromium.launch(
        executable_path=exe,
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    )
    context = browser.new_context(
        user_agent=core.USER_AGENT,
        locale="en-US",
        viewport={"width": 1366, "height": 900},
    )
    _BROWSER = (pw, browser)
    _CONTEXT = context
    _BROWSER_STATS["started"] = True
    return _BROWSER, _CONTEXT


def close_browser():
    global _BROWSER, _CONTEXT
    if _BROWSER is None:
        return
    try:
        pw, browser = _BROWSER
        if _CONTEXT:
            _CONTEXT.close()
        browser.close()
        pw.stop()
    except Exception:
        pass
    _BROWSER = None; _CONTEXT = None


atexit.register(close_browser)


def render(url, wait_ms=900):
    if url in _RENDER_CACHE:
        return _RENDER_CACHE[url]
    _, context = ensure_browser()
    page = context.new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        # Soccerway hydrates compact result/odds rows after DOMContentLoaded.
        page.wait_for_timeout(wait_ms)
        try:
            page.wait_for_load_state("networkidle", timeout=3500)
        except Exception:
            pass
        html = page.content()
        _RENDER_CACHE[url] = html
        _BROWSER_STATS["renders"] += 1
        return html
    except Exception:
        _BROWSER_STATS["errors"] += 1
        raise
    finally:
        page.close()


def swap_host(url, host):
    p = urlparse(url)
    return urlunparse((p.scheme or "https", host, p.path, p.params, p.query, p.fragment))


def fetch_team_rows(http, url, name):
    candidates = []
    if url:
        # Try static HTML first on the discovered host and mirrors.
        base = core.team_matches_url(url)
        if base:
            candidates.append(base)
            for host in ("www.soccerway.com", "ng.soccerway.com", "us.soccerway.com", "au.soccerway.com"):
                u = swap_host(base, host)
                if u not in candidates:
                    candidates.append(u)
    for u in candidates:
        try:
            rows = core.parse_recent_matches(http.get(u), name)
            if len(rows) >= 5:
                return rows
        except Exception:
            pass
    # Static shell contains no result grid on some regional frontends; render JS.
    for u in candidates[:4]:
        try:
            rows = core.parse_recent_matches(render(u), name)
            if len(rows) >= 5:
                return rows
        except Exception:
            continue
    return []


def fetch_market(http, match_url):
    urls = [match_url, match_url.rstrip("/") + "/odds/"]
    for url in urls:
        try:
            market = core.extract_1x2_odds(http.get(url))
            if market:
                return market, url
        except Exception:
            pass
    for url in reversed(urls):
        try:
            market = core.extract_1x2_odds(render(url, wait_ms=700))
            if market:
                return market, url
        except Exception:
            pass
    return None, None


def analyse_fixture(http, fx, date_str):
    hr = fetch_team_rows(http, fx["home_url"], fx["home"])
    ar = fetch_team_rows(http, fx["away_url"], fx["away"])
    model = core.score_model(hr, ar)
    if not model or not model["eligible"] or model["side"] == "draw":
        return None, {"reason": "MODEL_GATE", "home_n": len(hr), "away_n": len(ar)}
    if not fx.get("match_url"):
        return None, {"reason": "NO_MATCH_URL", "home_n": len(hr), "away_n": len(ar)}
    market, market_url = fetch_market(http, fx["match_url"])
    if not market:
        return None, {"reason": "NO_VERIFIED_1X2_ODDS", "home_n": len(hr), "away_n": len(ar)}
    side = model["side"]
    locked = float(market[side])
    if locked < 1.70:
        return None, {"reason": "ODDS_GATE", "odds": locked, "home_n": len(hr), "away_n": len(ar)}
    team = fx["home"] if side == "home" else fx["away"]
    return {
        "id": core.stable_id(date_str, fx["home"], fx["away"]),
        "date": date_str, "kickoff": fx.get("kickoff"), "league": fx.get("league"),
        "home": fx["home"], "away": fx["away"], "pick": f"{team} Win", "side": side,
        "odds": round(locked, 2), "odds_source": market["bookmaker"],
        "confidence": round(model["confidence"], 4), "edge": round(model["edge"] * 100, 1),
        "result": "PENDING", "ft": None,
        "source_url": fx["match_url"], "odds_url": market_url,
        "home_url": fx["home_url"], "away_url": fx["away_url"],
        "model": {"lambda_home": model["lambda_home"], "lambda_away": model["lambda_away"],
                  "home_win": model["home_win"], "draw": model["draw"], "away_win": model["away_win"]},
        "data_quality": {"home_recent": len(hr), "away_recent": len(ar)},
    }, None


def selection(date_str):
    # Reuse v4 diagnostic orchestrator after replacing the data-sensitive fetcher.
    the_king_engine_v5.the_king_engine_v4.selection_with_diagnostics(date_str)
    state = core.load_json(core.STATE_PATH, {})
    state["engine"] = "the-king-v6"
    state["browser_fallback"] = dict(_BROWSER_STATS)
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"browser_fallback": _BROWSER_STATS}))


core.fetch_team_rows = fetch_team_rows
core.analyse_fixture = analyse_fixture
core.selection = selection

if __name__ == "__main__":
    core.main()
