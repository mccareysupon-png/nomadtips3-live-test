import json
from datetime import datetime, timezone
from pathlib import Path

SELECTED_PATH = Path("selected-live-matches.json")
REPORT_PATH = Path("auto-selection-report.json")
POOL_PATH = Path("owner-candidate-pool.json")


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def rank_key(match):
    analysis = match.get("auto_analysis") or {}
    confidence = number(match.get("confidence"))
    strength = number(analysis.get("adjustedStrength"), number(analysis.get("absoluteStrength")))
    standing = 1 if analysis.get("standingsAvailable") or analysis.get("standingContextAvailable") else 0
    samples = [
        number((analysis.get(name) or {}).get("sample"))
        for name in ("homeOverall", "awayOverall", "homeVenue", "awayVenue")
    ]
    sample_floor = min(samples) if samples else 0
    kickoff = str(match.get("kickoff_utc") or match.get("kickoffUtc") or "")
    return (-confidence, -standing, -strength, -sample_floor, kickoff, str(match.get("fixture_id") or ""))


def normalize_match(match):
    fixture_id = match.get("fixture_id") or match.get("providerFixtureId") or match.get("fixtureId")
    home = str(match.get("home") or "")
    away = str(match.get("away") or "")
    pick = str(match.get("pick") or "")
    normalized = dict(match)
    normalized["fixture_id"] = fixture_id
    normalized.setdefault("client_fixture_id", f"AUTO-{fixture_id}")
    normalized.setdefault("slug", f"auto-{fixture_id}")
    normalized.setdefault("home_aliases", [home] if home else [])
    normalized.setdefault("away_aliases", [away] if away else [])
    normalized.setdefault("pick_side", "home" if home and pick.startswith(home) else "away" if away and pick.startswith(away) else None)
    normalized.setdefault("predicted_score", "N/A")
    return normalized


def public_row(match, rank):
    analysis = match.get("auto_analysis") or {}
    return {
        "rank": rank,
        "published": True,
        "fixtureId": match.get("fixture_id") or match.get("providerFixtureId"),
        "slug": match.get("slug"),
        "country": match.get("country"),
        "home": match.get("home"),
        "away": match.get("away"),
        "league": match.get("league"),
        "kickoffUtc": match.get("kickoff_utc") or match.get("kickoffUtc"),
        "pick": match.get("pick"),
        "pickSide": match.get("pick_side"),
        "odds": match.get("odds"),
        "confidence": match.get("confidence"),
        "strength": round(number(analysis.get("adjustedStrength"), number(analysis.get("absoluteStrength"))), 4),
        "reason": "QUALIFIED_AND_PUBLIC",
    }


def restore_qualified_matches(selected, previous_pool):
    matches = list(selected.get("matches") or [])
    if not matches:
        return matches
    existing = {
        str(match.get("fixture_id") or match.get("providerFixtureId") or match.get("fixtureId")): match
        for match in matches
    }
    pool_rows = list(previous_pool.get("candidates") or [])
    pool_ids = {str(row.get("fixtureId") or "") for row in pool_rows}
    if not existing or not set(existing).issubset(pool_ids) or len(pool_rows) <= len(existing):
        return matches
    restored = []
    for row in pool_rows:
        fixture_id = row.get("fixtureId")
        key = str(fixture_id or "")
        if key in existing:
            restored.append(existing[key])
            continue
        restored.append({
            "client_fixture_id": f"AUTO-{fixture_id}",
            "fixture_id": fixture_id,
            "home": row.get("home"),
            "away": row.get("away"),
            "league": row.get("league"),
            "kickoff_utc": row.get("kickoffUtc"),
            "pick": row.get("pick"),
            "odds": row.get("odds"),
            "confidence": row.get("confidence"),
            "reason": "Qualified by Add K The King of Soccer. Published during launch promotion.",
            "bookmaker": "API-FOOTBALL",
            "oddsStatus": "LOCKED" if number(row.get("odds")) > 1 else "N/A",
            "auto_analysis": {"adjustedStrength": row.get("strength")},
        })
    return restored


def main():
    selected = read_json(SELECTED_PATH)
    report = read_json(REPORT_PATH)
    previous_pool = read_json(POOL_PATH)
    matches = restore_qualified_matches(selected, previous_pool)
    ranked = sorted(matches, key=rank_key)
    published = [normalize_match(match) for match in ranked]
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    pool = {
        "generatedAt": generated_at,
        "mode": "ADD_K_PRODUCTION_ALL_QUALIFIED",
        "visibility": "PUBLIC_LAUNCH_PROMOTION",
        "ranking": [
            "confidence descending",
            "standings data availability",
            "adjusted strength descending",
            "minimum form sample descending",
            "kickoff ascending",
        ],
        "qualified": len(ranked),
        "published": len(published),
        "reserveCount": 0,
        "candidates": [
            public_row(match, index + 1)
            for index, match in enumerate(published)
        ],
    }
    selected["matches"] = published
    selected["system"] = "ADD K THE KING OF SOCCER / ALL QUALIFIED PICKS PUBLIC"
    selected["environment"] = "PRODUCTION"
    selected.setdefault("rules", {})["maximum_published_selections"] = 0
    selected["rules"]["all_qualified_picks_public"] = True
    selected["rules"]["qualified_reserves_owner_only"] = 0
    selected["candidatePool"] = {
        "qualified": len(ranked),
        "published": len(published),
        "reserveCount": 0,
        "ownerPath": "owner-candidate-pool.json",
    }

    report["environment"] = "PRODUCTION"
    report["qualified"] = len(ranked)
    report["published"] = len(published)
    report["reserveCount"] = 0
    report["publicationPolicy"] = "ALL_QUALIFIED_PUBLIC_LAUNCH_PROMOTION"
    report.pop("qualifiedBeforeTop10", None)
    report.pop("top10Policy", None)
    report["status"] = "PUBLISHED_ALL_QUALIFIED" if published else report.get("status", "NO_QUALIFYING_SELECTIONS")

    write_json(SELECTED_PATH, selected)
    write_json(REPORT_PATH, report)
    write_json(POOL_PATH, pool)
    print(json.dumps({
        "status": report["status"],
        "qualified": len(ranked),
        "published": len(published),
        "reserves": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
