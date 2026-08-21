#!/usr/bin/env python3
"""The King v9 — Goaloo direct feeds + Manual Set 2 composite confidence.

Poisson/Dixon-Coles remains the score-distribution backbone. Winner confidence is
adjusted only by bounded current-form/venue/attack-defense quality derived from
Goaloo Previous Scores Statistics. H2H remains low weight. Gates stay 58% / 12pt.
"""
import json
import math
import re
from collections import Counter

from bs4 import BeautifulSoup

import the_king_engine as core
import the_king_engine_v7 as v7
import the_king_engine_v8 as v8

SCORE = v7.SCORE
EXCLUDE = v8.EXCLUDE


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def previous_section_rows(html):
    soup = BeautifulSoup(html, "html.parser")
    marker = None
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "div", "span", "strong"]):
        if "previous scores statistics" in clean(tag.get_text(" ", strip=True)).lower():
            marker = tag
            break
    if not marker:
        return soup.find_all("tr")
    rows = []
    for node in marker.find_all_next():
        if node is not marker and node.name in ("h1", "h2"):
            text = clean(node.get_text(" ", strip=True)).lower()
            if text and "previous scores statistics" not in text:
                break
        if node.name == "tr":
            rows.append(node)
    return rows or soup.find_all("tr")


def rows_for_team(html, team, max_n=10):
    out, seen = [], set()
    for tr in previous_section_rows(html):
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
        if score_idx is None:
            continue
        home = next((cells[i] for i in range(score_idx - 1, -1, -1)
                     if cells[i] and not re.fullmatch(r"\d{1,2}/\d{1,2}(?:/\d{2,4})?", cells[i])), "")
        away = next((cells[i] for i in range(score_idx + 1, len(cells))
                     if cells[i] and not SCORE.search(cells[i])), "")
        if not (v7.same(team, home) or v7.same(team, away)):
            continue
        hg, ag = int(sm.group(1)), int(sm.group(2))
        is_home = v7.same(team, home)
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


def venue_counts(home_rows, away_rows):
    return {
        "home_home_n": sum(1 for r in home_rows if r.get("venue") == "home"),
        "away_away_n": sum(1 for r in away_rows if r.get("venue") == "away"),
    }


def goaloo_score_model(home_rows, away_rows):
    """Core Poisson/DC model with a conservative Goaloo venue-data fallback.

    Goaloo can return >=5 usable recent matches while the venue-specific slice is
    temporarily sparse. In that case use overall recent form only for the venue
    input instead of discarding the entire fixture. Selection gates are unchanged.
    """
    ho = core.weighted_stats(home_rows)
    ao = core.weighted_stats(away_rows)
    if not ho or not ao or ho["n"] < 5 or ao["n"] < 5:
        return None

    hv_raw = core.weighted_stats(home_rows, "home")
    av_raw = core.weighted_stats(away_rows, "away")
    home_fallback = not hv_raw or hv_raw["n"] < 2
    away_fallback = not av_raw or av_raw["n"] < 2
    hv = ho if home_fallback else hv_raw
    av = ao if away_fallback else av_raw

    lh = min(3.6, max(.2,
        .54 * (.62 * hv["gf"] + .38 * ho["gf"]) +
        .46 * (.62 * av["ga"] + .38 * ao["ga"]) + .10))
    la = min(3.6, max(.2,
        .54 * (.62 * av["gf"] + .38 * ao["gf"]) +
        .46 * (.62 * hv["ga"] + .38 * ho["ga"])))

    mat = core.dixon_coles_matrix(lh, la)
    ph = pd = pa = btts = odd = 0.0
    best = (0.0, 0, 0)
    for i, row in enumerate(mat):
        for j, p in enumerate(row):
            if i > j:
                ph += p
            elif i == j:
                pd += p
            else:
                pa += p
            if i > 0 and j > 0:
                btts += p
            if (i + j) % 2:
                odd += p
            if p > best[0]:
                best = (p, i, j)

    probs = {"home": ph, "draw": pd, "away": pa}
    ordered = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    side, conf = ordered[0]
    edge = conf - ordered[1][1]
    eligible = (conf > .70) if side == "draw" else (conf >= .58 and edge >= .12)
    return {
        "lambda_home": round(lh, 3), "lambda_away": round(la, 3),
        "home_win": round(ph, 4), "draw": round(pd, 4), "away_win": round(pa, 4),
        "projected_score": f"{best[1]}-{best[2]}",
        "btts_yes": round(btts, 4), "btts_no": round(1 - btts, 4),
        "odd": round(odd, 4), "even": round(1 - odd, 4),
        "side": side, "confidence": conf, "edge": edge, "eligible": eligible,
        "venue_fallback": {
            "home": home_fallback, "away": away_fallback,
            "home_venue_n": 0 if not hv_raw else hv_raw["n"],
            "away_venue_n": 0 if not av_raw else av_raw["n"],
        },
    }


