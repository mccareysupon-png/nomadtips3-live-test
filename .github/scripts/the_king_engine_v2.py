#!/usr/bin/env python3
"""Route/DOM adapter for current Soccerway pages.

Keeps the isolated The King v1 model/gates, but replaces only source-sensitive
parsers so the engine understands current /match/ and /team/.../results/ routes.
"""
import re
from collections import Counter
from urllib.parse import urlparse, urlunparse

import the_king_engine as core
from bs4 import BeautifulSoup

MATCH_SPLIT_RE = re.compile(r"\s+(?:-|–|—|vs\.?|v)\s+", re.I)
TEAM_SEG_RE = re.compile(r"^(.*)-([A-Za-z0-9]{8,12})$")
TIME_RE = re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b")


def split_match_label(label):
    label = core.text_norm(label)
    parts = MATCH_SPLIT_RE.split(label, maxsplit=1)
    if len(parts) != 2:
        return None
    home, away = (core.text_norm(x) for x in parts)
    if not home or not away or home == away or len(home) > 90 or len(away) > 90:
        return None
    return home, away


def team_url_from_segment(host, segment):
    segment = segment.strip("/")
    m = TEAM_SEG_RE.match(segment)
    if not m:
        return None
    slug, ident = m.groups()
    return f"https://{host}/team/{slug}/{ident}/"


def nearest_context(anchor, levels=5):
    node = anchor
    candidates = []
    for _ in range(levels):
        node = getattr(node, "parent", None)
        if node is None:
            break
        txt = core.text_norm(node.get_text(" ", strip=True))
        if txt:
            candidates.append((node, txt))
        if len(txt) > 600:
            break
    return candidates


def find_fixture_rows_v2(html, host):
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        if "/match/" not in href:
            continue
        pair = split_match_label(a.get_text(" ", strip=True))
        if not pair:
            continue
        home, away = pair
        context = nearest_context(a)
        raw = next((txt for _, txt in context if len(txt) <= 420), core.text_norm(a.get_text(" ", strip=True)))
        if core.EXCLUDE_RE.search(raw):
            continue
        full = core.absolute(host, href)
        p = urlparse(full)
        bits = [x for x in p.path.split("/") if x]
        try:
            idx = bits.index("match")
            hseg, aseg = bits[idx + 1], bits[idx + 2]
        except Exception:
            continue
        home_url = team_url_from_segment(host, hseg)
        away_url = team_url_from_segment(host, aseg)
        if not home_url or not away_url:
            continue
        key = (home.lower(), away.lower())
        if key in seen:
            continue
        seen.add(key)
        kickoff = None
        league = ""
        for node, txt in context:
            t = node.find("time")
            if t:
                kickoff = t.get("datetime") or core.text_norm(t.get_text(" ", strip=True))
                if kickoff:
                    break
            mt = TIME_RE.search(txt)
            if mt:
                kickoff = mt.group(0)
                break
        # Nearby non-match anchors often contain competition/category labels.
        for node, _ in context:
            for la in node.find_all("a", href=True):
                lhref = la.get("href") or ""
                label = core.text_norm(la.get_text(" ", strip=True))
                if not label or label in (home, away) or "/match/" in lhref or "/team/" in lhref:
                    continue
                if len(label) <= 80:
                    league = label
                    break
            if league:
                break
        out.append({
            "home": home, "away": away,
            "home_url": home_url, "away_url": away_url,
            "match_url": full, "league": league,
            "kickoff": kickoff, "source": host,
        })
    return out


