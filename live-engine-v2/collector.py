import asyncio
import json
import os
import tempfile
import time
from datetime import datetime, timezone\nfrom pathlib import Path\n\nimport httpx\nfrom dotenv import load_dotenv\n\nfrom candidate_filter import filter_preliminary, load_condition_config, normalize_config
from condition_engine import ConditionEngine
from detail_fetcher import DetailFetcher
from detail_normalizer import compact_fixture_details, compact_live_odds
from engine_store import EngineStore
from provider_errors import ProviderRateLimitError
from remote_config import RemoteConfigClient
from settlement import settlement_for_signal
from state_publisher import StatePublisher
\nAPI_BASE = "https://v3.football.api-sports.io"\nLIVE_PATH = "/fixtures?live=all"\n\n\ndef utc_now():\n    return datetime.now(timezone.utc).isoformat()\n\n\ndef env_int(name, default, minimum=1):\n    try:\n        value = int(os.getenv(name, str(default)))\n    except ValueError:\n        value = default\n    return max(minimum, value)\n\n\ndef env_bool(name, default=False):\n    raw = str(os.getenv(name, str(default))).strip().lower()\n    return raw in {"1", "true", "yes", "on"}\n\n\ndef atomic_write_json(path, payload):\n    target = Path(path)\n    target.parent.mkdir(parents=True, exist_ok=True)\n    with tempfile.NamedTemporaryFile(\n        "w", encoding="utf-8", delete=False, dir=str(target.parent), suffix=".tmp"\n    ) as handle:\n        json.dump(payload, handle, ensure_ascii=False, indent=2)\n        handle.write("\n")\n        temp_path = Path(handle.name)\n    temp_path.replace(target)\n\n\ndef rate_headers(response):\n    names = {\n        "minute_limit": ["x-ratelimit-requests-limit", "x-ratelimit-limit"],\n        "minute_remaining": ["x-ratelimit-requests-remaining", "x-ratelimit-remaining"],\n    }\n    result = {}\n    for field, candidates in names.items():\n        value = None\n        for name in candidates:\n            raw = response.headers.get(name)\n            if raw is None:\n                continue\n            try:\n                value = int(raw)\n            except ValueError:\n                value = raw\n            break\n        result[field] = value\n    result["retry_after"] = response.headers.get("retry-after")\n    return result\n\n\ndef fixture_summary(item):\n    fixture = item.get("fixture") or {}\n    status = fixture.get("status") or {}\n    teams = item.get("teams") or {}\n    goals = item.get("goals") or {}\n    league = item.get("league") or {}\n    return {\n        "fixture_id": fixture.get("id"),\n        "status": status.get("short"),\n        "minute": status.get("elapsed"),\n        "seconds": status.get("seconds"),\n        "kickoff": fixture.get("date"),\n        "league_id": league.get("id"),\n        "league": league.get("name"),\n        "country": league.get("country"),\n        "home_id": (teams.get("home") or {}).get("id"),\n        "home": (teams.get("home") or {}).get("name"),\n        "away_id": (teams.get("away") or {}).get("id"),\n        "away": (teams.get("away") or {}).get("name"),\n        "home_score": goals.get("home"),\n        "away_score": goals.get("away"),\n    }\n\n\nclass Collector:\n    def __init__(self):\n        load_dotenv()\n        self.api_key = os.getenv("API_FOOTBALL_KEY", "").strip()\n        if not self.api_key:\n            raise RuntimeError("API_FOOTBALL_KEY is missing from runtime environment")\n\n        self.live_poll = env_int("LIVE_POLL_SECONDS", 15, 5)\n        self.idle_poll = env_int("IDLE_POLL_SECONDS", 60, 15)\n        self.timeout = env_int("REQUEST_TIMEOUT_SECONDS", 15, 5)\n        self.snapshot_path = os.getenv("SNAPSHOT_PATH", "snapshot.json")\n        self.condition_config_path = os.getenv("CONDITION_CONFIG_PATH", "condition.json")
        self.database_path = os.getenv("ENGINE_DB_PATH", "state/car3-engine.sqlite3")
        self.signal_inbox_dir = os.getenv(
            "SIGNAL_INBOX_DIR", "../car3-bot/signals/inbox"
        )
        self.request_count = 0
        self.last_success_at = None
        self.last_snapshot = None
        self.settlement_poll_seconds = env_int("SETTLEMENT_POLL_SECONDS", 300, 60)
        self.settlement_min_age_seconds = env_int("SETTLEMENT_MIN_AGE_SECONDS", 120, 60)
        self.last_settlement_poll = 0.0
