import asyncio
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

from candidate_filter import filter_preliminary, load_condition_config, normalize_config
from condition_engine import ConditionEngine
from detail_fetcher import DetailFetcher
from detail_normalizer import compact_fixture_details, compact_live_odds
from engine_store import EngineStore
from provider_errors import ProviderRateLimitError
from remote_config import RemoteConfigClient
from state_publisher import StatePublisher

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


def env_bool(name, default=False):
    raw = str(os.getenv(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}


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
        self.condition_config_path = os.getenv("CONDITION_CONFIG_PATH", "condition.json")
        self.database_path = os.getenv("ENGINE_DB_PATH", "state/car3-engine.sqlite3")
        self.signal_inbox_dir = os.getenv(
            "SIGNAL_INBOX_DIR", "../car3-bot/signals/inbox"
        )
        self.request_count = 0
        self.last_success_at = None
        self.last_snapshot = None

        self.client = httpx.AsyncClient(
            base_url=API_BASE,
            headers={
                "x-apisports-key": self.api_key,
                "Accept": "application/json",
                "User-Agent": "nomadtips3-live-engine-v2/0.5",
            },
            timeout=self.timeout,
        )
        self.detail_fetcher = DetailFetcher(self.client, self._count_request)
        self.store = EngineStore(self.database_path)
        self.engine = ConditionEngine(self.store, self.signal_inbox_dir)

        publish_enabled = env_bool("V2_PUBLISH_ENABLED", False)
        publish_url = os.getenv("V2_INGEST_URL", "") if publish_enabled else ""
        shared_secret = os.getenv("V2_INGEST_SECRET", "")
        auth_mode = os.getenv("V2_AUTH_MODE", "bearer")
        signing_key = os.getenv("V2_SIGNING_PRIVATE_KEY_B64", "")
        publish_secret = shared_secret if publish_enabled else ""
        self.publisher = StatePublisher(
            publish_url,
            publish_secret,
            auth_mode=auth_mode,
            signing_private_key_b64=signing_key,
            collector_id=os.getenv("COLLECTOR_ID", "vps-primary"),
            heartbeat_seconds=env_int("PUBLISH_HEARTBEAT_SECONDS", 60, 15),
        )

        remote_enabled = env_bool("V2_REMOTE_CONFIG_ENABLED", False)
        remote_url = os.getenv("V2_CONFIG_URL", "") if remote_enabled else ""
        remote_secret = shared_secret if remote_enabled else ""
        self.remote_config = RemoteConfigClient(
            remote_url,
            remote_secret,
            auth_mode=auth_mode,
            signing_private_key_b64=signing_key,
            refresh_seconds=env_int("V2_CONFIG_REFRESH_SECONDS", 15, 5),
        )

    def _count_request(self):
        self.request_count += 1

    async def close(self):
        await self.client.aclose()
        await self.publisher.close()
        await self.remote_config.close()
        self.store.close()

    async def fetch_live(self):
        response = await self.client.get(LIVE_PATH)
        self._count_request()
        meta = rate_headers(response)

        if response.status_code == 204:
            return [], meta, 204

        if response.status_code == 429:
            retry_after = meta.get("retry_after")
            raise ProviderRateLimitError(retry_after)

        response.raise_for_status()
        payload = response.json()
        errors = payload.get("errors")
        if errors and errors != [] and errors != {}:
            raise RuntimeError(f"API returned errors: {errors}")
        return payload.get("response") or [], meta, response.status_code

    async def current_condition(self):
        local = load_condition_config(self.condition_config_path)
        remote = await self.remote_config.get()
        if remote and isinstance(remote.get("config"), dict):
            return normalize_config(remote["config"]), {
                "source": "D1_OWNER_CONFIG",
                "version": int(remote.get("version") or 0),
                "remote_error": self.remote_config.last_error,
            }
        return local, {
            "source": "LOCAL_FALLBACK",
            "version": 0,
            "remote_error": self.remote_config.last_error,
        }

    async def enrich_shortlist(self, candidates, condition):
        compact_stats = {}
        compact_odds = {}
        telemetry = {
            "statistics_enabled": bool(condition.get("statistics_enabled")),
            "live_odds_enabled": bool(condition.get("live_odds_enabled")),
            "statistics_batch_count": 0,
            "statistics_cache_hits": 0,
            "live_odds_cache_hit": False,
            "origin_requests_cycle": 0,
        }

        if not candidates:
            return compact_stats, compact_odds, telemetry

        before = self.detail_fetcher.origin_requests

        if condition.get("statistics_enabled"):
            result = await self.detail_fetcher.fixture_details(
                candidates,
                ttl_seconds=condition.get("statistics_ttl_seconds", 60),
            )
            compact_stats = compact_fixture_details(result["by_fixture"])
            telemetry["statistics_batch_count"] = result["batch_count"]
            telemetry["statistics_cache_hits"] = result["cache_hits"]

        if condition.get("live_odds_enabled"):
            result = await self.detail_fetcher.live_odds(
                candidates,
                ttl_seconds=condition.get("live_odds_ttl_seconds", 10),
            )
            compact_odds = compact_live_odds(result["by_fixture"])
            telemetry["live_odds_cache_hit"] = result["cache_hit"]

        telemetry["origin_requests_cycle"] = self.detail_fetcher.origin_requests - before
        return compact_stats, compact_odds, telemetry

    async def publish_snapshot(self, snapshot):
        try:
            return await self.publisher.publish(snapshot)
        except Exception as error:
            return {
                "published": False,
                "reason": "PUBLISH_ERROR",
                "error": str(error),
            }

    def retry_wait(self, error, failure_streak):
        if isinstance(error, ProviderRateLimitError):
            provider_wait = error.retry_after or 0
            return max(provider_wait, min(900, 15 * (2 ** min(6, failure_streak - 1))))
        return min(300, max(self.idle_poll, 5 * failure_streak))

    async def publish_failure(self, error, failure_streak, wait_seconds):
        if not self.last_snapshot:
            return {"published": False, "reason": "NO_LAST_SNAPSHOT"}
        snapshot = dict(self.last_snapshot)
        snapshot["runtime"] = {
            "ok": False,
            "last_success_at": self.last_success_at,
            "last_error_at": utc_now(),
            "last_error": str(error),
            "error_code": "API_429" if isinstance(error, ProviderRateLimitError) else "COLLECTOR_ERROR",
            "consecutive_failures": failure_streak,
            "retry_in_seconds": wait_seconds,
        }
        return await self.publish_snapshot(snapshot)

    async def run(self):
        print("NOMADTIPS3 Live Engine V2 collector started")
        failure_streak = 0

        while True:
            started = utc_now()
            try:
                raw, rate, status = await self.fetch_live()
                fixtures = [fixture_summary(item) for item in raw]
                condition, condition_meta = await self.current_condition()
                preliminary = filter_preliminary(fixtures, condition)
                candidates = preliminary["candidates"]
                statistics, live_odds, detail_telemetry = await self.enrich_shortlist(
                    candidates, condition
                )
                engine = self.engine.evaluate(
                    candidates,
                    statistics,
                    live_odds,
                    condition,
                    condition_meta,
                )
                self.last_success_at = utc_now()
                failure_streak = 0

                snapshot = {
                    "schema": "nomadtips3.live.v2.fixture-snapshot",
                    "generated_at": self.last_success_at,
                    "request_started_at": started,
                    "source": "api-football single-collector + car3 condition engine",
                    "http_status": status,
                    "live_count": len(fixtures),
                    "preliminary_candidate_count": preliminary["candidate_count"],
                    "statistics_fixture_count": len(statistics),
                    "live_odds_fixture_count": len(live_odds),
                    "request_count_process": self.request_count,
                    "rate_limit": rate,
                    "condition": condition,
                    "condition_meta": condition_meta,
                    "rejected": preliminary["rejected"],
                    "detail_telemetry": detail_telemetry,
                    "fixtures": fixtures,
                    "preliminary_candidates": candidates,
                    "statistics": statistics,
                    "live_odds": live_odds,
                    "engine": engine,
                    "runtime": {
                        "ok": True,
                        "last_success_at": self.last_success_at,
                        "last_error_at": None,
                        "last_error": None,
                        "error_code": None,
                        "consecutive_failures": 0,
                        "retry_in_seconds": 0,
                    },
                }
                atomic_write_json(self.snapshot_path, snapshot)
                self.last_snapshot = snapshot
                publish_result = await self.publish_snapshot(snapshot)

                print(
                    f"[{self.last_success_at}] live={len(fixtures)} "
                    f"candidates={preliminary['candidate_count']} "
                    f"config={condition_meta['source']} "
                    f"detail_calls={detail_telemetry['origin_requests_cycle']} "
                    f"signals={engine['counts']['new_signals']} "
                    f"published={publish_result.get('published', False)} "
                    f"remaining={rate.get('minute_remaining')} "
                    f"limit={rate.get('minute_limit')}"
                )
                wait_seconds = self.live_poll if fixtures else self.idle_poll

            except Exception as error:
                failure_streak += 1
                wait_seconds = self.retry_wait(error, failure_streak)
                await self.publish_failure(error, failure_streak, wait_seconds)
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