def form_adjustment(home_rows, away_rows):
    ho = core.weighted_stats(home_rows); ao = core.weighted_stats(away_rows)
    hv_raw = core.weighted_stats(home_rows, "home")
    av_raw = core.weighted_stats(away_rows, "away")
    if not ho or not ao:
        return None

    home_fallback = not hv_raw or hv_raw["n"] < 2
    away_fallback = not av_raw or av_raw["n"] < 2
    venue_ready = not home_fallback and not away_fallback
    hv = ho if home_fallback else hv_raw
    av = ao if away_fallback else av_raw

    # If Goaloo's venue slice is sparse, do not invent a venue edge. Overall
    # recent form still contributes, and Poisson/DC receives the same fallback.
    venue_ppg = (hv["ppg"] - av["ppg"]) / 3.0 if venue_ready else 0.0
    overall_ppg = (ho["ppg"] - ao["ppg"]) / 3.0
    home_gd = hv["gf"] - hv["ga"]
    away_gd = av["gf"] - av["ga"]
    gd_edge = math.tanh((home_gd - away_gd) / 2.5)
    cs_edge = hv["clean_sheet"] - av["clean_sheet"]
    fts_edge = av["failed_to_score"] - hv["failed_to_score"]
    raw = .42 * venue_ppg + .24 * overall_ppg + .20 * gd_edge + .08 * cs_edge + .06 * fts_edge
    bounded = max(-.10, min(.10, raw * .13))
    return bounded, {
        "venue_ppg_edge": round(venue_ppg, 4), "overall_ppg_edge": round(overall_ppg, 4),
        "gd_edge": round(gd_edge, 4), "clean_sheet_edge": round(cs_edge, 4),
        "failed_to_score_edge": round(fts_edge, 4), "bounded_adjustment": round(bounded, 4),
        "venue_ready": venue_ready,
        "home_venue_n": 0 if not hv_raw else hv_raw["n"],
        "away_venue_n": 0 if not av_raw else av_raw["n"],
    }


def composite_model(home_rows, away_rows, h2h_edge=0.0):
    base = goaloo_score_model(home_rows, away_rows)
    if not base:
        return None
    adj_pack = form_adjustment(home_rows, away_rows)
    if not adj_pack:
        return None
    adj, detail = adj_pack
    # H2H is deliberately low weight and cannot move more than 1.5 points.
    h2h_adj = max(-.015, min(.015, h2h_edge * .015))
    home = max(.01, float(base["home_win"]) + adj + h2h_adj)
    away = max(.01, float(base["away_win"]) - adj - h2h_adj)
    draw = max(.01, float(base["draw"]))
    z = home + draw + away
    home, draw, away = home/z, draw/z, away/z
    probs = {"home": home, "draw": draw, "away": away}
    ordered = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    side, conf = ordered[0]
    edge = conf - ordered[1][1]
    eligible = (conf > .70) if side == "draw" else (conf >= .58 and edge >= .12)
    return {
        **base, "home_win": round(home,4), "draw": round(draw,4), "away_win": round(away,4),
        "side": side, "confidence": conf, "edge": edge, "eligible": eligible,
        "manual_set2": detail, "h2h_adjustment": round(h2h_adj,4)
    }


def analyse(row, date_str, odds_map):
    try:
        html = v8.get_h2h_html(row)
    except Exception as e:
        return None, {"reason": "GOALOO_H2H_FETCH_FAILED", "detail": str(e)[:120]}
    hr = rows_for_team(html, row["home"], 10)
    ar = rows_for_team(html, row["away"], 10)
    if len(hr) < 5 or len(ar) < 5:
        return None, {"reason": "GOALOO_FORM_SHORT", "home_n": len(hr), "away_n": len(ar)}
    he, hn = v8.h2h_hint(html, row["home"], row["away"])
    model = composite_model(hr, ar, he)
    if not model:
        return None, {"reason": "MODEL_DATA_SHORT", "home_n": len(hr), "away_n": len(ar),
                      **venue_counts(hr, ar)}
    if model["side"] == "draw":
        return None, {"reason": "DRAW_NOT_MAIN_PICK", "confidence": round(model["confidence"],4)}
    if not model["eligible"]:
        return None, {"reason": "WINNER_FIRST_GATE", "confidence": round(model["confidence"],4),
                      "edge": round(model["edge"],4), "side": model["side"]}
    market = odds_map.get(row["id"])
    if not market:
        return None, {"reason": "NO_GOALOO_1X2_ODDS", "confidence": round(model["confidence"],4),
                      "edge": round(model["edge"],4)}
    side = model["side"]; locked = float(market[side])
    if locked < 1.70:
        return None, {"reason": "ODDS_GATE", "odds": locked, "confidence": round(model["confidence"],4),
                      "edge": round(model["edge"],4)}
    team = row["home"] if side == "home" else row["away"]
    return {
        "id": core.stable_id(date_str, row["home"], row["away"]), "goaloo_id": row["id"],
        "date": date_str, "kickoff": row["kickoff"], "league": row["league"],
        "home": row["home"], "away": row["away"], "pick": f"{team} Win", "side": side,
        "odds": round(locked,2), "odds_source": "1xBet / Goaloo goal50.xml",
        "confidence": round(model["confidence"],4), "edge": round(model["edge"]*100,1),
        "result": "PENDING", "ft": None, "source_url": row["h2h_url"], "summary_url": row["summary_url"],
        "model": {"lambda_home": model["lambda_home"], "lambda_away": model["lambda_away"],
                  "home_win": model["home_win"], "draw": model["draw"], "away_win": model["away_win"],
                  "manual_set2": model["manual_set2"], "h2h_adjustment": model["h2h_adjustment"],
                  "venue_fallback": model["venue_fallback"]},
        "data_quality": {"home_recent": len(hr), "away_recent": len(ar), "h2h_n": hn,
                         "primary_source": "Goaloo direct feeds"},
    }, None


