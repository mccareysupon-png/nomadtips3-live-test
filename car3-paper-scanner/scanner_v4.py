import argparse
import asyncio
import aiohttp
import json
import logging
import os
import random
import sqlite3
import sys
import time
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from unittest.mock import AsyncMock, patch


class Config:
    API_KEY = os.getenv("API_FOOTBALL_KEY", "")
    BASE_URL = "https://v3.football.api-sports.io"

    # CAR 3 V4: second-half focused bulk collector.
    SCAN_SECONDS = int(os.getenv("CAR3_SCAN_SECONDS", "600"))
    MIN_MINUTE = int(os.getenv("CAR3_MIN_MINUTE", "60"))
    MAX_MINUTE = int(os.getenv("CAR3_MAX_MINUTE", "90"))

    # API-Football in-play namespace: Fulltime Result.
    LIVE_FULLTIME_RESULT_BET_ID = 59

    MIN_ODDS_1X2 = float(os.getenv("CAR3_MIN_ODDS_1X2", "1.50"))

    # Official fixture statistics fields only.
    RULE_B_MIN_SHOTS_ON_GOAL = int(os.getenv("CAR3_MIN_SOG", "3"))
    RULE_B_MIN_TOTAL_SHOTS = int(os.getenv("CAR3_MIN_SHOTS", "8"))
    RULE_B_MIN_CORNERS = int(os.getenv("CAR3_MIN_CORNERS", "4"))
    RULE_B_MIN_POSSESSION = int(os.getenv("CAR3_MIN_POSSESSION", "55"))

    MAX_REQ_PER_SEC = 6
    MAX_REQ_PER_MIN = 360
    MAX_IDS_PER_BATCH = 20

    DB_PATH = os.getenv("CAR3_DB_PATH", "car3-paper-v4.sqlite3")
    JSONL_PATH = os.getenv("CAR3_JSONL_PATH", "car3-paper-v4.jsonl")


class CircuitBreaker:
    CLOSED, OPEN, HALF_OPEN = 0, 1, 2

    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 30):
        self.state = self.CLOSED
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.last_failure_time = 0.0
        self.probe_in_flight = False
        self.lock = asyncio.Lock()

    async def can_execute(self) -> bool:
        async with self.lock:
            if self.state == self.CLOSED:
                return True
            if self.state == self.OPEN:
                if time.monotonic() - self.last_failure_time >= self.recovery_timeout:
                    self.state = self.HALF_OPEN
                    self.probe_in_flight = True
                    logging.info("Circuit Breaker: HALF_OPEN probe")
                    return True
                return False
            if self.state == self.HALF_OPEN:
                if not self.probe_in_flight:
                    self.probe_in_flight = True
                    return True
                return False
            return False

    async def record_failure(self) -> None:
        async with self.lock:
            self.failures += 1
            self.last_failure_time = time.monotonic()
            if self.state == self.HALF_OPEN or self.failures >= self.failure_threshold:
                self.state = self.OPEN
                self.probe_in_flight = False
                logging.warning("Circuit Breaker: OPEN")

    async def record_success(self) -> None:
        async with self.lock:
            recovered = self.state == self.HALF_OPEN
            self.failures = 0
            self.state = self.CLOSED
            self.probe_in_flight = False
            if recovered:
                logging.info("Circuit Breaker: CLOSED recovered")


class RateGuard:
    def __init__(self):
        self.calls_sec: List[float] = []
        self.calls_min: List[float] = []
        self.lock = asyncio.Lock()
        self.daily_remaining: Optional[int] = None
        self.minute_remaining: Optional[int] = None

    def _prune(self) -> None:
        now = time.monotonic()
        self.calls_sec = [t for t in self.calls_sec if now - t < 1.0]
        self.calls_min = [t for t in self.calls_min if now - t < 60.0]

    async def wait(self) -> None:
        async with self.lock:
            self._prune()
            now = time.monotonic()
            if len(self.calls_sec) >= Config.MAX_REQ_PER_SEC:
                delay = 1.0 - (now - self.calls_sec[0])
                if delay > 0:
                    await asyncio.sleep(delay)
                self._prune()

            now = time.monotonic()
            if len(self.calls_min) >= Config.MAX_REQ_PER_MIN:
                delay = 60.0 - (now - self.calls_min[0])
                if delay > 0:
                    await asyncio.sleep(delay)
                self._prune()

            now = time.monotonic()
            self.calls_sec.append(now)
            self.calls_min.append(now)

    def update_from_headers(self, headers: aiohttp.typedefs.LooseHeaders) -> None:
        daily = headers.get("x-ratelimit-requests-remaining")
        minute = headers.get("X-RateLimit-Remaining")
        try:
            if daily is not None:
                self.daily_remaining = int(daily)
            if minute is not None:
                self.minute_remaining = int(minute)
        except (TypeError, ValueError):
            logging.warning("Invalid rate-limit headers received")