\n        self.client = httpx.AsyncClient(\n            base_url=API_BASE,\n            headers={\n                "x-apisports-key": self.api_key,\n                "Accept": "application/json",\n                "User-Agent": "nomadtips3-live-engine-v2/0.5",\n            },\n            timeout=self.timeout,\n        )\n        self.detail_fetcher = DetailFetcher(self.client, self._count_request)
        self.store = EngineStore(self.database_path)
        self.engine = ConditionEngine(self.store, self.signal_inbox_dir)
\n        publish_enabled = env_bool("V2_PUBLISH_ENABLED", False)\n        publish_url = os.getenv("V2_INGEST_URL", "") if publish_enabled else ""\n        shared_secret = os.getenv("V2_INGEST_SECRET", "")
        auth_mode = os.getenv("V2_AUTH_MODE", "bearer")
        signing_key = os.getenv("V2_SIGNING_PRIVATE_KEY_B64", "")
        publish_secret = shared_secret if publish_enabled else ""\n        self.publisher = StatePublisher(\n            publish_url,\n            publish_secret,
            auth_mode=auth_mode,
            signing_private_key_b64=signing_key,
            collector_id=os.getenv("COLLECTOR_ID", "vps-primary"),
            heartbeat_seconds=env_int("PUBLISH_HEARTBEAT_SECONDS", 60, 15),\n        )\n\n        remote_enabled = env_bool("V2_REMOTE_CONFIG_ENABLED", False)\n        remote_url = os.getenv("V2_CONFIG_URL", "") if remote_enabled else ""\n        remote_secret = shared_secret if remote_enabled else ""\n        self.remote_config = RemoteConfigClient(\n            remote_url,\n            remote_secret,
            auth_mode=auth_mode,
            signing_private_key_b64=signing_key,
            refresh_seconds=env_int("V2_CONFIG_REFRESH_SECONDS", 15, 5),
        )\n\n    def _count_request(self):\n        self.request_count += 1\n\n    async def close(self):\n        await self.client.aclose()\n        await self.publisher.close()
        await self.remote_config.close()
        self.store.close()
\n    async def fetch_live(self):\n        response = await self.client.get(LIVE_PATH)\n        self._count_request()\n        meta = rate_headers(response)\n\n        if response.status_code == 204:\n            return [], meta, 204\n\n        if response.status_code == 429:
            retry_after = meta.get("retry_after")
            raise ProviderRateLimitError(retry_after)