def discover_fixtures_v2(http, date_str):
    yyyy, mm, dd = date_str.split("-")
    errors, rows = [], []
    paths = [
        f"/matches/{yyyy}/{mm}/{dd}/",
        f"/matches/{date_str}/",
    ]
    for host in core.SOURCE_HOSTS:
        for path in paths:
            try:
                got = find_fixture_rows_v2(http.get(f"https://{host}{path}"), host)
                if got:
                    rows.extend(got)
                    break
            except Exception as e:
                errors.append(f"{host}{path}: {e}")
        if rows:
            break
    # Current Soccerway may render the date board at root. Use root only when
    # the date pages yielded nothing; date validation remains conservative by
    # requiring a nearby date token or today's selection context later.
    if not rows:
        for host in core.SOURCE_HOSTS:
            try:
                html = http.get(f"https://{host}/")
                got = find_fixture_rows_v2(html, host)
                # Root fallback is diagnostic/last-resort: keep only anchors whose
                # local context contains target YYYY-MM-DD, DD/MM or DD.MM token.
                dd_i, mm_i = int(dd), int(mm)
                date_tokens = {date_str, f"{dd_i:02d}/{mm_i:02d}", f"{dd_i:02d}.{mm_i:02d}", f"{dd_i}/{mm_i}"}
                soup = BeautifulSoup(html, "html.parser")
                allowed = set()
                for a in soup.find_all("a", href=True):
                    if "/match/" not in (a.get("href") or ""):
                        continue
                    ctx = " ".join(txt for _, txt in nearest_context(a, 4))
                    if any(tok in ctx for tok in date_tokens):
                        allowed.add(core.absolute(host, a.get("href")))
                rows.extend([x for x in got if x.get("match_url") in allowed])
                if rows:
                    break
            except Exception as e:
                errors.append(f"{host}/: {e}")
    unique, seen = [], set()
    for x in rows:
        k = (x["home"].lower(), x["away"].lower())
        if k not in seen:
            seen.add(k); unique.append(x)
    return unique, errors


def team_results_url(url):
    if not url:
        return None
    p = urlparse(url)
    path = p.path.rstrip("/")
    if not path.endswith("/results"):
        path += "/results"
    return urlunparse((p.scheme, p.netloc, path + "/", "", "", ""))


def score_from_context(anchor):
    for _, txt in nearest_context(anchor, 5):
        for m in core.SCORE_RE.finditer(txt):
            h, a = int(m.group(1)), int(m.group(2))
            # football result guard: blocks dates/times and absurd values
            if h <= 15 and a <= 15:
                return h, a
    return None


def parse_recent_matches_v2(html, team_name, max_n=10):
    soup = BeautifulSoup(html, "html.parser")
    rows, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        if "/match/" not in href or href in seen:
            continue
        pair = split_match_label(a.get_text(" ", strip=True))
        if not pair:
            continue
        home, away = pair
        if not (core.same_name(team_name, home) or core.same_name(team_name, away)):
            continue
        score = score_from_context(a)
        if not score:
            continue
        hg, ag = score
        is_home = core.same_name(team_name, home)
        gf, ga = (hg, ag) if is_home else (ag, hg)
        result = "W" if gf > ga else "D" if gf == ga else "L"
        rows.append({"gf": gf, "ga": ga, "result": result, "venue": "home" if is_home else "away"})
        seen.add(href)
        if len(rows) >= max_n:
            break
    return rows


def analyse_fixture_v2(http, fx, date_str):
    hr = core.fetch_team_rows(http, fx["home_url"], fx["home"])
    ar = core.fetch_team_rows(http, fx["away_url"], fx["away"])
    model = core.score_model(hr, ar)
    if not model or not model["eligible"] or model["side"] == "draw":
        return None, {"reason": "MODEL_GATE", "home_n": len(hr), "away_n": len(ar)}
    if not fx.get("match_url"):
        return None, {"reason": "NO_MATCH_URL"}
    market = None
    market_url = None
    for url in [fx["match_url"], fx["match_url"].rstrip("/") + "/odds/"]:
        try:
            market = core.extract_1x2_odds(http.get(url))
            if market:
                market_url = url
                break
        except Exception:
            continue
    if not market:
        return None, {"reason": "NO_VERIFIED_1X2_ODDS"}
    side = model["side"]
    locked = float(market[side])
    if locked < 1.70:
        return None, {"reason": "ODDS_GATE", "odds": locked}
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


# Monkey-patch only source-sensitive adapters; all model/gate/state logic stays v1.
core.find_fixture_rows = find_fixture_rows_v2
core.discover_fixtures = discover_fixtures_v2
core.team_matches_url = team_results_url
core.parse_recent_matches = parse_recent_matches_v2
core.analyse_fixture = analyse_fixture_v2

if __name__ == "__main__":
    core.main()
