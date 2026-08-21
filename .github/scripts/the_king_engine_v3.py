#!/usr/bin/env python3
"""Current Soccerway route adapter for The King.

Soccerway currently exposes both /match/ and /game/ URLs, and the URL segment
order is not guaranteed to match the displayed home/away order. This adapter
normalizes both forms without changing The King model or selection gates.
"""
import re
from urllib.parse import urlparse

import the_king_engine as core
import the_king_engine_v2 as v2
from bs4 import BeautifulSoup

ROUTE_MARKERS = ("/match/", "/game/")
TIME_RE = re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b")


def is_game_href(href):
    return any(marker in (href or "") for marker in ROUTE_MARKERS)


def norm_name(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def slug_from_segment(segment):
    m = v2.TEAM_SEG_RE.match((segment or "").strip("/"))
    return m.group(1) if m else ""


def route_segments(url):
    bits = [x for x in urlparse(url).path.split("/") if x]
    for marker in ("match", "game"):
        if marker in bits:
            i = bits.index(marker)
            if len(bits) > i + 2:
                return bits[i + 1], bits[i + 2]
    return None, None


def assign_team_segments(home, away, seg1, seg2):
    """Map URL segments to displayed sides; never trust URL order blindly."""
    pairs = [(seg1, seg2), (seg2, seg1)]
    nh, na = norm_name(home), norm_name(away)
    best = None
    for hs, aas in pairs:
        sh, sa = norm_name(slug_from_segment(hs)), norm_name(slug_from_segment(aas))
        score = 0
        if sh and (sh in nh or nh in sh): score += 3
        if sa and (sa in na or na in sa): score += 3
        # prefix overlap helps abbreviations such as manchester-utd / manchester-united
        score += sum(1 for n,s in ((nh,sh),(na,sa)) if n and s and n[:6] == s[:6])
        if best is None or score > best[0]:
            best = (score, hs, aas)
    return (best[1], best[2]) if best else (seg1, seg2)


def context(anchor, levels=5):
    return v2.nearest_context(anchor, levels)


def find_fixture_rows(html, host):
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        if not is_game_href(href):
            continue
        pair = v2.split_match_label(a.get_text(" ", strip=True))
        if not pair:
            continue
        home, away = pair
        ctx = context(a)
        raw = next((txt for _, txt in ctx if len(txt) <= 500), core.text_norm(a.get_text(" ", strip=True)))
        if core.EXCLUDE_RE.search(raw):
            continue
        full = core.absolute(host, href)
        seg1, seg2 = route_segments(full)
        if not seg1 or not seg2:
            continue
        hseg, aseg = assign_team_segments(home, away, seg1, seg2)
        home_url = v2.team_url_from_segment(host, hseg)
        away_url = v2.team_url_from_segment(host, aseg)
        if not home_url or not away_url:
            continue
        key = (home.lower(), away.lower())
        if key in seen:
            continue
        seen.add(key)
        kickoff = None
        league = ""
        for node, txt in ctx:
            t = node.find("time")
            if t:
                kickoff = t.get("datetime") or core.text_norm(t.get_text(" ", strip=True))
                if kickoff: break
            mt = TIME_RE.search(txt)
            if mt:
                kickoff = mt.group(0); break
        for node, _ in ctx:
            for la in node.find_all("a", href=True):
                lhref = la.get("href") or ""
                label = core.text_norm(la.get_text(" ", strip=True))
                if not label or label in (home, away) or is_game_href(lhref) or "/team/" in lhref:
                    continue
                if len(label) <= 80:
                    league = label; break
            if league: break
        out.append({
            "home": home, "away": away,
            "home_url": home_url, "away_url": away_url,
            "match_url": full, "league": league,
            "kickoff": kickoff, "source": host,
        })
    return out


def discover_fixtures(http, date_str):
    yyyy, mm, dd = date_str.split("-")
    errors, rows = [], []
    for host in core.SOURCE_HOSTS:
        for path in (f"/matches/{yyyy}/{mm}/{dd}/", f"/matches/{date_str}/"):
            try:
                got = find_fixture_rows(http.get(f"https://{host}{path}"), host)
                if got:
                    rows.extend(got); break
            except Exception as e:
                errors.append(f"{host}{path}: {e}")
        if rows: break
    # Root fallback is date-guarded. It is used only if the explicit date board
    # has no parseable match links.
    if not rows:
        day, month = int(dd), int(mm)
        tokens = {date_str, f"{day:02d}/{month:02d}", f"{day}/{month}", f"{day:02d}.{month:02d}"}
        for host in core.SOURCE_HOSTS:
            try:
                html = http.get(f"https://{host}/")
                soup = BeautifulSoup(html, "html.parser")
                allowed = set()
                for a in soup.find_all("a", href=True):
                    if not is_game_href(a.get("href") or ""):
                        continue
                    txt = " ".join(t for _, t in context(a, 4))
                    if any(tok in txt for tok in tokens):
                        allowed.add(core.absolute(host, a.get("href")))
                rows.extend([x for x in find_fixture_rows(html, host) if x.get("match_url") in allowed])
                if rows: break
            except Exception as e:
                errors.append(f"{host}/: {e}")
    unique, seen = [], set()
    for x in rows:
        k = (x["home"].lower(), x["away"].lower())
        if k not in seen:
            seen.add(k); unique.append(x)
    return unique, errors


def score_from_context(anchor):
    for _, txt in context(anchor, 5):
        for m in core.SCORE_RE.finditer(txt):
            h, a = int(m.group(1)), int(m.group(2))
            if h <= 15 and a <= 15:
                return h, a
    return None


def parse_recent_matches(html, team_name, max_n=10):
    soup = BeautifulSoup(html, "html.parser")
    rows, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = a.get("href") or ""
        if not is_game_href(href) or href in seen:
            continue
        pair = v2.split_match_label(a.get_text(" ", strip=True))
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
        if len(rows) >= max_n: break
    return rows


# v2 already supplies current team results URL and odds-page fallback.
core.find_fixture_rows = find_fixture_rows
core.discover_fixtures = discover_fixtures
core.team_matches_url = v2.team_results_url
core.parse_recent_matches = parse_recent_matches
core.analyse_fixture = v2.analyse_fixture_v2

if __name__ == "__main__":
    core.main()
