import asyncio
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

API_BASE = "https://v3.football.api-sports.io"
LIVE_PATH = "/fixtures?live=all"


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def env_int(name, default, minimum=1):
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, value)


def atomic_write_json(path, payload):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, dir=str(target.parent), suffix=".tmp"
    ) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    temp_path.replace(target)


def rate_headers(response):
    names = {
        "minute_limit": ["x-ratelimit-requests-limit", "x-ratelimit-limit"],
        "minute_remaining": ["x-ratelimit-requests-remaining", "x-ratelimit-remaining"],
    }
    result = {}
    for field, candidates in names.items():
        value = None
        for name in candidates:
            raw = response.headers.get(name)
            if raw is None:
                continue
            try:
                value = int(raw)
            except ValueError:
                value = raw
            break
        result[field] = value
    result["retry_after"] = response.headers.get("retry-after")
    return result


def fixture_summary(item):
    fixture = item.get("fixture") or {}
    status = fixture.get("status") or {}
    teams = item.get("teams") or {}
    goals = item.get("goals") or {}
    league = item.get("league") or {}
    return {
        "fixture_id": fixture.get("id"),
        "status": status.get("short"),
        "minute": status.get("elapsed"),
        "seconds": status.get("seconds"),
        "kickoff": fixture.get("date"),
        "league_id": league.get("id"),
        "league": league.get("name"),
        "country": league.get("country"),
        "home_id": (teams.get("home") or {}).get("id"),
        "home": (teams.get("home") or {}).get("name"),
        "away_id": (teams.get("away") or {}).get("id"),
        "away": (teams.get("away") or {}).get("name"),
        "home_score": goals.get("home"),
        "away_score": goals.get("away"),
    }


class Collector:
    def __init__(self):
        load_dotenv()
        self.api_key = os.getenv("API_FOOTBALL_KEY", "").strip()
        if not self.api_key:
            raise RuntimeError("API_FOOTBALL_KEY is missing from runtime environment")

        self.live_poll = env_int("LIVE_POLL_SECONDS", 15, 5)
        self.idle_poll = env_int("IDLE_POLL_SECONDS", 60, 15)
        self.timeout = env_int("REQUEST_TIMEOUT_SECONDS", 15, 5)
        self.snapshot_path = os.getenv("SNAPSHOT_PATH", "snapshot.json")
        self.request_count = 0
        self.last_success_at = None

        self.client = httpx.AsyncClient(
            base_url=API_BASE,
            headers={
                "x-apisports-key": self.api_key,
                "Accept": "application/json",
                "User-Agent": "nomadtips3-live-engine-v2/0.1",
            },
            timeout=self.timeout,
        )

    async def close(self):
        await self.client.aclose()

    async def fetch_live(self):
        response = await self.client.get(LIVE_PATH)
        self.request_count += 1
        meta = rate_headers(response)

        if response.status_code == 204:
            return [], meta, 204

        if response.status_code == 429:
            retry_after = meta.get("retry_after")
            raise RuntimeError(f"API rate limited (429), retry-after={retry_after}")

        response.raise_for_status()
        payload = response.json()
        errors = payload.get("errors")
        if errors and errors != [] and errors != {}:
            raise RuntimeError(f"API returned errors: {errors}")
        return payload.get("response") or [], meta, response.status_code

    async def run(self):
        print("NOMADTIPS3 Live Engine V2 collector started")
        failure_streak = 0

        while True:
            started = utc_now()
            try:
                raw, rate, status = await self.fetch_live()
                fixtures = [fixture_summary(item) for item in raw]
                self.last_success_at = utc_now()
                failure_streak = 0

                snapshot = {
                    "schema": "nomadtips3.live.v2.fixture-snapshot",
                    "generated_at": self.last_success_at,
                    "request_started_at": started,
                    "source": "api-football:/fixtures?live=all",
                    "http_status": status,
                    "live_count": len(fixtures),
                    "request_count_process": self.request_count,
                    "rate_limit": rate,
                    "fixtures": fixtures,
                }
                atomic_write_json(self.snapshot_path, snapshot)

                print(
                    f"[{self.last_success_at}] live={len(fixtures)} "
                    f"remaining={rate.get('minute_remaining')} "
                    f"limit={rate.get('minute_limit')}"
                )
                wait_seconds = self.live_poll if fixtures else self.idle_poll

            except Exception as error:
                failure_streak += 1
                wait_seconds = min(120, max(self.idle_poll, 5 * failure_streak))
                print(f"[{utc_now()}] collector error: {error}; retry in {wait_seconds}s")

            await asyncio.sleep(wait_seconds)


async def main():
    collector = Collector()
    try:
        await collector.run()
    finally:
        await collector.close()


if __name__ == "__main__":
    asyncio.run(main())