def selection(date_str):
    fixtures = v8.date_matches(date_str)
    odds_map = v8.load_odds()
    qualified, rejected, reasons, near = [], [], Counter(), []
    for row in fixtures:
        rec, err = analyse(row, date_str, odds_map)
        if rec:
            qualified.append(rec)
        else:
            reason = (err or {}).get("reason", "UNKNOWN"); reasons[reason] += 1
            if len(rejected) < 12:
                rejected.append({"match": f"{row['home']} vs {row['away']}", **(err or {})})
            if (err or {}).get("confidence") is not None:
                near.append({"match": f"{row['home']} vs {row['away']}", **(err or {})})
    qualified.sort(key=lambda x: (x["confidence"], x["edge"]), reverse=True)
    qualified = qualified[:6]
    near.sort(key=lambda x: (float(x.get("confidence") or 0), float(x.get("edge") or 0)), reverse=True)
    feed = core.load_json(core.FEED_PATH, {"today": [], "history": []})
    feed.update({"updated_at": core.now_iso(), "selection_date": date_str, "today": qualified,
                 "history": feed.get("history") or [], "engine": "the-king-v9-manual-set2-goaloo"})
    core.save_json(core.FEED_PATH, feed)
    prev = core.load_json(core.STATE_PATH, {})
    state = {"engine": "the-king-v9-manual-set2-goaloo", "status": "OK" if fixtures else "SOURCE_EMPTY",
             "last_selection_run": core.now_iso(), "last_settlement_run": prev.get("last_settlement_run"),
             "selection_date": date_str, "fixtures_seen": len(fixtures), "qualified": len(qualified),
             "pending": len(qualified), "primary_source": "Goaloo bf_us.js + H2H + goal50.xml",
             "rejected": max(0, len(fixtures)-len(qualified)), "rejection_reasons": dict(reasons),
             "rejection_samples": rejected, "near_gate_top": near[:12], "source_health": v8.HEALTH}
    core.save_json(core.STATE_PATH, state)
    print(json.dumps({"fixtures": len(fixtures), "qualified": len(qualified), "reasons": dict(reasons),
                      "near": near[:5], "health": v8.HEALTH}))


def main():
    import argparse
    p = argparse.ArgumentParser(); sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("select"); s.add_argument("--date", required=True)
    sp.add_parser("settle"); sp.add_parser("self-test")
    a = p.parse_args()
    if a.cmd == "select":
        selection(a.date)
    elif a.cmd == "settle":
        v8.settle()
    else:
        home=[{"gf":2,"ga":0,"result":"W","venue":"home"},{"gf":2,"ga":1,"result":"W","venue":"away"},{"gf":3,"ga":0,"result":"W","venue":"home"},{"gf":1,"ga":0,"result":"W","venue":"away"},{"gf":2,"ga":0,"result":"W","venue":"home"},{"gf":2,"ga":1,"result":"W","venue":"home"}]
        away=[{"gf":0,"ga":2,"result":"L","venue":"away"},{"gf":1,"ga":2,"result":"L","venue":"home"},{"gf":0,"ga":3,"result":"L","venue":"away"},{"gf":1,"ga":1,"result":"D","venue":"home"},{"gf":0,"ga":2,"result":"L","venue":"away"},{"gf":1,"ga":2,"result":"L","venue":"away"}]
        m=composite_model(home,away,0.2); assert m and m["home_win"]>m["away_win"]
        sparse_home=[{"gf":2,"ga":0,"result":"W","venue":"away"},{"gf":1,"ga":0,"result":"W","venue":"away"},{"gf":2,"ga":1,"result":"W","venue":"away"},{"gf":1,"ga":1,"result":"D","venue":"away"},{"gf":3,"ga":1,"result":"W","venue":"home"},{"gf":2,"ga":0,"result":"W","venue":"away"}]
        sparse_away=[{"gf":0,"ga":2,"result":"L","venue":"home"},{"gf":1,"ga":2,"result":"L","venue":"home"},{"gf":0,"ga":1,"result":"L","venue":"home"},{"gf":1,"ga":1,"result":"D","venue":"home"},{"gf":0,"ga":3,"result":"L","venue":"away"},{"gf":1,"ga":2,"result":"L","venue":"home"}]
        sm=composite_model(sparse_home,sparse_away,0.0)
        assert sm and sm["venue_fallback"]["home"] and sm["venue_fallback"]["away"]
        print("the-king-v9-manual-set2-goaloo self-test OK")


if __name__ == "__main__":
    main()