class APIClient:
    RETRYABLE = {429, 499, 500, 502, 503, 504}
    NON_RETRYABLE = {400, 404, 422}

    def __init__(self):
        self.headers = {"x-apisports-key": Config.API_KEY}
        self.guard = RateGuard()
        self.breaker = CircuitBreaker()
        self.session: Optional[aiohttp.ClientSession] = None
        self.cycle_requests = 0
        self.cycle_429 = 0
        self.fatal_error = False

    async def start(self) -> None:
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(headers=self.headers)

    async def close(self) -> None:
        if self.session and not self.session.closed:
            await self.session.close()

    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Optional[List[Dict]]:
        if self.fatal_error:
            return None
        if self.session is None:
            raise RuntimeError("APIClient.start() must be called first")

        url = f"{Config.BASE_URL}{endpoint}"
        backoff = 2.0

        for _ in range(3):
            if not await self.breaker.can_execute():
                return None

            await self.guard.wait()
            self.cycle_requests += 1

            try:
                async with self.session.get(url, params=params, timeout=15) as response:
                    self.guard.update_from_headers(response.headers)

                    if response.status in {401, 403}:
                        self.fatal_error = True
                        logging.error("Fatal API authentication/configuration error: %s", response.status)
                        return None

                    if response.status in self.NON_RETRYABLE:
                        logging.error("HTTP %s on %s params=%s; not retrying", response.status, endpoint, params)
                        return None

                    if response.status == 204:
                        await self.breaker.record_success()
                        return []

                    if response.status == 429:
                        self.cycle_429 += 1
                        await self.breaker.record_failure()
                        retry_after = response.headers.get("Retry-After")
                        try:
                            delay = float(retry_after) if retry_after is not None else backoff
                        except (TypeError, ValueError):
                            delay = backoff
                        await asyncio.sleep(delay + random.uniform(0.1, 0.4))
                        backoff *= 1.5
                        continue

                    if response.status in self.RETRYABLE:
                        await self.breaker.record_failure()
                        await asyncio.sleep(backoff)
                        backoff *= 2.0
                        continue

                    if response.status == 200:
                        data = await response.json()
                        if data.get("errors"):
                            logging.error("API returned errors on %s: %s", endpoint, data.get("errors"))
                            await self.breaker.record_failure()
                            return None
                        await self.breaker.record_success()
                        response_data = data.get("response", [])
                        return response_data if isinstance(response_data, list) else []

                    logging.error("Unhandled HTTP status %s on %s", response.status, endpoint)
                    return None

            except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
                logging.warning("API transport error on %s: %s", endpoint, exc)
                await self.breaker.record_failure()
                await asyncio.sleep(backoff)
                backoff *= 2.0

        return None


