import json
from datetime import datetime, timezone
from pathlib import Path

SELECTED_PATH = Path("selected-live-matches.json")
REPORT_PATH = Path("auto-selection-report.json")
POOL_PATH = Path("owner-candidate-pool.json")
MINIMUM_MAIN_ODDS = 1.70
MINIMUM_CONFIDENCE = 58


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


def validate_automatic_candidates(selected, matches):
    rules = selected.get("rules") or {}
    errors = []
    if rules.get("automatic_selection") is not True:
        errors.append("automatic_selection must be true")
    if rules.get("manual_analysis_only") is True:
        errors.append("manual_analysis_only must be false")
    for match in matches:
        fixture_id = match.get("fixture_id") or match.get("providerFixtureId") or match.get("fixtureId")
        origin = str(match.get("selection_origin") or "").upper()
        client_id = str(match.get("client_fixture_id") or "").upper()
        odds = number(match.get("odds"), 0.0)
        confidence = number(match.get("confidence"), 0.0)
        if origin.startswith("MANUAL") or client_id.startswith("MANUAL-"):
            errors.append(f"fixture {fixture_id}: manual selection cannot enter Production AUTO")
        if odds < MINIMUM_MAIN_ODDS:
            errors.append(f"fixture {fixture_id}: main odds {odds:g} below {MINIMUM_MAIN_ODDS:.2f}")
        if confidence < MINIMUM_CONFIDENCE:
            errors.append(f"fixture {fixture_id}: confidence {confidence:g} below {MINIMUM_CONFIDENCE}%")
    if errors:
        raise RuntimeError("Production publication guard rejected selection: " + "; ".join(errors))


def rank_key(match):
    analysis = match.get("auto_analysis") or {}
    confidence = number(match.get("confidence"))
    strength = number(analysis.get("adjustedStrength"), number(analysis.get("absoluteStrength")))
    kickoff = str(match.get("kickoff_utc") or match.get("kickoffUtc") or "")
    return (-confidence, -strength, kickoff, str(match.get("fixture_id") or ""))


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
    matches = list(selected.get("matches") or [])
    validate_automatic_candidates(selected, matches)
    ranked = sorted(matches, key=rank_key)
    published = [normalize_match(match) for match in ranked[:10]]
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    pool = {
        "generatedAt": generated_at,
        "mode": "ADD_K_PRODUCTION_TOP_10",
        "visibility": "PUBLIC_TOP_10",
        "ranking": [
            "confidence descending",
            "adjusted strength descending",
            "kickoff ascending",
        ],
        "qualified": len(ranked),
        "published": len(published),
        "discardedAfterTop10": max(0, len(ranked) - len(published)),
        "candidates": [
            public_row(match, index + 1)
            for index, match in enumerate(published)
        ],
    }
    selected["matches"] = published
    selected["system"] = "ADD K THE KING OF SOCCER V1 / CONFIDENCE TOP 10"
    selected["environment"] = "PRODUCTION"
    selected.setdefault("rules", {}).update({
        "odds_min": MINIMUM_MAIN_ODDS,
        "confidence_minimum": MINIMUM_CONFIDENCE,
        "automatic_selection": True,
        "manual_analysis_only": False,
        "maximum_published_selections": 10,
        "all_qualified_picks_public": False,
        "qualified_reserves_owner_only": 0,
    })
    selected["productionGuard"] = {
        "version": 1,
        "minimumMainOdds": MINIMUM_MAIN_ODDS,
        "minimumConfidence": MINIMUM_CONFIDENCE,
        "manualSelectionsAllowed": False,
        "machine": "CAR_1_PRODUCTION_ONLY",
    }
    selected["candidatePool"] = {
        "qualified": len(ranked),
        "published": len(published),
        "discardedAfterTop10": max(0, len(ranked) - len(published)),
        "ownerPath": "owner-candidate-pool.json",
    }

    report["environment"] = "PRODUCTION"
    report["qualified"] = len(ranked)
    report["published"] = len(published)
    report["discardedAfterTop10"] = max(0, len(ranked) - len(published))
    report["publicationPolicy"] = "CONFIDENCE_DESCENDING_TOP_10"
    report["qualifiedBeforeTop10"] = len(ranked)
    report["top10Policy"] = "Publish up to 10; fewer or zero picks are valid"
    report["status"] = "PUBLISHED_TOP_10" if published else report.get("status", "NO_QUALIFYING_SELECTIONS")

    write_json(SELECTED_PATH, selected)
    write_json(REPORT_PATH, report)
    write_json(POOL_PATH, pool)
    print(json.dumps({
        "status": report["status"],
        "qualified": len(ranked),
        "published": len(published),
        "discardedAfterTop10": max(0, len(ranked) - len(published)),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
