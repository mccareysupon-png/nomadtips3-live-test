from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_BASE = "https://api.bigballsdata.com"
OUTPUT = Path("live-data-bigballs.json")


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dig(obj: Any, *path: str, default: Any = None) -> Any:
    cur = obj
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def first(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def number(value: Any) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        cleaned = value.strip().replace("%", "")
        try:
            parsed = float(cleaned)
            return int(parsed) if parsed.is_integer() else parsed
        except ValueError:
            return None
    return None


def normalize_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def same_team(a: Any, b: Any) -> bool:
    x, y = normalize_name(a), normalize_name(b)
    return bool(x and y and (x == y or x in y or y in x))


def canonical_team_name(api_value: Any, fallback: str) -> str:
    candidate = re.sub(r"\s+", " ", str(api_value or "")).strip()
    if not candidate:
        return fallback
    if same_team(candidate, fallback):
        return fallback
    words = candidate.split()
    if len(words) % 2 == 0:
        midpoint = len(words) // 2
        if words[:midpoint] == words[midpoint:]:
            return " ".join(words[:midpoint])
    return candidate


def parse_utc(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def normalize_status(value: Any) -> str:
    status = str(value or "scheduled").strip().lower().replace("-", "_")
    if status in {"in_progress", "in progress", "live", "1h", "2h", "first_half", "second_half"}:
        return "live"
    if status in {"finished", "final", "ft", "completed", "full time", "full_time"}:
        return "finished"
    if status in {"scheduled", "not_started", "not started", "ns"}:
        return "scheduled"
    return status


def fetch_json(url: str, api_key: str, attempts: int = 3) -> tuple[int | None, dict[str, Any]]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "User-Agent": "nomadtips3-live-test/2.1",
    }
    last_error: str | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(Request(url, headers=headers), timeout=45) as response:
                body = response.read().decode("utf-8", errors="replace")
                return response.status, json.loads(body)
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {"data": None, "error": {"code": "http_error", "message": body}}
            return exc.code, payload
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            if attempt < attempts:
                time.sleep(attempt * 2)
    return None, {"data": None, "error": {"code": "network_error", "message": last_error}}


def team_ids(stored_match: dict[str, Any]) -> tuple[Any, Any]:
    return (
        first(
            dig(stored_match, "home", "id"),
            stored_match.get("home_team_id"),
            dig(stored_match, "home_team", "id"),
        ),
        first(
            dig(stored_match, "away", "id"),
            stored_match.get("away_team_id"),
            dig(stored_match, "away_team", "id"),
        ),
    )


def team_id_from_rows(rows: Any, team_name: str) -> Any:
    if not isinstance(rows, list):
        return None
    for row in rows:
        if isinstance(row, dict) and same_team(row.get("team_name"), team_name):
            return row.get("team_id")
    return None


def direct_pair(stats_obj: Any, side: str, keys: tuple[str, ...]) -> Any:
    if not isinstance(stats_obj, dict):
        return None
    for key in keys:
        value = stats_obj.get(key)
        if isinstance(value, dict):
            candidate = first(value.get(side), dig(value, "value", side))
            if candidate is not None:
                return number(candidate)
    return None


def live_stat(stats_value: Any, team_id: Any, metrics: tuple[str, ...]) -> Any:
    if not isinstance(stats_value, list) or team_id is None:
        return None
    wanted = set(metrics)
    for row in stats_value:
        if not isinstance(row, dict):
            continue
        if str(row.get("team_id")) == str(team_id) and row.get("metric") in wanted:
            parsed = number(row.get("value"))
            if parsed is not None:
                return parsed
    return None


def stored_stat(rows: Any, team_name: str, fields: tuple[str, ...]) -> Any:
    if not isinstance(rows, list):
        return None
    wanted = set(fields)
    for row in rows:
        if not isinstance(row, dict):
            continue
        if same_team(row.get("team_name"), team_name) and row.get("field") in wanted:
            parsed = number(first(row.get("display_value"), row.get("value")))
            if parsed is not None:
                return parsed
    return None


def stat_value(
    stats_value: Any,
    stored_rows: Any,
    side: str,
    team_id: Any,
    team_name: str,
    keys: tuple[str, ...],
) -> Any:
    return first(
        live_stat(stats_value, team_id, keys),
        direct_pair(stats_value, side, keys),
        stored_stat(stored_rows, team_name, keys),
    )


def format_percent(value: Any) -> str | None:
    parsed = number(value)
    return None if parsed is None else f"{parsed:g}%"


def normalize_events(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    normalized: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        elapsed_seconds = first(dig(row, "clock", "elapsed_seconds"), row.get("elapsed_seconds"))
        minute = number(first(row.get("minute"), row.get("elapsed")))
        if elapsed_seconds is not None:
            seconds = number(elapsed_seconds)
            minute = int(seconds // 60) if seconds is not None else minute
        normalized.append(
            {
                "minute": minute,
                "type": first(row.get("type"), "Event"),
                "detail": first(row.get("description"), row.get("detail"), row.get("type"), "Event"),
                "player": first(
                    row.get("player_name"),
                    dig(row, "player", "display_name"),
                    dig(row, "player", "name"),
                    row.get("player_id"),
                ),
                "team": first(row.get("team_name"), dig(row, "team", "name"), row.get("team_id")),
            }
        )
    return normalized


def has_stats(stats_obj: dict[str, Any]) -> bool:
    for category, values in stats_obj.items():
        if category == "dangerous_attacks" or not isinstance(values, dict):
            continue
        if values.get("home") is not None or values.get("away") is not None:
            return True
    return False


def main() -> int:
    api_key = os.environ.get("BIGBALLS_API_KEY", "").strip()
    match_id = os.environ.get("MATCH_ID", "f1236384-4184-46ff-b168-bdb638126682")
    home_name = os.environ.get("HOME_NAME", "Inter Miami CF")
    away_name = os.environ.get("AWAY_NAME", "Columbus Crew")
    kickoff_fallback = os.environ.get("KICKOFF_UTC", "2026-08-01T23:30:00.000Z")

    if not api_key:
        raise RuntimeError("BIGBALLS_API_KEY is missing")

    urls = {
        "detail": f"{API_BASE}/v1/matches/{match_id}?sport=football&fields=scores%2Cstats%2Cevents",
        "stored": f"{API_BASE}/v1/stored/matches/{match_id}",
        "stats": f"{API_BASE}/v1/stored/matches/{match_id}/stats",
        "events": f"{API_BASE}/v1/matches/{match_id}/events?sport=football",
    }
    responses: dict[str, dict[str, Any]] = {}
    statuses: dict[str, int | None] = {}
    for name, url in urls.items():
        statuses[name], responses[name] = fetch_json(url, api_key)

    detail = responses["detail"]
    stored = responses["stored"]
    stats = responses["stats"]
    events = responses["events"]

    stored_match = dig(stored, "data", default={})
    if not isinstance(stored_match, dict):
        stored_match = {}
    score_value = dig(detail, "data", "scores", "value", default={})
    if not isinstance(score_value, dict):
        score_value = {}
    stats_value = dig(detail, "data", "stats", "value", default={})
    stored_rows = dig(stats, "data", "team_stats", default=[])
    event_rows = first(
        dig(detail, "data", "events", "value"),
        dig(events, "data", "events"),
        [],
    )

    home_display = canonical_team_name(
        first(dig(stored_match, "home", "name"), dig(stored_match, "home_team", "name")),
        home_name,
    )
    away_display = canonical_team_name(
        first(dig(stored_match, "away", "name"), dig(stored_match, "away_team", "name")),
        away_name,
    )

    home_id, away_id = team_ids(stored_match)
    home_id = first(home_id, team_id_from_rows(stored_rows, home_display))
    away_id = first(away_id, team_id_from_rows(stored_rows, away_display))

    elapsed_seconds = first(
        dig(score_value, "clock", "elapsed_seconds"),
        dig(detail, "data", "elapsed_seconds"),
    )
    elapsed = None
    if elapsed_seconds is not None:
        parsed_seconds = number(elapsed_seconds)
        elapsed = int(parsed_seconds // 60) if parsed_seconds is not None else None
    if elapsed is None:
        elapsed = number(dig(detail, "data", "elapsed"))

    def pair(keys: tuple[str, ...]) -> dict[str, Any]:
        return {
            "home": stat_value(stats_value, stored_rows, "home", home_id, home_display, keys),
            "away": stat_value(stats_value, stored_rows, "away", away_id, away_display, keys),
        }

    possession = pair(("possession_percent", "possession", "ball_possession"))
    normalized_stats = {
        "possession": {
            "home": format_percent(possession["home"]),
            "away": format_percent(possession["away"]),
        },
        "shots": pair(("shots", "total_shots")),
        "shots_on_target": pair(("shots_on_target",)),
        "corners": pair(("corners", "corner_kicks")),
        "yellow_cards": pair(("cards_yellow", "yellow_cards")),
        "red_cards": pair(("cards_red", "red_cards")),
        "dangerous_attacks": {"home": None, "away": None},
    }
    normalized_events = normalize_events(event_rows)

    home_score = first(
        score_value.get("home"),
        dig(detail, "data", "score", "home"),
        dig(detail, "data", "scores", "home"),
        stored_match.get("home_score"),
    )
    away_score = first(
        score_value.get("away"),
        dig(detail, "data", "score", "away"),
        dig(detail, "data", "scores", "away"),
        stored_match.get("away_score"),
    )
    kickoff = first(stored_match.get("kickoff_utc"), stored_match.get("kickoff"), kickoff_fallback)
    provider_status = normalize_status(
        first(score_value.get("status"), dig(detail, "data", "status"), stored_match.get("status"))
    )

    kickoff_time = parse_utc(kickoff)
    kickoff_passed = bool(kickoff_time and datetime.now(timezone.utc) >= kickoff_time)
    events_coverage = dig(events, "meta", "coverage")
    detail_source = str(dig(detail, "meta", "source", default="") or "").lower()
    detail_note = str(dig(detail, "meta", "note", default="") or "").lower()
    upstream_unavailable = (
        kickoff_passed
        and provider_status == "scheduled"
        and home_score is None
        and away_score is None
        and not has_stats(normalized_stats)
        and not normalized_events
        and (
            events_coverage is False
            or detail_source == "stored"
            or "stored matches table" in detail_note
        )
    )
    display_status = "ไม่มีข้อมูลสดจาก BigBalls" if upstream_unavailable else provider_status
    coverage_message = first(
        dig(events, "meta", "message"),
        dig(detail, "meta", "note"),
        "BigBalls ยังไม่ส่งข้อมูลสดของคู่นี้",
    ) if upstream_unavailable else None

    output = {
        "source": "bigballs",
        "fetched_at_utc": now_utc(),
        "http_status": statuses["detail"],
        "stored_http_status": statuses["stored"],
        "stats_http_status": statuses["stats"],
        "events_http_status": statuses["events"],
        "match": {
            "id": match_id,
            "sport": "football",
            "league": first(dig(stored_match, "league", "name"), stored_match.get("league"), "MLS"),
            "country": first(stored_match.get("country"), "USA"),
            "home": {
                "name": home_display,
                "short_name": first(
                    dig(stored_match, "home", "short_name"),
                    dig(stored_match, "home_team", "short_name"),
                    "MIA",
                ),
            },
            "away": {
                "name": away_display,
                "short_name": first(
                    dig(stored_match, "away", "short_name"),
                    dig(stored_match, "away_team", "short_name"),
                    "CLB",
                ),
            },
            "kickoff_utc": kickoff,
            "status": display_status,
            "provider_status": provider_status,
            "elapsed": elapsed,
            "score": {"home": home_score, "away": away_score},
            "stats": normalized_stats,
            "events": normalized_events,
            "coverage": {
                "live_available": not upstream_unavailable,
                "message": coverage_message,
            },
        },
        "api_response": detail,
        "stored_response": stored,
        "stats_response": stats,
        "events_response": events,
    }

    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "fetched_at_utc": output["fetched_at_utc"],
                "http": statuses,
                "status": output["match"]["status"],
                "provider_status": output["match"]["provider_status"],
                "coverage": output["match"]["coverage"],
                "elapsed": output["match"]["elapsed"],
                "score": output["match"]["score"],
                "stats": output["match"]["stats"],
                "event_count": len(output["match"]["events"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"BigBalls refresh failed: {exc}", file=sys.stderr)
        raise
