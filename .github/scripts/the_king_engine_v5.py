#!/usr/bin/env python3
"""Team-results DOM adapter for The King.

Current Soccerway team result rows expose the two team links and score cells
separately. v5 parses those compact result rows while retaining v4 diagnostics,
v3 route normalization, and all existing model/gate rules.
"""
import re

import the_king_engine as core
import the_king_engine_v4  # applies v3 routes + v4 diagnostic selection
from bs4 import BeautifulSoup

RESULT_TOKEN = {"W", "D", "L"}
INT_TOKEN = re.compile(r"^(?:0|[1-9]|1[0-5])$")
SCORE_DASH = re.compile(r"(?<!\d)(\d{1,2})\s*[-–]\s*(\d{1,2})(?!\d)")


def unique_team_links(node):
    teams = []
    for a in node.find_all("a", href=True):
        href = a.get("href") or ""
        if "/team/" not in href and "/teams/" not in href:
            continue
        label = core.text_norm(a.get_text(" ", strip=True))
        if not label or len(label) > 90:
            continue
        if any(core.same_name(label, x) for x in teams):
            continue
        teams.append(label)
    return teams


def score_from_tokens(node):
    tokens = [core.text_norm(x) for x in node.stripped_strings]
    tokens = [x for x in tokens if x]
    # Current compact rows commonly end with: home_score away_score W|D|L.
    result_positions = [i for i, tok in enumerate(tokens) if tok.upper() in RESULT_TOKEN]
    for pos in reversed(result_positions):
        nums = []
        for tok in reversed(tokens[:pos]):
            if INT_TOKEN.match(tok):
                nums.append(int(tok))
                if len(nums) == 2:
                    # reversed collection: away first, then home
                    return nums[1], nums[0]
            # Stop before walking into unrelated player/stat tables.
            if len(nums) == 0 and len(tok) > 100:
                break
    raw = core.text_norm(node.get_text(" ", strip=True))
    m = SCORE_DASH.search(raw)
    if m:
        h, a = int(m.group(1)), int(m.group(2))
        if h <= 15 and a <= 15:
            return h, a
    return None


def candidate_containers(soup):
    # Prefer naturally row-like elements, then small div/article fallbacks.
    yielded = set()
    for tag in ("tr", "li", "article", "div"):
        for node in soup.find_all(tag):
            ident = id(node)
            if ident in yielded:
                continue
            teams = unique_team_links(node)
            if len(teams) < 2:
                continue
            txt = core.text_norm(node.get_text(" ", strip=True))
            if len(txt) > 700:
                continue
            yielded.add(ident)
            yield node, teams


def parse_recent_matches(html, team_name, max_n=10):
    soup = BeautifulSoup(html, "html.parser")
    rows, seen = [], set()
    for node, teams in candidate_containers(soup):
        # Result rows can include competition links too, but the first two unique
        # team links are the displayed sides in the compact score row.
        matched = [t for t in teams if core.same_name(team_name, t)]
        if not matched:
            continue
        # Choose the two-team pair around the requested team when extra team links
        # appear in a parent container.
        idx = next((i for i, t in enumerate(teams) if core.same_name(team_name, t)), None)
        if idx is None:
            continue
        pair = None
        if idx > 0:
            pair = (teams[idx - 1], teams[idx])
        if idx + 1 < len(teams):
            right = (teams[idx], teams[idx + 1])
            if pair is None:
                pair = right
            else:
                # Prefer the pair whose compact node text has both names closer
                # together; in normal rows this resolves to exactly two teams.
                raw = core.text_norm(node.get_text(" ", strip=True)).lower()
                def span(p):
                    ps = [raw.find(x.lower()) for x in p]
                    return abs(ps[0] - ps[1]) if min(ps) >= 0 else 10**9
                if span(right) < span(pair):
                    pair = right
        if pair is None:
            continue
        home, away = pair
        score = score_from_tokens(node)
        if not score:
            continue
        hg, ag = score
        key = (home.lower(), away.lower(), hg, ag)
        if key in seen:
            continue
        seen.add(key)
        is_home = core.same_name(team_name, home)
        gf, ga = (hg, ag) if is_home else (ag, hg)
        result = "W" if gf > ga else "D" if gf == ga else "L"
        rows.append({"gf": gf, "ga": ga, "result": result, "venue": "home" if is_home else "away"})
        if len(rows) >= max_n:
            break
    return rows


core.parse_recent_matches = parse_recent_matches

if __name__ == "__main__":
    core.main()
