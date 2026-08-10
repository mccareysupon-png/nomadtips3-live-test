import argparse
import asyncio
import aiohttp
import json
import logging
import os
import sqlite3
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


@dataclass(frozen=True)
class Config:
    api_key: str = os.getenv("API_FOOTBALL_KEY", "")
    base_url: str = "https://v3.football.api-sports.io"

    scan_seconds: int = int(os.getenv("CAR3_SCAN_SECONDS", "600"))
    min_minute: int = int(os.getenv("CAR3_MIN_MINUTE", "50"))
    max_minute: int = int(os.getenv("CAR3_MAX_MINUTE", "95"))

    # API-Football in-play namespace: Fulltime Result.
    live_bet_id: int = int(os.getenv("CAR3_LIVE_BET_ID", "59"))
    min_odds: float = float(os.getenv("CAR3_MIN_ODDS", "1.50"))
    require_odds: bool = os.getenv("CAR3_REQUIRE_ODDS", "1") != "0"

    min_sog: int = int(os.getenv("CAR3_MIN_SOG", "3"))
    min_total_shots: int = int(os.getenv("CAR3_MIN_TOTAL_SHOTS", "8"))
    min_corners: int = int(os.getenv("CAR3_MIN_CORNERS", "4"))
    min_possession: int = int(os.getenv("CAR3_MIN_POSSESSION", "55"))

    # Intentionally below Ultra ceilings to avoid bursts.
    max_req_per_sec: int = int(os.getenv("CAR3_MAX_REQ_SEC", "4"))
    max_req_per_min: int = int(os.getenv("CAR3_MAX_REQ_MIN", "240"))
    max_ids_per_batch: int = 20

    db_path: str = os.getenv("CAR3_DB_PATH", "car3-v5.sqlite3")
    lock_path: str = os.getenv("CAR3_LOCK_PATH", "car3-v5.lock")


class RateGuard:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.sec: List[float] = []
        self.minute: List[float] = []
        self.lock = asyncio.Lock()
        self.remaining_day: Optional[int] = None
        self.remaining_minute: Optional[int] = None

    def _prune(self) -> None:
        now = time.monotonic()
        self.sec = [t for t in self.sec if now - t < 1.0]
        self.minute = [t for t in self.minute if now - t < 60.0]

    async def wait(self) -> None:
        async with self.lock:
            while True:
                self._prune()
                now = time.monotonic()
                wait_for = 0.0
                if len(self.sec) >= self.cfg.max_req_per_sec:
                    wait_for = max(wait_for, 1.0 - (now - self.sec[0]))
                if len(self.minute) >= self.cfg.max_req_per_min:
                    wait_for = max(wait_for, 60.0 - (now - self.minute[0]))
                if wait_for <= 0:
                    stamp = time.monotonic()
                    self.sec.append(stamp)
                    self.minute.append(stamp)
                    return
                await asyncio.sleep(wait_for + 0.02)

    def update_headers(self, headers: aiohttp.typedefs.LooseHeaders) -> None:
        def parse(name: str) -> Optional[int]:
            value = headers.get(name)
            try:
                return int(value) if value is not None else None
            except (TypeError, ValueError):
                return None

        day = parse("x-ratelimit-requests-remaining")
        minute = parse("X-RateLimit-Remaining")
        if day is not None:
            self.remaining_day = day
        if minute is not None:
            self.remaining_minute = minute


