import json
from pathlib import Path

RULES_PATH = Path("config/nomad-auto-rules.json")
SELECTED_PATH = Path("selected-live-matches.json")
REPORT_PATH = Path("auto-selection-report.json")


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def finite_number(value, fallback=None):
    try:
        number = float(value)
        return number if number == number else fallback
    except (TypeError, ValueError):
        return fallback


def calculated_confidence(match, minimum, maximum, scale):
    analysis = match.get("auto_analysis") or {}
    strength = finite_number(analysis.get("absoluteStrength"))
    if strength is None:
        strength = abs(finite_number(analysis.get("strengthScore"), 0.0))
    raw = 50.0 + (strength * scale)
    return max(0, min(maximum, int(round(raw))))


def main():
    rules = read_json(RULES_PATH)
    selected = read_json(SELECTED_PATH)
    system = str(selected.get("system") or "").upper()
    if "AUTO" not in system or not isinstance(selected.get("matches"), list):
        print(json.dumps({"status": "SKIPPED_NON_AUTO_SET"}))
        return

    minimum = int(rules.get("minimum_confidence", 58))
    maximum = int(rules.get("maximum_confidence", 85))
    scale = float(rules.get("confidence_strength_scale", 15))

    published = []
    rejected = []
    for match in selected.get("matches") or []:
        confidence = calculated_confidence(match, minimum, maximum, scale)
        if confidence < minimum:
            rejected.append({
                "fixture_id": match.get("fixture_id"),
                "match": f"{match.get('home')} vs {match.get('away')}",
                "confidence": confidence,
                "reason": f"confidence below minimum {minimum}%",
            })
            continue

        match["confidence"] = confidence
        markets = match.get("markets") or {}
        for market in markets.values():
            if isinstance(market, dict):
                market["confidence"] = confidence

        analysis = match.setdefault("auto_analysis", {})
        analysis["confidenceScore"] = confidence
        analysis["confidenceMethod"] = "50 + (15 × absolute weighted strength), capped by policy"
        published.append(match)

    selected["matches"] = published
    rule_meta = selected.setdefault("rules", {})
    rule_meta.pop("confidence_fixed", None)
    rule_meta["confidence_minimum"] = minimum
    rule_meta["confidence_maximum"] = maximum
    rule_meta["confidence_dynamic"] = True
    rule_meta["confidence_policy"] = (
        f"Calculated per match from NOMAD weighted strength; only confidence >= {minimum}% is published; "
        f"maximum displayed confidence {maximum}%"
    )
    selected["confidencePolicy"] = {
        "type": "DYNAMIC_MINIMUM",
        "minimum": minimum,
        "maximum": maximum,
        "formula": f"round(50 + absoluteStrength × {scale:g}), capped at {maximum}",
        "inputs": ["overall PPG", "home/away PPG", "goal-difference rate", "common-opponent edge"],
        "note": "NOMAD model confidence score; not a guaranteed outcome probability",
        "rejectedBelowMinimum": len(rejected),
    }
    write_json(SELECTED_PATH, selected)

    if REPORT_PATH.exists():
        report = read_json(REPORT_PATH)
        report["confidencePolicy"] = selected["confidencePolicy"]
        report["confidenceRejected"] = len(rejected)
        report["publishedAfterConfidence"] = len(published)
        report.setdefault("rejections", {})
        if rejected:
            report["rejections"]["confidence below minimum"] = (
                int(report["rejections"].get("confidence below minimum", 0)) + len(rejected)
            )
        write_json(REPORT_PATH, report)

    print(json.dumps({
        "status": "CONFIDENCE_POLICY_APPLIED",
        "minimum": minimum,
        "maximum": maximum,
        "published": len(published),
        "rejected": len(rejected),
        "confidenceRange": [
            min((item["confidence"] for item in published), default=None),
            max((item["confidence"] for item in published), default=None),
        ],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