class PaperState:
    def __init__(self, db_path: str = Config.DB_PATH):
        self.db = sqlite3.connect(db_path)
        self.cursor = self.db.cursor()
        self.cursor.execute(
            "CREATE TABLE IF NOT EXISTS sent_alerts ("
            "fixture_id INTEGER PRIMARY KEY, target_side TEXT, alert_time TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        self.db.commit()

    def has_alerted(self, fixture_id: int) -> bool:
        self.cursor.execute("SELECT 1 FROM sent_alerts WHERE fixture_id = ?", (fixture_id,))
        return self.cursor.fetchone() is not None

    def mark_alerted(self, fixture_id: int, target_side: str) -> None:
        try:
            self.cursor.execute(
                "INSERT INTO sent_alerts (fixture_id, target_side) VALUES (?, ?)",
                (fixture_id, target_side),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            pass

    def close(self) -> None:
        try:
            self.cursor.close()
        finally:
            self.db.close()


def chunked(items: List[int], size: int) -> Iterable[List[int]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


class V4Logic:
    @staticmethod
    def is_second_half_candidate(odds_item: Dict[str, Any]) -> bool:
        fixture = odds_item.get("fixture", {})
        elapsed = fixture.get("status", {}).get("elapsed")
        live_status = odds_item.get("status", {})

        if not isinstance(elapsed, int):
            return False
        if not (Config.MIN_MINUTE <= elapsed <= Config.MAX_MINUTE):
            return False
        if bool(live_status.get("finished")):
            return False
        if bool(live_status.get("blocked")) or bool(live_status.get("stopped")):
            return False
        return True

    @staticmethod
    def extract_side_odds(odds_item: Dict[str, Any]) -> Dict[str, float]:
        result: Dict[str, float] = {}
        for market in odds_item.get("odds", []):
            if market.get("id") != Config.LIVE_FULLTIME_RESULT_BET_ID:
                continue

            grouped: Dict[str, List[Dict[str, Any]]] = {"Home": [], "Draw": [], "Away": []}
            for value in market.get("values", []):
                side = str(value.get("value", "")).strip()
                if side not in grouped:
                    continue
                if bool(value.get("suspended")):
                    continue
                grouped[side].append(value)

            for side, values in grouped.items():
                if not values:
                    continue
                preferred = next((v for v in values if v.get("main") is True), values[0])
                try:
                    result[side] = float(preferred.get("odd"))
                except (TypeError, ValueError):
                    continue
            break
        return result

    @staticmethod
    def build_targets(odds_item: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not V4Logic.is_second_half_candidate(odds_item):
            return []

        side_odds = V4Logic.extract_side_odds(odds_item)
        teams = odds_item.get("teams", {})
        fixture_id = odds_item.get("fixture", {}).get("id")
        elapsed = odds_item.get("fixture", {}).get("status", {}).get("elapsed")
        if fixture_id is None:
            return []

        targets: List[Dict[str, Any]] = []
        for side, team_key in (("Home", "home"), ("Away", "away")):
            odd = side_odds.get(side)
            team = teams.get(team_key, {})
            team_id = team.get("id")
            if team_id is None or odd is None or odd < Config.MIN_ODDS_1X2:
                continue
            targets.append(
                {
                    "fixture_id": fixture_id,
                    "elapsed": elapsed,
                    "target_side": side,
                    "target_team_id": team_id,
                    "odd": odd,
                }
            )
        return targets

    @staticmethod
    def final_condition(target: Dict[str, Any], fixture_detail: Dict[str, Any]) -> bool:
        target_id = target["target_team_id"]
        stats = fixture_detail.get("statistics", [])
        team_stats = next((row for row in stats if row.get("team", {}).get("id") == target_id), None)
        if not team_stats:
            return False

        metrics = {
            item.get("type"): item.get("value")
            for item in team_stats.get("statistics", [])
            if item.get("type") and item.get("value") is not None
        }
        required = {
            "Shots on Goal": metrics.get("Shots on Goal"),
            "Total Shots": metrics.get("Total Shots"),
            "Corner Kicks": metrics.get("Corner Kicks"),
            "Ball Possession": metrics.get("Ball Possession"),
        }
        if any(value is None for value in required.values()):
            return False

        try:
            possession = int(str(required["Ball Possession"]).replace("%", "").strip())
            return (
                int(required["Shots on Goal"]) >= Config.RULE_B_MIN_SHOTS_ON_GOAL
                and int(required["Total Shots"]) >= Config.RULE_B_MIN_TOTAL_SHOTS
                and int(required["Corner Kicks"]) >= Config.RULE_B_MIN_CORNERS
                and possession >= Config.RULE_B_MIN_POSSESSION
            )
        except (TypeError, ValueError):
            return False


class ScannerV4:
    def __init__(self, db_path: str = Config.DB_PATH, jsonl_path: str = Config.JSONL_PATH):
        self.api = APIClient()
        self.state = PaperState(db_path)
        self.jsonl_path = Path(jsonl_path)
        self.scan_number = 0

    def append_jsonl(self, record: Dict[str, Any]) -> None:
        try:
            with self.jsonl_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except OSError as exc:
            logging.warning("Could not write JSONL telemetry: %s", exc)

    async def start(self) -> None:
        await self.api.start()

    async def close(self) -> None:
        await self.api.close()
        self.state.close()

    async def scan_cycle(self) -> Dict[str, Any]:
        self.scan_number += 1
        self.api.cycle_requests = 0
        self.api.cycle_429 = 0

        # One global discovery call: only the live Fulltime Result market.
        live_odds = await self.api.get(
            "/odds/live",
            params={"bet": Config.LIVE_FULLTIME_RESULT_BET_ID},
        ) or []

        second_half = 0
        targets: List[Dict[str, Any]] = []
        odds_covered_fixtures = set()

        for item in live_odds:
            if V4Logic.is_second_half_candidate(item):
                second_half += 1
            fixture_id = item.get("fixture", {}).get("id")
            if fixture_id is not None:
                odds_covered_fixtures.add(fixture_id)
            for target in V4Logic.build_targets(item):
                if not self.state.has_alerted(target["fixture_id"]):
                    targets.append(target)

        grouped_targets: Dict[int, List[Dict[str, Any]]] = {}
        for target in targets:
            grouped_targets.setdefault(target["fixture_id"], []).append(target)

        details_by_id: Dict[int, Dict[str, Any]] = {}
        detail_batches = 0
        fixture_ids = list(grouped_targets)

        # One call per <=20 candidate fixtures; fixture response embeds statistics.
        for ids_batch in chunked(fixture_ids, Config.MAX_IDS_PER_BATCH):
            if not ids_batch:
                continue
            detail_batches += 1
            details = await self.api.get(
                "/fixtures",
                params={"ids": "-".join(str(x) for x in ids_batch)},
            ) or []
            for detail in details:
                fixture_id = detail.get("fixture", {}).get("id")
                if fixture_id is not None:
                    details_by_id[fixture_id] = detail

        stats_ready = 0
        alerts = 0
        for fixture_id, group in grouped_targets.items():
            detail = details_by_id.get(fixture_id)
            if not detail or not detail.get("statistics"):
                continue
            stats_ready += 1
            for target in group:
                if V4Logic.final_condition(target, detail):
                    logging.info(
                        "PAPER ALERT V4 fixture=%s minute=%s target=%s odd=%.3f",
                        fixture_id,
                        target["elapsed"],
                        target["target_side"],
                        target["odd"],
                    )
                    self.state.mark_alerted(fixture_id, target["target_side"])
                    alerts += 1
                    break

        self.api.guard._prune()
        states = {
            CircuitBreaker.CLOSED: "CLOSED",
            CircuitBreaker.OPEN: "OPEN",
            CircuitBreaker.HALF_OPEN: "HALF_OPEN",
        }
        telemetry = {
            "scan": self.scan_number,
            "live_odds_fixtures": len(odds_covered_fixtures),
            "second_half": second_half,
            "targets": len(targets),
            "candidate_fixtures": len(grouped_targets),
            "detail_batches": detail_batches,
            "stats_ready": stats_ready,
            "alerts": alerts,
            "req_cycle": self.api.cycle_requests,
            "req_min": len(self.api.guard.calls_min),
            "remaining_minute": self.api.guard.minute_remaining,
            "remaining_day": self.api.guard.daily_remaining,
            "429s": self.api.cycle_429,
            "circuit": states[self.api.breaker.state],
        }
        logging.info(
            "TELEMETRY V4 Scan=%s Gap=%ss LiveOdds=%s 2H=%s Targets=%s CandidateFixtures=%s "
            "Batches=%s StatsReady=%s Alerts=%s ReqCycle=%s Req/M=%s Rem/M=%s Rem/D=%s "
            "429s=%s Circuit=%s",
            telemetry["scan"],
            Config.SCAN_SECONDS,
            telemetry["live_odds_fixtures"],
            telemetry["second_half"],
            telemetry["targets"],
            telemetry["candidate_fixtures"],
            telemetry["detail_batches"],
            telemetry["stats_ready"],
            telemetry["alerts"],
            telemetry["req_cycle"],
            telemetry["req_min"],
            telemetry["remaining_minute"],
            telemetry["remaining_day"],
            telemetry["429s"],
            telemetry["circuit"],
        )
        self.append_jsonl({"ts": int(time.time()), **telemetry})
        return telemetry

    async def run(self, once: bool = False) -> None:
        await self.start()
        try:
            logging.info(
                "CAR 3 PAPER V4 started: second-half focus, %ss bulk scan, live bet id=%s",
                Config.SCAN_SECONDS,
                Config.LIVE_FULLTIME_RESULT_BET_ID,
            )
            while not self.api.fatal_error:
                started = time.monotonic()
                await self.scan_cycle()
                if once:
                    return
                elapsed = time.monotonic() - started
                await asyncio.sleep(max(0.0, Config.SCAN_SECONDS - elapsed))
        finally:
            await self.close()


class TestV4Logic(unittest.IsolatedAsyncioTestCase):
    def make_live_item(self, elapsed: int = 70, home_odd: str = "1.8", away_odd: str = "4.0") -> Dict[str, Any]:
        return {
            "fixture": {"id": 123, "status": {"elapsed": elapsed}},
            "teams": {
                "home": {"id": 10, "goals": 1},
                "away": {"id": 20, "goals": 0},
            },
            "status": {"stopped": False, "blocked": False, "finished": False},
            "odds": [
                {
                    "id": 59,
                    "name": "Fulltime Result",
                    "values": [
                        {"value": "Home", "odd": home_odd, "main": None, "suspended": False},
                        {"value": "Draw", "odd": "3.2", "main": None, "suspended": False},
                        {"value": "Away", "odd": away_odd, "main": None, "suspended": False},
                    ],
                }
            ],
        }

    def test_live_schema_fulltime_result(self):
        item = self.make_live_item()
        odds = V4Logic.extract_side_odds(item)
        self.assertEqual(odds["Home"], 1.8)
        self.assertEqual(odds["Away"], 4.0)
        targets = V4Logic.build_targets(item)
        self.assertEqual({x["target_side"] for x in targets}, {"Home", "Away"})

    def test_first_half_is_skipped(self):
        item = self.make_live_item(elapsed=40)
        self.assertFalse(V4Logic.is_second_half_candidate(item))
        self.assertEqual(V4Logic.build_targets(item), [])

    def test_official_rule_b_fields(self):
        target = {
            "fixture_id": 123,
            "target_side": "Home",
            "target_team_id": 10,
            "elapsed": 70,
            "odd": 1.8,
        }
        detail = {
            "fixture": {"id": 123},
            "statistics": [
                {
                    "team": {"id": 10},
                    "statistics": [
                        {"type": "Shots on Goal", "value": 4},
                        {"type": "Total Shots", "value": 10},
                        {"type": "Corner Kicks", "value": 5},
                        {"type": "Ball Possession", "value": "58%"},
                    ],
                }
            ],
        }
        self.assertTrue(V4Logic.final_condition(target, detail))

    @patch.object(APIClient, "get", new_callable=AsyncMock)
    async def test_one_discovery_plus_one_batch_for_many_targets(self, mock_get):
        live = []
        for fixture_id in range(1, 11):
            item = self.make_live_item()
            item["fixture"]["id"] = fixture_id
            item["teams"]["home"]["id"] = 1000 + fixture_id
            item["teams"]["away"]["id"] = 2000 + fixture_id
            live.append(item)

        details = []
        for fixture_id in range(1, 11):
            details.append(
                {
                    "fixture": {"id": fixture_id},
                    "statistics": [
                        {
                            "team": {"id": 1000 + fixture_id},
                            "statistics": [
                                {"type": "Shots on Goal", "value": 1},
                                {"type": "Total Shots", "value": 2},
                                {"type": "Corner Kicks", "value": 1},
                                {"type": "Ball Possession", "value": "40%"},
                            ],
                        }
                    ],
                }
            )

        mock_get.side_effect = [live, details]
        scanner = ScannerV4(db_path=":memory:", jsonl_path=os.devnull)
        try:
            telemetry = await scanner.scan_cycle()
            self.assertEqual(mock_get.call_count, 2)
            self.assertEqual(telemetry["candidate_fixtures"], 10)
            self.assertEqual(telemetry["detail_batches"], 1)
        finally:
            scanner.state.close()


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("car3-paper-v4.log", encoding="utf-8"),
        ],
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CAR 3 PAPER Scanner V4")
    parser.add_argument("--test", action="store_true", help="run unit tests")
    parser.add_argument("--once", action="store_true", help="run one live scan and exit")
    args = parser.parse_args()

    configure_logging()

    if args.test:
        unittest.main(argv=[sys.argv[0]])
    else:
        if not Config.API_KEY:
            logging.error("Missing API_FOOTBALL_KEY environment variable. Scanner not started.")
            sys.exit(2)
        try:
            asyncio.run(ScannerV4().run(once=args.once))
        except KeyboardInterrupt:
            logging.info("CAR 3 PAPER V4 stopped by user")
