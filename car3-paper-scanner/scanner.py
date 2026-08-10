import asyncio
import aiohttp
import logging
import os
import random
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional, Tuple


class Config:
    API_KEY = os.getenv("API_FOOTBALL_KEY", "")
    BASE_URL = "https://v3.football.api-sports.io"
    MAX_REQ_PER_SEC = 6
    MAX_REQ_PER_MIN = 360
    POLL_NORMAL = 25
    POLL_NEAR_CONDITION = 15
    POLL_DEGRADED = 60
    STATS_CACHE_FRESH_TTL = 60
    STATS_CACHE_STALE_TTL = 120
    CONCURRENCY_LIMIT = 5
    TRUSTED_BOOKMAKERS = {1, 8, 11}


class FilterCriteria:
    MIN_MINUTE = 60
    MAX_MINUTE = 80
    MIN_ODDS_1X2 = 1.50
    RULE_A_MIN_DANGEROUS_ATTACKS = 50
    RULE_B_MIN_SHOTS_ON_GOAL = 3
    RULE_B_MIN_TOTAL_SHOTS = 8
    RULE_B_MIN_CORNERS = 4
    RULE_B_MIN_POSSESSION = 55


class CircuitBreaker:
    CLOSED, OPEN, HALF_OPEN = 0, 1, 2

    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 30):
        self.state = self.CLOSED
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failures = 0
        self.last_failure_time = 0.0
        self.lock = asyncio.Lock()
        self.probe_in_flight = False

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
            if self.state == self.HALF_OPEN and not self.probe_in_flight:
                self.probe_in_flight = True
                return True
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
        self.daily_remaining = 75000
        self.minute_remaining = 450

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
            pass


class APIClient:
    RETRYABLE = {429, 499, 500, 502, 503, 504}
    NON_RETRYABLE = {400, 404, 422}

    def __init__(self):
        self.headers = {"x-apisports-key": Config.API_KEY}
        self.guard = RateGuard()
        self.breaker = CircuitBreaker()
        self.session: Optional[aiohttp.ClientSession] = None
        self.fatal_error = False
        self.cycle_requests = 0
        self.cycle_429 = 0

    async def start(self) -> None:
        self.session = aiohttp.ClientSession(headers=self.headers)

    async def close(self) -> None:
        if self.session and not self.session.closed:
            await self.session.close()

    async def get(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Any]:
        if self.fatal_error or self.session is None:
            return None
        backoff = 2.0
        for _ in range(3):
            if not await self.breaker.can_execute():
                return None
            await self.guard.wait()
            self.cycle_requests += 1
            try:
                async with self.session.get(f"{Config.BASE_URL}{endpoint}", params=params, timeout=10) as response:
                    self.guard.update_from_headers(response.headers)
                    if response.status in {401, 403}:
                        self.fatal_error = True
                        logging.error("Fatal API authentication/configuration error: %s", response.status)
                        return None
                    if response.status in self.NON_RETRYABLE:
                        logging.error("HTTP %s on %s", response.status, endpoint)
                        return None
                    if response.status == 204:
                        await self.breaker.record_success()
                        return []
                    if response.status == 429:
                        self.cycle_429 += 1
                        await self.breaker.record_failure()
                        retry_after = response.headers.get("Retry-After")
                        try:
                            delay = float(retry_after) if retry_after else backoff
                        except (TypeError, ValueError):
                            delay = backoff
                        await asyncio.sleep(delay + random.uniform(0.1, 0.5))
                        backoff *= 1.5
                        continue
                    if response.status in self.RETRYABLE:
                        await self.breaker.record_failure()
                        await asyncio.sleep(backoff)
                        backoff *= 2
                        continue
                    if response.status == 200:
                        data = await response.json()
                        if data.get("errors"):
                            logging.error("API returned errors: %s", data.get("errors"))
                            return None
                        await self.breaker.record_success()
                        return data.get("response", [])
                    return None
            except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
                logging.warning("API transport error on %s: %s", endpoint, exc)
                await self.breaker.record_failure()
                await asyncio.sleep(backoff)
                backoff *= 2
        return None


