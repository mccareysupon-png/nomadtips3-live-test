import json
from datetime import datetime, timezone
from pathlib import Path

SELECTED_PATH = Path("selected-live-matches.json")
REPORT_PATH = Path("auto-selection-report.json")
POOL_PATH = Path("owner-candidate-pool.json")
TOP_LIMIT = 10


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


def public_row(match, rank, published):
    analysis = match.get("auto_analysis") or {}
    return {
        "rank": rank,
        "published": published,
        "fixtureId": match.get("fixture_id") or match.get("providerFixtureId"),
        "home": match.get("home"),
        "away": match.get("away"),
        "league": match.get("league"),
        "kickoffUtc": match.get("kickoff_utc") or match.get("kickoffUtc"),
        "pick": match.get("pick"),
        "odds": match.get("odds"),
        "confidence": match.get("confidence"),
        "strength": round(number(analysis.get("adjustedStrength"), number(analysis.get("absoluteStrength"))), 4),
        "reason": "TOP_10_QUALITY" if published else "QUALIFIED_RESERVE_OUTSIDE_TOP_10",
    }


def main():
    selected = read_json(SELECTED_PATH)
    report = read_json(REPORT_PATH)
    matches = list(selected.get("matches") or [])
    ranked = sorted(matches, key=rank_key)
    top = ranked[:TOP_LIMIT]
    reserves = ranked[TOP_LIMIT:]
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    pool = {
        "generatedAt": generated_at,
        "mode": "ADD_K_PRODUCTION_AUTO_TOP_10",
        "visibility": "OWNER_CONTROL_ONLY",
        "ranking": [
            "confidence descending",
            "standings data availability",
            "adjusted strength descending",
            "minimum form sample descending",
            "kickoff ascending",
        ],
        "qualified": len(ranked),
        "published": len(top),
        "reserveCount": len(reserves),
        "candidates": [
            public_row(match, index + 1, index < TOP_LIMIT)
            for index, match in enumerate(ranked)
        ],
    }
    selected["matches"] = top
    selected["system"] = "ADD K THE KING OF SOCCER / PRODUCTION AUTO TOP 10"
    selected["environment"] = "PRODUCTION"
    selected.setdefault("rules", {})["maximum_published_selections"] = TOP_LIMIT
    selected["rules"]["qualified_reserves_owner_only"] = len(reserves)
    selected["candidatePool"] = {
        "qualified": len(ranked),
        "published": len(top),
        "reserveCount": len(reserves),
        "ownerPath": "owner-candidate-pool.json",
    }

    report["environment"] = "PRODUCTION"
    report["qualifiedBeforeTop10"] = len(ranked)
    report["published"] = len(top)
    report["reserveCount"] = len(reserves)
    report["top10Policy"] = "CONFIDENCE_STANDINGS_STRENGTH_SAMPLE_KICKOFF"
    report["status"] = "PUBLISHED_TOP_10" if top else report.get("status", "NO_QUALIFYING_SELECTIONS")

    write_json(SELECTED_PATH, selected)
    write_json(REPORT_PATH, report)
    write_json(POOL_PATH, pool)
    print(json.dumps({
        "status": report["status"],
        "qualified": len(ranked),
        "published": len(top),
        "reserves": len(reserves),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
