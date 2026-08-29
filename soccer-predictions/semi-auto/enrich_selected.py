#!/usr/bin/env python3
"""Resolve manually selected match rows to Forebet match pages and enrich REVIEW staging.

This script is intentionally isolated to Soccer Predictions. It never writes NOMAD Picks,
Statistics, or any /nomad-live path. It discovers only detail URLs that correspond to rows
already present in selected-matches.json.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup

from forebet_engine import parse as parse_match

LIST_URL = "https://www.forebet.com/en/football-tips-and-predictions-for-today/by-league"
UA = "Mozilla/5.0 (compatible; NOMAD-SoccerPredictions/1.1; selected-match-review-enricher)"
STOP = {"fc", "cf", "sc", "sv", "ud", "afc", "city", "united", "wanderers", "calcio", "sport"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def tokens(value: str) -> set[str]:
    raw = [x for x in norm(value).split() if x]
    useful = {x for x in raw if x not in STOP}
    return useful or set(raw)


def pair_score(row: dict, label: str, href: str) -> float:
    hay = tokens(label + " " + unquote(href))
    home = tokens(row.get("home", ""))
    away = tokens(row.get("away", ""))
    if not home or not away:
        return 0.0
    hc = len(home & hay) / len(home)
    ac = len(away & hay) / len(away)
    if hc < 0.6 or ac < 0.6:
        return 0.0
    return hc + ac + (0.15 if "/football/matches/" in href else 0.0)


def fetch(session: requests.Session, url: str, timeout: int) -> str:
    response = session.get(url, timeout=timeout, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    response.raise_for_status()
    return response.text


def resolve_urls(html: str, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[tuple[str, str]] = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = str(a.get("href") or "")
        if "/football/matches/" not in href:
            continue
        url = urljoin(LIST_URL, href)
        if url in seen:
            continue
        seen.add(url)
        candidates.append((a.get_text(" ", strip=True), url))

    queue: list[dict] = []
    unresolved: list[dict] = []
    for row in rows:
        ranked = sorted(((pair_score(row, label, url), url) for label, url in candidates), reverse=True)
        score, url = ranked[0] if ranked else (0.0, "")
        if score < 1.35:
            unresolved.append({"id": row.get("id"), "home": row.get("home"), "away": row.get("away"), "reason": "detail URL not resolved"})
            continue
        item = {
            "url": url,
            "id": row.get("id"),
            "league": row.get("league"),
            "kickoff": row.get("kickoff"),
            "kickoffAt": row.get("kickoffAt"),
            "homeLogo": row.get("homeLogo"),
            "awayLogo": row.get("awayLogo"),
            "odds": row.get("odds"),
            "nomadPick": bool(row.get("nomadPick", False)),
        }
        queue.append(item)
    return queue, unresolved


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selected", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--resolved-queue", type=Path)
    ap.add_argument("--delay", type=float, default=3.0)
    ap.add_argument("--timeout", type=int, default=25)
    args = ap.parse_args()

    selected = json.loads(args.selected.read_text(encoding="utf-8"))
    rows = selected.get("matches", [])
    if not isinstance(rows, list) or not rows:
        raise SystemExit("selected matches are empty")

    session = requests.Session()
    list_html = fetch(session, LIST_URL, args.timeout)
    queue, unresolved = resolve_urls(list_html, rows)

    if args.resolved_queue:
        args.resolved_queue.parent.mkdir(parents=True, exist_ok=True)
        args.resolved_queue.write_text(json.dumps({"generatedAt": now_iso(), "source": LIST_URL, "matches": queue, "unresolved": unresolved}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    staged: list[dict] = []
    errors: list[dict] = list(unresolved)
    selected_by_id = {str(x.get("id")): x for x in rows if x.get("id")}

    for index, item in enumerate(queue):
        url = item["url"]
        try:
            detail_html = fetch(session, url, args.timeout)
            row = parse_match(detail_html, url, item)
            original = selected_by_id.get(str(row.get("id")), {})
            row["nomadPick"] = bool(original.get("nomadPick", False))
            row["reviewStatus"] = "review"
            row["sourceSummary"] = {
                "pick": original.get("sourcePick"),
                "probability": original.get("sourceProbability"),
                "odds": original.get("odds"),
            }
            staged.append(row)
        except Exception as exc:
            errors.append({"id": item.get("id"), "url": url, "reason": str(exc)})
        if index < len(queue) - 1:
            time.sleep(max(2.0, args.delay))

    payload = {
        "generatedAt": now_iso(),
        "mode": "semi-auto-selected-enrichment",
        "provider": "Forebet",
        "liveScore": False,
        "humanApprovalRequired": True,
        "selectedInputCount": len(rows),
        "resolvedUrlCount": len(queue),
        "enrichedCount": len(staged),
        "errorCount": len(errors),
        "matches": staged,
        "errors": errors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"selected={len(rows)} resolved={len(queue)} enriched={len(staged)} errors={len(errors)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