class ScannerState:
    def __init__(self):
        self.stats_cache: Dict[int, Dict[str, Any]] = {}
        self.db = sqlite3.connect(":memory:")
        self.cursor = self.db.cursor()
        self.cycle_cache_hits = 0
        self.seen_market_ids = set()
        self.cursor.execute("CREATE TABLE IF NOT EXISTS sent_alerts (fixture_id INTEGER PRIMARY KEY, alert_time TIMESTAMP)")
        self.db.commit()

    def has_alerted(self, fixture_id: int) -> bool:
        self.cursor.execute("SELECT 1 FROM sent_alerts WHERE fixture_id = ?", (fixture_id,))
        return self.cursor.fetchone() is not None

    def mark_alerted(self, fixture_id: int) -> None:
        try:
            self.cursor.execute("INSERT INTO sent_alerts VALUES (?, datetime('now'))", (fixture_id,))
            self.db.commit()
        except sqlite3.IntegrityError:
            pass

    def check_stats_cache(self, fixture_id: int) -> Tuple[Optional[List], str]:
        item = self.stats_cache.get(fixture_id)
        if item is None:
            return None, "NONE"
        age = time.monotonic() - item["time"]
        if age < Config.STATS_CACHE_FRESH_TTL:
            self.cycle_cache_hits += 1
            return item["data"], "FRESH"
        if age < Config.STATS_CACHE_STALE_TTL:
            return item["data"], "STALE"
        return None, "EXPIRED"

    def update_cache(self, fixture_id: int, data: List) -> None:
        if data:
            self.stats_cache[fixture_id] = {"time": time.monotonic(), "data": data}

    def close(self) -> None:
        self.cursor.close()
        self.db.close()


class PipelineFilters:
    @staticmethod
    def identify_targets(fixture: Dict) -> List[Dict]:
        status = fixture.get("fixture", {}).get("status", {}).get("short")
        elapsed = fixture.get("fixture", {}).get("status", {}).get("elapsed")
        if status != "2H" or not isinstance(elapsed, int) or not (FilterCriteria.MIN_MINUTE <= elapsed <= FilterCriteria.MAX_MINUTE):
            return []
        teams = fixture.get("teams", {})
        try:
            return [
                {"fixture": fixture, "target_side": "Home", "target_team_id": teams["home"]["id"]},
                {"fixture": fixture, "target_side": "Away", "target_team_id": teams["away"]["id"]},
            ]
        except (KeyError, TypeError):
            return []

    @staticmethod
    def _market_side_map(values: List[Dict]) -> Dict[str, str]:
        labels = {str(v.get("value", "")).strip().lower() for v in values}
        if {"home", "draw", "away"}.issubset(labels):
            return {"Home": "home", "Away": "away"}
        if {"1", "x", "2"}.issubset(labels):
            return {"Home": "1", "Away": "2"}
        return {}

    @staticmethod
    def odds_filter(candidate: Dict, odds_map: Dict, state: ScannerState) -> bool:
        fixture_id = candidate["fixture"]["fixture"]["id"]
        odds_data = odds_map.get(fixture_id)
        if not odds_data:
            return False
        bookmakers = odds_data.get("bookmakers", [])
        preferred = [b for b in bookmakers if b.get("id") in Config.TRUSTED_BOOKMAKERS]
        groups = [preferred, bookmakers] if preferred else [bookmakers]
        for group in groups:
            found_1x2 = False
            for bookmaker in group:
                for bet in bookmaker.get("bets", []):
                    values = bet.get("values", [])
                    side_map = PipelineFilters._market_side_map(values)
                    if not side_map:
                        continue
                    found_1x2 = True
                    bet_id = bet.get("id")
                    if bet_id not in state.seen_market_ids:
                        state.seen_market_ids.add(bet_id)
                        logging.info("AUTO 1X2 market detected: bet_id=%s name=%s", bet_id, bet.get("name", "unknown"))
                    wanted = side_map[candidate["target_side"]]
                    for value in values:
                        if str(value.get("value", "")).strip().lower() == wanted:
                            try:
                                return float(value.get("odd")) >= FilterCriteria.MIN_ODDS_1X2
                            except (TypeError, ValueError):
                                return False
            if group is preferred and found_1x2:
                return False
        return False

    @staticmethod
    def final_condition(candidate: Dict, stats: List[Dict]) -> bool:
        target_id = candidate["target_team_id"]
        row = next((x for x in stats if x.get("team", {}).get("id") == target_id), None)
        if not row:
            return False
        metrics = {x.get("type"): x.get("value") for x in row.get("statistics", []) if x.get("type") and x.get("value") is not None}
        dangerous = metrics.get("Dangerous Attacks")
        if dangerous is not None:
            try:
                return int(dangerous) >= FilterCriteria.RULE_A_MIN_DANGEROUS_ATTACKS
            except (TypeError, ValueError):
                return False
        required = {
            "Shots on Goal": metrics.get("Shots on Goal"),
            "Total Shots": metrics.get("Total Shots"),
            "Corner Kicks": metrics.get("Corner Kicks"),
            "Ball Possession": metrics.get("Ball Possession"),
        }
        if any(v is None for v in required.values()):
            return False
        try:
            possession = int(str(required["Ball Possession"]).replace("%", ""))
            return (
                int(required["Shots on Goal"]) >= FilterCriteria.RULE_B_MIN_SHOTS_ON_GOAL
                and int(required["Total Shots"]) >= FilterCriteria.RULE_B_MIN_TOTAL_SHOTS
                and int(required["Corner Kicks"]) >= FilterCriteria.RULE_B_MIN_CORNERS
                and possession >= FilterCriteria.RULE_B_MIN_POSSESSION
            )
        except (TypeError, ValueError):
            return False