class APIClient:
    RETRYABLE = {429, 499, 500, 502, 503, 504}

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.guard = RateGuard(cfg)
        self.session: Optional[aiohttp.ClientSession] = None
        self.cycle_requests = 0
        self.cycle_429 = 0

    async def __aenter__(self) -> "APIClient":
        self.session = aiohttp.ClientSession(headers={"x-apisports-key": self.cfg.api_key})
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self.session and not self.session.closed:
            await self.session.close()

    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        if not self.session:
            raise RuntimeError("API client not started")

        url = f"{self.cfg.base_url}{endpoint}"
        backoff = 2.0

        for attempt in range(2):
            await self.guard.wait()
            self.cycle_requests += 1
            try:
                async with self.session.get(url, params=params, timeout=15) as response:
                    self.guard.update_headers(response.headers)

                    if response.status == 204:
                        return []

                    if response.status in {401, 403}:
                        raise RuntimeError(f"API authentication/configuration error: HTTP {response.status}")

                    if response.status in {400, 404, 422}:
                        logging.error("Non-retryable HTTP %s for %s params=%s", response.status, endpoint, params)
                        return []

                    if response.status == 429:
                        self.cycle_429 += 1
                        retry_after = response.headers.get("Retry-After")
                        try:
                            delay = float(retry_after) if retry_after else 60.0
                        except (TypeError, ValueError):
                            delay = 60.0
                        logging.warning("429 received; pausing %.1fs", delay)
                        await asyncio.sleep(max(1.0, delay))
                        continue

                    if response.status in self.RETRYABLE:
                        if attempt == 0:
                            await asyncio.sleep(backoff)
                            continue
                        logging.error("HTTP %s after retry for %s", response.status, endpoint)
                        return []

                    if response.status != 200:
                        logging.error("Unhandled HTTP %s for %s", response.status, endpoint)
                        return []

                    payload = await response.json()
                    errors = payload.get("errors")
                    if errors:
                        logging.error("API errors for %s: %s", endpoint, errors)
                        return []
                    data = payload.get("response")
                    return data if isinstance(data, list) else []
            except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
                if attempt == 0:
                    logging.warning("Transport error for %s: %s; retrying once", endpoint, exc)
                    await asyncio.sleep(backoff)
                    continue
                logging.error("Transport error after retry for %s: %s", endpoint, exc)
                return []
        return []


class SingleInstanceLock:
    def __init__(self, path: str, stale_seconds: int = 1800):
        self.path = Path(path)
        self.stale_seconds = stale_seconds
        self.acquired = False

    def acquire(self) -> None:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                created = float(data.get("created", 0))
            except Exception:
                created = 0
            if created and time.time() - created < self.stale_seconds:
                raise RuntimeError(f"Another CAR3 V5 worker appears active: {self.path}")
            try:
                self.path.unlink()
            except OSError:
                pass

        fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"pid": os.getpid(), "created": time.time()}, handle)
        self.acquired = True

    def release(self) -> None:
        if self.acquired:
            try:
                self.path.unlink(missing_ok=True)
            finally:
                self.acquired = False


