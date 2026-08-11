import asyncio
import time
from dataclasses import dataclass


@dataclass
class CacheEntry:
    expires_at: float
    value: object


class TTLCache:
    def __init__(self):
        self._items = {}
        self._locks = {}

    def get(self, key):
        entry = self._items.get(key)
        if not entry:
            return None
        if entry.expires_at <= time.monotonic():
            self._items.pop(key, None)
            return None
        return entry.value

    def set(self, key, value, ttl_seconds):
        self._items[key] = CacheEntry(
            expires_at=time.monotonic() + max(1, int(ttl_seconds)),
            value=value,
        )

    def lock_for(self, key):
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock


def chunk_fixture_ids(fixtures, chunk_size=20):
    ids = []
    seen = set()
    for fixture in fixtures:
        try:
            fixture_id = int(fixture.get("fixture_id"))
        except (TypeError, ValueError, AttributeError):
            continue
        if fixture_id in seen:
            continue
        seen.add(fixture_id)
        ids.append(fixture_id)
    return [ids[index:index + chunk_size] for index in range(0, len(ids), chunk_size)]


def index_fixture_details(payload):
    result = {}
    for item in payload.get("response") or []:
        fixture_id = ((item.get("fixture") or {}).get("id"))
        if fixture_id is None:
            continue
        result[int(fixture_id)] = item
    return result


def index_live_odds(payload, wanted_ids=None):
    wanted = None if wanted_ids is None else {int(value) for value in wanted_ids}
    result = {}
    for item in payload.get("response") or []:
        fixture = item.get("fixture") or {}
        fixture_id = fixture.get("id")
        if fixture_id is None:
            continue
        fixture_id = int(fixture_id)
        if wanted is not None and fixture_id not in wanted:
            continue
        result[fixture_id] = item
    return result


class DetailFetcher:
    """Fetches detail only after local preliminary filtering.

    The caller supplies an already-configured httpx AsyncClient. This class does
    not own the API key and never runs a scheduler of its own.
    """

    def __init__(self, client, request_counter=None):
        self.client = client
        self.cache = TTLCache()
        self.request_counter = request_counter
        self.origin_requests = 0

    async def _get_json(self, path, cache_key, ttl_seconds):
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached, True

        async with self.cache.lock_for(cache_key):
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached, True

            response = await self.client.get(path)
            self.origin_requests += 1
            if self.request_counter:
                self.request_counter()

            if response.status_code == 429:
                retry_after = response.headers.get("retry-after")
                raise RuntimeError(f"API rate limited (429), retry-after={retry_after}")
            if response.status_code == 204:
                payload = {"response": []}
            else:
                response.raise_for_status()
                payload = response.json()
                errors = payload.get("errors")
                if errors and errors != [] and errors != {}:
                    raise RuntimeError(f"API returned errors: {errors}")

            self.cache.set(cache_key, payload, ttl_seconds)
            return payload, False

    async def fixture_details(self, candidates, ttl_seconds=60):
        details = {}
        cache_hits = 0
        batches = chunk_fixture_ids(candidates, 20)

        for group in batches:
            ids_param = "-".join(str(value) for value in group)
            key = f"fixtures:ids:{ids_param}"
            payload, hit = await self._get_json(
                f"/fixtures?ids={ids_param}", key, ttl_seconds
            )
            cache_hits += int(hit)
            details.update(index_fixture_details(payload))

        return {
            "by_fixture": details,
            "batch_count": len(batches),
            "cache_hits": cache_hits,
        }

    async def live_odds(self, candidates, ttl_seconds=10):
        wanted_ids = [group_id for group in chunk_fixture_ids(candidates, 20) for group_id in group]
        if not wanted_ids:
            return {"by_fixture": {}, "cache_hit": False}

        # One shared live-odds snapshot is cheaper than one request per fixture.
        payload, hit = await self._get_json(
            "/odds/live", "odds:live:all", ttl_seconds
        )
        return {
            "by_fixture": index_live_odds(payload, wanted_ids),
            "cache_hit": hit,
        }
