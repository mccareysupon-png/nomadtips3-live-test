import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

KEY = os.environ["API_FOOTBALL_KEY"]
BASE = "https://v3.football.api-sports.io"
CONFIG_PATH = Path("selected-live-matches.json")
BOOKMAKER_PRIORITY = {
    "bet365": 0,
    "pinnacle": 1,
    "betfair": 2,
    "unibet": 3,
    "1xbet": 4,
    "williamhill": 5,
}
EXCLUDED_MARKET_WORDS = {
    "firsthalf", "1sthalf", "secondhalf", "2ndhalf", "corners", "cards",
    "booking", "goalscorer", "shots", "period",
}
HEADERS = {"x-apisports-key": KEY}
TERMINAL_ODDS_STATUSES = {"N/A", "LOCKED", "BACKFILLED"}


def api(path: str, params=None, tries: int = 3):
    if params:
        path = f"{path}?{urllib.parse.urlencode(params)}"
    last_error = None
    for attempt in range(tries):
        try:
            request = urllib.request.Request(BASE + path, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.load(response)
            if payload.get("errors"):
                raise RuntimeError(str(payload["errors"]))
            return payload.get("response") or []
        except Exception as error:
            last_error = error
            time.sleep(2 + attempt * 2)
    raise last_error


def parse_iso(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def normalize(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9.+-]+", "", text)


def normalize_name(value):
    return re.sub(r"[^a-z0-9]+", "", normalize(value))


def safe_float(value):
    try:
        number = float(str(value).strip())
        return number if number > 0 else None
    except (TypeError, ValueError):
        return None


def number_tokens(value):
    found = re.findall(r"(?<!\d)([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?!\d)", str(value or ""))
    values = []
    for token in found:
        try:
            values.append(float(token))
        except ValueError:
            pass
    return values


def aliases(selected, side):
    values = [side, selected.get(side)]
    values.extend(selected.get(f"{side}_aliases") or [])
    return [normalize_name(value) for value in values if value]


def side_from_label(label, selected):
    compact = normalize_name(label)
    if not compact:
        return None
    if compact in {"home", "1"} or compact.startswith("home"):
        return "home"
    if compact in {"away", "2"} or compact.startswith("away"):
        return "away"
    for side in ("home", "away"):
        candidates = sorted(aliases(selected, side), key=len, reverse=True)
        if any(candidate and (candidate in compact or compact in candidate) for candidate in candidates):
            return side
    return None


def market_kind(name):
    compact = normalize_name(name)
    if any(word in compact for word in EXCLUDED_MARKET_WORDS):
        return None
    if "asianhandicap" in compact or compact in {"handicap", "handicapresult"}:
        return "asianHandicap"
    if "doublechance" in compact:
        return "doubleChance"
    if (
        "bothteamstoscore" in compact
        or "bothteamsscore" in compact
        or compact == "btts"
    ):
        return "btts"
    if compact in {"goalsoverunder", "totalgoalsoverunder", "overunder"}:
        return "overUnder"
    if compact in {"matchwinner", "1x2", "winner", "fulltimewinner", "matchresult"}:
        return "main"
    return None


def main_matches(value, selected):
    side = str(selected.get("pick_side") or "").lower()
    compact = normalize_name(value)
    if side == "draw":
        return compact in {"draw", "x"}
    detected = side_from_label(value, selected)
    if detected:
        return detected == side
    return (side == "home" and compact == "1") or (side == "away" and compact == "2")


def btts_matches(value, market):
    pick = normalize_name(market.get("pick"))
    wanted = "yes" if pick.startswith("y") else "no" if pick.startswith("n") else ""
    actual = normalize_name(value)
    return bool(wanted and (actual == wanted or actual.startswith(wanted)))


def over_under_matches(value, bet_name, market):
    wanted_side = str(market.get("side") or market.get("pick") or "").strip().lower()
    if wanted_side.startswith("over"):
        wanted_side = "over"
    elif wanted_side.startswith("under"):
        wanted_side = "under"
    else:
        return False
    try:
        wanted_line = float(market.get("line", 2.5))
    except (TypeError, ValueError):
        return False
    value_compact = normalize_name(value)
    actual_side = "over" if value_compact.startswith("over") else "under" if value_compact.startswith("under") else None
    if actual_side != wanted_side:
        return False
    combined = f"{value} {bet_name}"
    return any(abs(line - wanted_line) < 1e-6 for line in number_tokens(combined))


def double_chance_code(value):
    compact = normalize_name(value).upper()
    direct = compact.replace("OR", "")
    if direct in {"1X", "X2", "12"}:
        return direct
    if compact in {"HOMEORDRAW", "DRAWORDHOME", "HOMEDRAW"}:
        return "1X"
    if compact in {"DRAWORAWAY", "AWAYORDRAW", "DRAWAWAY"}:
        return "X2"
    if compact in {"HOMEORAWAY", "AWAYORHOME", "HOMEAWAY"}:
        return "12"
    return None


def double_chance_matches(value, market):
    wanted = str(market.get("code") or market.get("pick") or "").upper().replace(" ", "")[:2]
    return wanted in {"1X", "X2", "12"} and double_chance_code(value) == wanted


def asian_matches(value, bet_name, selected, market):
    wanted_side = str(market.get("side") or selected.get("pick_side") or "").lower()
    try:
        wanted_line = float(market.get("line"))
    except (TypeError, ValueError):
        return False
    combined = f"{value} {bet_name}"
    detected_side = side_from_label(value, selected) or side_from_label(bet_name, selected)
    if detected_side != wanted_side:
        return False
    return any(abs(line - wanted_line) < 1e-6 for line in number_tokens(combined))


def candidate_matches(kind, value, bet_name, selected):
    if kind == "main":
        return main_matches(value, selected)
    market = (selected.get("markets") or {}).get(kind) or {}
    if kind == "btts":
        return btts_matches(value, market)
    if kind == "overUnder":
        return over_under_matches(value, bet_name, market)
    if kind == "doubleChance":
        return double_chance_matches(value, market)
    if kind == "asianHandicap":
        return asian_matches(value, bet_name, selected, market)
    return False


def candidate_rank(candidate, locked_at):
    bookmaker_key = normalize_name(candidate.get("bookmaker"))
    priority = BOOKMAKER_PRIORITY.get(bookmaker_key, 50)
    updated = parse_iso(candidate.get("providerUpdatedAt"))
    lock_time = parse_iso(locked_at)
    after_lock = 1
    distance = float("inf")
    if updated and lock_time:
        after_lock = 0 if updated <= lock_time else 1
        distance = abs((lock_time - updated).total_seconds())
    elif updated:
        distance = -updated.timestamp()
    return (after_lock, priority, distance, str(candidate.get("bookmaker") or ""))


def extract_candidates(rows, selected):
    candidates = {"main": [], "btts": [], "overUnder": [], "doubleChance": [], "asianHandicap": []}
    for row in rows:
        provider_updated = row.get("update") or row.get("updated")
        for bookmaker in row.get("bookmakers") or []:
            bookmaker_name = bookmaker.get("name") or "API-FOOTBALL"
            for bet in bookmaker.get("bets") or []:
                bet_name = bet.get("name") or ""
                kind = market_kind(bet_name)
                if not kind:
                    continue
                for item in bet.get("values") or []:
                    odd = safe_float(item.get("odd"))
                    value = item.get("value")
                    if odd is None or not candidate_matches(kind, value, bet_name, selected):
                        continue
                    candidates[kind].append({
                        "odds": odd,
                        "bookmaker": bookmaker_name,
                        "marketName": bet_name,
                        "marketValue": value,
                        "providerUpdatedAt": provider_updated,
                    })
    return candidates


def has_odds(value):
    return safe_float(value) is not None


def terminal_odds_status(value):
    return str(value or "").strip().upper() in TERMINAL_ODDS_STATUSES


def total_goals_index(selected):
    analysis = selected.get("auto_analysis") or selected.get("autoAnalysis") or {}
    totals = []
    for key in ("homeOverall", "awayOverall", "homeVenue", "awayVenue"):
        summary = analysis.get(key) or {}
        try:
            gf = float(summary.get("gfpg"))
            ga = float(summary.get("gapg"))
        except (TypeError, ValueError):
            continue
        totals.append(gf + ga)
    return sum(totals) / len(totals) if totals else None


def ensure_over_under_market(selected):
    markets = selected.setdefault("markets", {})
    existing = markets.get("overUnder")
    if isinstance(existing, dict) and existing.get("pick"):
        return False
    index = total_goals_index(selected)
    if index is None:
        return False
    side = "over" if index >= 2.5 else "under"
    confidence = int(selected.get("confidence") or 0)
    markets["overUnder"] = {
        "pick": f"{'Over' if side == 'over' else 'Under'} 2.5",
        "odds": None,
        "confidence": confidence,
        "bookmaker": "N/A",
        "oddsStatus": "PENDING",
        "oddsSource": "NOT FOUND",
        "line": 2.5,
        "side": side,
        "model": "INDEPENDENT_TOTAL_GOALS_INDEX_V1",
        "totalGoalsIndex": round(index, 4),
    }
    return True


def requested_kinds(selected):
    kinds = []
    if not has_odds(selected.get("odds")) and not terminal_odds_status(selected.get("oddsStatus")):
        kinds.append("main")
    markets = selected.get("markets") or {}
    for kind in ("btts", "overUnder", "doubleChance", "asianHandicap"):
        market = markets.get(kind)
        if (
            isinstance(market, dict)
            and not has_odds(market.get("odds"))
            and not terminal_odds_status(market.get("oddsStatus"))
        ):
            kinds.append(kind)
    return kinds


def apply_candidate(target, candidate, status, now_text):
    target["odds"] = candidate["odds"]
    target["bookmaker"] = candidate["bookmaker"]
    target["oddsStatus"] = status
    target["oddsSource"] = "API-FOOTBALL"
    target["oddsLockedAt"] = now_text
    target["oddsProviderUpdatedAt"] = candidate.get("providerUpdatedAt")
    target["oddsMarketName"] = candidate.get("marketName")
    target["oddsMarketValue"] = candidate.get("marketValue")


def set_missing_status(selected, kind, now_dt):
    kickoff = parse_iso(selected.get("kickoff_utc"))
    status = "N/A" if kickoff and now_dt >= kickoff else "PENDING"
    if kind == "main":
        if selected.get("oddsStatus") != status:
            selected["oddsStatus"] = status
            return True
        return False
    market = ((selected.get("markets") or {}).get(kind) or {})
    if market.get("oddsStatus") != status:
        market["oddsStatus"] = status
        return True
    return False


def main():
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    matches = config.get("matches") or []
    now_dt = datetime.now(timezone.utc)
    now_text = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    locked_at = config.get("locked_at_utc")
    changed = False
    found = 0
    missing = 0
    checked = 0
    errors = []

    for selected in matches:
        changed = ensure_over_under_market(selected) or changed
        kinds = requested_kinds(selected)
        fixture_id = selected.get("fixture_id")
        if not kinds or not fixture_id:
            continue
        checked += 1
        try:
            rows = api("/odds", {"fixture": int(fixture_id)})
        except Exception as error:
            errors.append({"fixtureId": str(fixture_id), "error": str(error)})
            continue

        candidates = extract_candidates(rows, selected)
        kickoff = parse_iso(selected.get("kickoff_utc"))
        historical = bool(kickoff and now_dt >= kickoff)
        lock_status = "BACKFILLED" if historical else "LOCKED"

        for kind in kinds:
            options = candidates.get(kind) or []
            if options:
                best = sorted(options, key=lambda item: candidate_rank(item, locked_at))[0]
                if kind == "main":
                    apply_candidate(selected, best, lock_status, now_text)
                else:
                    market = selected["markets"][kind]
                    apply_candidate(market, best, lock_status, now_text)
                found += 1
                changed = True
            else:
                missing += 1
                changed = set_missing_status(selected, kind, now_dt) or changed

    if changed:
        config["oddsPolicy"] = {
            "markets": ["1X2", "BTTS", "Over/Under 2.5", "Double Chance", "Asian Handicap"],
            "lockRule": "first real API price is preserved; missing prices become terminal N/A after kickoff and are not queried again",
            "source": "API-FOOTBALL",
        }
        CONFIG_PATH.write_text(
            json.dumps(config, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps({
        "checkedFixtures": checked,
        "foundMarkets": found,
        "missingMarkets": missing,
        "configChanged": changed,
        "errors": errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