\n        response.raise_for_status()\n        payload = response.json()\n        errors = payload.get("errors")\n        if errors and errors != [] and errors != {}:\n            raise RuntimeError(f"API returned errors: {errors}")\n        return payload.get("response") or [], meta, response.status_code\n\n    async def current_condition(self):\n        local = load_condition_config(self.condition_config_path)\n        remote = await self.remote_config.get()\n        if remote and isinstance(remote.get("config"), dict):\n            return normalize_config(remote["config"]), {\n                "source": "D1_OWNER_CONFIG",\n                "version": int(remote.get("version") or 0),\n                "remote_error": self.remote_config.last_error,\n            }\n        return local, {\n            "source": "LOCAL_FALLBACK",\n            "version": 0,\n            "remote_error": self.remote_config.last_error,\n        }\n\n    async def enrich_shortlist(self, candidates, condition):\n        compact_stats = {}\n        compact_odds = {}\n        telemetry = {\n            "statistics_enabled": bool(condition.get("statistics_enabled")),\n            "live_odds_enabled": bool(condition.get("live_odds_enabled")),\n            "statistics_batch_count": 0,\n            "statistics_cache_hits": 0,\n            "live_odds_cache_hit": False,\n            "origin_requests_cycle": 0,\n        }\n\n        if not candidates:\n            return compact_stats, compact_odds, telemetry\n\n        before = self.detail_fetcher.origin_requests\n\n        if condition.get("statistics_enabled"):\n            result = await self.detail_fetcher.fixture_details(\n                candidates,\n                ttl_seconds=condition.get("statistics_ttl_seconds", 60),\n            )\n            compact_stats = compact_fixture_details(result["by_fixture"])\n            telemetry["statistics_batch_count"] = result["batch_count"]\n            telemetry["statistics_cache_hits"] = result["cache_hits"]\n\n        if condition.get("live_odds_enabled"):\n            result = await self.detail_fetcher.live_odds(\n                candidates,\n                ttl_seconds=condition.get("live_odds_ttl_seconds", 10),\n            )\n            compact_odds = compact_live_odds(result["by_fixture"])\n            telemetry["live_odds_cache_hit"] = result["cache_hit"]\n\n        telemetry["origin_requests_cycle"] = self.detail_fetcher.origin_requests - before\n        return compact_stats, compact_odds, telemetry\n\n    async def publish_snapshot(self, snapshot):
        try:\n            return await self.publisher.publish(snapshot)\n        except Exception as error:\n            return {\n                "published": False,\n                "reason": "PUBLISH_ERROR",\n                "error": str(error),\n            }

    async def settle_pending_signals(self):
        now_monotonic = time.monotonic()
        if now_monotonic - self.last_settlement_poll < self.settlement_poll_seconds:
            return {"due": False, "pending": None, "checked": 0, "settled": 0}

        self.last_settlement_poll = now_monotonic
        now_ms = int(time.time() * 1000)
        pending = self.store.pending_signals(
            now_ms,
            min_age_ms=self.settlement_min_age_seconds * 1000,
            retry_after_ms=self.settlement_poll_seconds * 1000,
            limit=200,
        )
        if not pending:
            return {"due": True, "pending": 0, "checked": 0, "settled": 0}

        fixture_refs = [
            {"fixture_id": signal.get("fixture_id")}
            for signal in pending
        ]
        try:
            result = await self.detail_fetcher.fixture_details(
                fixture_refs,
                ttl_seconds=self.settlement_poll_seconds,
            )
        except ProviderRateLimitError:
            raise
        except Exception as error:
            return {
                "due": True,
                "pending": len(pending),
                "checked": 0,
                "settled": 0,
                "error": str(error)[:300],
            }
        details = result["by_fixture"]
        checked = 0
        settled_count = 0
        for signal in pending:
            key = signal.pop("_signal_key", signal.get("signal_key"))
            try:
                fixture_id = int(signal.get("fixture_id"))
            except (TypeError, ValueError):
                self.store.mark_signal_checked(key, now_ms)
                checked += 1
                continue
            fixture = details.get(fixture_id)
            self.store.mark_signal_checked(key, now_ms)
            checked += 1
            if not fixture:
                continue
            settled = settlement_for_signal(signal, fixture, now_ms)
            if settled and self.store.settle_signal(key, settled, now_ms):
                settled_count += 1

        return {
            "due": True,
            "pending": len(pending),
            "checked": checked,
            "settled": settled_count,
            "fixture_batches": result["batch_count"],
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
\n    async def run(self):\n        print("NOMADTIPS3 Live Engine V2 collector started")\n        failure_streak = 0\n\n        while True:\n            started = utc_now()\n            try:\n                raw, rate, status = await self.fetch_live()\n                fixtures = [fixture_summary(item) for item in raw]\n                condition, condition_meta = await self.current_condition()\n                preliminary = filter_preliminary(fixtures, condition)\n                candidates = preliminary["candidates"]\n                statistics, live_odds, detail_telemetry = await self.enrich_shortlist(
                    candidates, condition
                )
                engine = self.engine.evaluate(
                    candidates,
                    statistics,
                    live_odds,
                    condition,
                    condition_meta,
                )
                settlement_telemetry = await self.settle_pending_signals()
                engine["recent_signals"] = self.store.recent_signals(200)
                self.last_success_at = utc_now()
                failure_streak = 0
\n                snapshot = {\n                    "schema": "nomadtips3.live.v2.fixture-snapshot",\n                    "generated_at": self.last_success_at,\n                    "request_started_at": started,\n                    "source": "api-football single-collector + car3 condition engine",
                    "http_status": status,\n                    "live_count": len(fixtures),\n                    "preliminary_candidate_count": preliminary["candidate_count"],\n                    "statistics_fixture_count": len(statistics),\n                    "live_odds_fixture_count": len(live_odds),\n                    "request_count_process": self.request_count,\n                    "rate_limit": rate,\n                    "condition": condition,\n                    "condition_meta": condition_meta,\n                    "rejected": preliminary["rejected"],\n                    "detail_telemetry": detail_telemetry,
                    "settlement_telemetry": settlement_telemetry,
                    "fixtures": fixtures,\n                    "preliminary_candidates": candidates,\n                    "statistics": statistics,\n                    "live_odds": live_odds,
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
\n                print(\n                    f"[{self.last_success_at}] live={len(fixtures)} "\n                    f"candidates={preliminary['candidate_count']} "\n                    f"config={condition_meta['source']} "\n                    f"detail_calls={detail_telemetry['origin_requests_cycle']} "
                    f"signals={engine['counts']['new_signals']} "
                    f"published={publish_result.get('published', False)} "
                    f"remaining={rate.get('minute_remaining')} "\n                    f"limit={rate.get('minute_limit')}"\n                )\n                wait_seconds = self.live_poll if fixtures else self.idle_poll\n\n            except Exception as error:
                failure_streak += 1
                wait_seconds = self.retry_wait(error, failure_streak)
                await self.publish_failure(error, failure_streak, wait_seconds)
                print(f"[{utc_now()}] collector error: {error}; retry in {wait_seconds}s")
\n            await asyncio.sleep(wait_seconds)\n\n\nasync def main():\n    collector = Collector()\n    try:\n        await collector.run()\n    finally:\n        await collector.close()\n\n\nif __name__ == "__main__":\n    asyncio.run(main())\n