class ScannerEngine:
    def __init__(self):
        self.api = APIClient()
        self.state = ScannerState()
        self.semaphore = asyncio.Semaphore(Config.CONCURRENCY_LIMIT)
        self.polling_interval = Config.POLL_NORMAL

    def adjust_polling_interval(self, candidate_count: int) -> None:
        if self.api.guard.minute_remaining < 50 or self.api.guard.daily_remaining < 500 or self.api.breaker.state == CircuitBreaker.OPEN or self.api.cycle_429 > 0:
            self.polling_interval = Config.POLL_DEGRADED
        elif candidate_count > 0:
            self.polling_interval = Config.POLL_NEAR_CONDITION
        else:
            self.polling_interval = Config.POLL_NORMAL

    async def run(self) -> None:
        await self.api.start()
        logging.info("Live 1X2 market mode: AUTO-DETECT from Home/Draw/Away values")
        try:
            while not self.api.fatal_error:
                started = time.monotonic()
                self.api.cycle_requests = 0
                self.api.cycle_429 = 0
                self.state.cycle_cache_hits = 0
                await self.scan_cycle()
                await asyncio.sleep(max(0.0, self.polling_interval - (time.monotonic() - started)))
        finally:
            await self.api.close()
            self.state.close()

    async def scan_cycle(self) -> None:
        stats_calls = 0
        live_fixtures = await self.api.get("/fixtures?live=all")
        if not live_fixtures:
            self.adjust_polling_interval(0)
            self.print_telemetry(0, 0, 0, 0)
            return
        candidates: List[Dict] = []
        for fixture in live_fixtures:
            fixture_id = fixture.get("fixture", {}).get("id")
            if fixture_id is None or self.state.has_alerted(fixture_id):
                continue
            candidates.extend(PipelineFilters.identify_targets(fixture))
        if not candidates:
            self.adjust_polling_interval(0)
            self.print_telemetry(len(live_fixtures), 0, 0, 0)
            return
        live_odds = await self.api.get("/odds/live")
        odds_map = {x.get("fixture", {}).get("id"): x for x in (live_odds or []) if x.get("fixture", {}).get("id") is not None}
        odds_passed = [c for c in candidates if PipelineFilters.odds_filter(c, odds_map, self.state)]
        self.adjust_polling_interval(len(odds_passed))
        if not odds_passed:
            self.print_telemetry(len(live_fixtures), len(candidates), 0, 0)
            return
        grouped: Dict[int, List[Dict]] = {}
        for candidate in odds_passed:
            grouped.setdefault(candidate["fixture"]["fixture"]["id"], []).append(candidate)

        async def fetch_and_evaluate(fixture_id: int, group: List[Dict]) -> None:
            nonlocal stats_calls
            cached, status = self.state.check_stats_cache(fixture_id)
            stats_to_use: Optional[List] = None
            if status == "FRESH":
                stats_to_use = cached
            else:
                async with self.semaphore:
                    fresh = await self.api.get("/fixtures/statistics", params={"fixture": fixture_id})
                    stats_calls += 1
                if fresh:
                    self.state.update_cache(fixture_id, fresh)
                    stats_to_use = fresh
                elif status == "STALE":
                    stats_to_use = cached
            if not stats_to_use:
                return
            for candidate in group:
                if PipelineFilters.final_condition(candidate, stats_to_use):
                    logging.info("PAPER ALERT fixture=%s target=%s", fixture_id, candidate["target_side"])
                    self.state.mark_alerted(fixture_id)
                    break

        await asyncio.gather(*(fetch_and_evaluate(fid, group) for fid, group in grouped.items()))
        self.print_telemetry(len(live_fixtures), len(candidates), len(odds_passed), stats_calls)

    def print_telemetry(self, live: int, candidates: int, odds_passed: int, stats_calls: int) -> None:
        self.api.guard._prune()
        states = {CircuitBreaker.CLOSED: "CLOSED", CircuitBreaker.OPEN: "OPEN", CircuitBreaker.HALF_OPEN: "HALF_OPEN"}
        logging.info(
            "TELEMETRY Gap=%ss Live=%s T1_Cand=%s T1.5_Odds=%s Stats_Calls=%s CacheHits=%s Req_Cycle=%s Req/S=%s Req/M=%s Rem/M=%s Rem/D=%s 429s=%s Circuit=%s",
            self.polling_interval, live, candidates, odds_passed, stats_calls, self.state.cycle_cache_hits,
            self.api.cycle_requests, len(self.api.guard.calls_sec), len(self.api.guard.calls_min),
            self.api.guard.minute_remaining, self.api.guard.daily_remaining, self.api.cycle_429, states[self.api.breaker.state]
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    if not Config.API_KEY:
        logging.error("Missing API_FOOTBALL_KEY environment variable. Scanner not started.")
        sys.exit(2)
    try:
        asyncio.run(ScannerEngine().run())
    except KeyboardInterrupt:
        logging.info("PAPER scanner stopped by user")