class Store:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                captured_at INTEGER NOT NULL,
                fixture_id INTEGER NOT NULL,
                minute INTEGER,
                home_id INTEGER,
                away_id INTEGER,
                home_goals INTEGER,
                away_goals INTEGER,
                home_odd REAL,
                draw_odd REAL,
                away_odd REAL,
                home_stats TEXT,
                away_stats TEXT,
                state TEXT NOT NULL
            )"""
        )
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS alerts (
                fixture_id INTEGER NOT NULL,
                target_side TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (fixture_id, target_side)
            )"""
        )
        self.db.commit()

    def alerted(self, fixture_id: int, side: str) -> bool:
        row = self.db.execute(
            "SELECT 1 FROM alerts WHERE fixture_id=? AND target_side=?",
            (fixture_id, side),
        ).fetchone()
        return row is not None

    def save_snapshot(self, row: Dict[str, Any]) -> None:
        self.db.execute(
            """INSERT INTO snapshots (
                captured_at, fixture_id, minute, home_id, away_id,
                home_goals, away_goals, home_odd, draw_odd, away_odd,
                home_stats, away_stats, state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                int(time.time()),
                row["fixture_id"],
                row.get("minute"),
                row.get("home_id"),
                row.get("away_id"),
                row.get("home_goals"),
                row.get("away_goals"),
                row.get("home_odd"),
                row.get("draw_odd"),
                row.get("away_odd"),
                json.dumps(row.get("home_stats"), ensure_ascii=False),
                json.dumps(row.get("away_stats"), ensure_ascii=False),
                row.get("state", "SEEN"),
            ),
        )
        self.db.commit()

    def save_alert(self, fixture_id: int, side: str, payload: Dict[str, Any]) -> None:
        try:
            self.db.execute(
                "INSERT INTO alerts (fixture_id, target_side, created_at, payload) VALUES (?, ?, ?, ?)",
                (fixture_id, side, int(time.time()), json.dumps(payload, ensure_ascii=False)),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            pass

    def close(self) -> None:
        self.db.close()


def chunks(items: List[int], size: int) -> Iterable[List[int]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def fixture_id(item: Dict[str, Any]) -> Optional[int]:
    return item.get("fixture", {}).get("id")


def second_half_candidates(fixtures: List[Dict[str, Any]], cfg: Config) -> List[Dict[str, Any]]:
    result = []
    for item in fixtures:
        status = item.get("fixture", {}).get("status", {})
        short = status.get("short")
        elapsed = status.get("elapsed")
        if short != "2H":
            continue
        if not isinstance(elapsed, int):
            continue
        if cfg.min_minute <= elapsed <= cfg.max_minute:
            result.append(item)
    return result


def parse_live_odds(items: List[Dict[str, Any]], bet_id: int) -> Dict[int, Dict[str, float]]:
    result: Dict[int, Dict[str, float]] = {}
    for item in items:
        fid = fixture_id(item)
        if fid is None:
            continue

        flags = item.get("status", {})
        if flags.get("stopped") or flags.get("blocked") or flags.get("finished"):
            continue

        market = next((m for m in item.get("odds", []) if m.get("id") == bet_id), None)
        if not market:
            continue

        by_side: Dict[str, float] = {}
        grouped: Dict[str, List[Dict[str, Any]]] = {"Home": [], "Draw": [], "Away": []}
        for value in market.get("values", []):
            side = value.get("value")
            if side not in grouped or value.get("suspended"):
                continue
            grouped[side].append(value)

        for side, values in grouped.items():
            if not values:
                continue
            preferred = next((value for value in values if value.get("main") is True), values[0])
            try:
                by_side[side] = float(preferred.get("odd"))
            except (TypeError, ValueError):
                pass

        if by_side:
            result[fid] = by_side
    return result


STAT_NAMES = ("Shots on Goal", "Total Shots", "Corner Kicks", "Ball Possession")


def normalize_stats(detail: Dict[str, Any]) -> Dict[int, Dict[str, Any]]:
    result: Dict[int, Dict[str, Any]] = {}
    for team_block in detail.get("statistics", []) or []:
        team_id = team_block.get("team", {}).get("id")
        if team_id is None:
            continue
        metrics = {}
        for entry in team_block.get("statistics", []) or []:
            name = entry.get("type")
            if name in STAT_NAMES:
                metrics[name] = entry.get("value")
        result[team_id] = metrics
    return result


def int_stat(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(str(value).replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def stats_pass(metrics: Dict[str, Any], cfg: Config) -> bool:
    sog = int_stat(metrics.get("Shots on Goal"))
    shots = int_stat(metrics.get("Total Shots"))
    corners = int_stat(metrics.get("Corner Kicks"))
    possession = int_stat(metrics.get("Ball Possession"))
    if None in {sog, shots, corners, possession}:
        return False
    return (
        sog >= cfg.min_sog
        and shots >= cfg.min_total_shots
        and corners >= cfg.min_corners
        and possession >= cfg.min_possession
    )


class Scanner:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.store = Store(cfg.db_path)
        self.scan_no = 0

    async def cycle(self, api: APIClient) -> Dict[str, Any]:
        started = time.monotonic()
        self.scan_no += 1
        api.cycle_requests = 0
        api.cycle_429 = 0

        # Phase 1: one global discovery call.
        live = await api.get("/fixtures", {"live": "all"})
        second = second_half_candidates(live, self.cfg)
        second_ids = [fixture_id(item) for item in second if fixture_id(item) is not None]

        if not second_ids:
            summary = self._summary(api, started, live=len(live), second=0, detail_batches=0, odds=0, alerts=0)
            self._log_summary(summary)
            return summary

        # Phase 2: one global in-play 1X2 call. Join locally by fixture_id.
        live_odds = await api.get("/odds/live", {"bet": self.cfg.live_bet_id})
        odds_map = parse_live_odds(live_odds, self.cfg.live_bet_id)

        # Phase 3: bulk details. API-Football supports up to 20 ids per call.
        details: Dict[int, Dict[str, Any]] = {}
        detail_batches = 0
        for batch in chunks(second_ids, self.cfg.max_ids_per_batch):
            detail_batches += 1
            rows = await api.get("/fixtures", {"ids": "-".join(map(str, batch))})
            for row in rows:
                fid = fixture_id(row)
                if fid is not None:
                    details[fid] = row

        alerts = 0
        for live_item in second:
            fid = fixture_id(live_item)
            if fid is None:
                continue

            detail = details.get(fid, live_item)
            teams = detail.get("teams", {})
            goals = detail.get("goals", {})
            elapsed = detail.get("fixture", {}).get("status", {}).get("elapsed")
            home_id = teams.get("home", {}).get("id")
            away_id = teams.get("away", {}).get("id")
            stats = normalize_stats(detail)
            odds = odds_map.get(fid, {})

            snapshot = {
                "fixture_id": fid,
                "minute": elapsed,
                "home_id": home_id,
                "away_id": away_id,
                "home_goals": goals.get("home"),
                "away_goals": goals.get("away"),
                "home_odd": odds.get("Home"),
                "draw_odd": odds.get("Draw"),
                "away_odd": odds.get("Away"),
                "home_stats": stats.get(home_id, {}),
                "away_stats": stats.get(away_id, {}),
                "state": "EVALUATED",
            }

            for side, team_id in (("Home", home_id), ("Away", away_id)):
                if team_id is None or self.store.alerted(fid, side):
                    continue
                side_odd = odds.get(side)
                if self.cfg.require_odds and (side_odd is None or side_odd < self.cfg.min_odds):
                    continue
                if not stats_pass(stats.get(team_id, {}), self.cfg):
                    continue

                payload = {
                    "fixture_id": fid,
                    "minute": elapsed,
                    "target_side": side,
                    "target_team_id": team_id,
                    "odd": side_odd,
                    "stats": stats.get(team_id, {}),
                    "paper_only": True,
                }
                self.store.save_alert(fid, side, payload)
                logging.info("PAPER ALERT V5 %s", json.dumps(payload, ensure_ascii=False))
                alerts += 1

            self.store.save_snapshot(snapshot)

        summary = self._summary(
            api,
            started,
            live=len(live),
            second=len(second),
            detail_batches=detail_batches,
            odds=len(odds_map),
            alerts=alerts,
        )
        self._log_summary(summary)
        return summary

    def _summary(
        self,
        api: APIClient,
        started: float,
        *,
        live: int,
        second: int,
        detail_batches: int,
        odds: int,
        alerts: int,
    ) -> Dict[str, Any]:
        return {
            "scan": self.scan_no,
            "elapsed_sec": round(time.monotonic() - started, 3),
            "live": live,
            "second_half": second,
            "odds_covered": odds,
            "detail_batches": detail_batches,
            "alerts": alerts,
            "req_cycle": api.cycle_requests,
            "remaining_minute": api.guard.remaining_minute,
            "remaining_day": api.guard.remaining_day,
            "429s": api.cycle_429,
        }

    def _log_summary(self, summary: Dict[str, Any]) -> None:
        logging.info(
            "TELEMETRY V5 Scan=%s Live=%s 2H=%s Odds=%s Batches=%s Alerts=%s ReqCycle=%s "
            "Rem/M=%s Rem/D=%s 429s=%s Elapsed=%ss",
            summary["scan"],
            summary["live"],
            summary["second_half"],
            summary["odds_covered"],
            summary["detail_batches"],
            summary["alerts"],
            summary["req_cycle"],
            summary["remaining_minute"],
            summary["remaining_day"],
            summary["429s"],
            summary["elapsed_sec"],
        )

    async def run(self, once: bool = False) -> None:
        if not self.cfg.api_key:
            raise RuntimeError("Missing API_FOOTBALL_KEY")
        async with APIClient(self.cfg) as api:
            while True:
                started = time.monotonic()
                await self.cycle(api)
                if once:
                    return
                await asyncio.sleep(max(0.0, self.cfg.scan_seconds - (time.monotonic() - started)))

    def close(self) -> None:
        self.store.close()


async def async_main(once: bool) -> None:
    cfg = Config()
    lock = SingleInstanceLock(cfg.lock_path)
    lock.acquire()
    scanner = Scanner(cfg)
    try:
        logging.info(
            "CAR3 V5 PAPER started scan=%ss window=%s-%s bulk=20 live_bet=%s",
            cfg.scan_seconds,
            cfg.min_minute,
            cfg.max_minute,
            cfg.live_bet_id,
        )
        await scanner.run(once=once)
    finally:
        scanner.close()
        lock.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="CAR3 V5 PAPER live condition scanner")
    parser.add_argument("--once", action="store_true", help="Run one scan cycle")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        asyncio.run(async_main(args.once))
    except KeyboardInterrupt:
        logging.info("CAR3 V5 stopped")
    except RuntimeError as exc:
        logging.error("%s", exc)
        sys.exit(2)


if __name__ == "__main__":
    main()
