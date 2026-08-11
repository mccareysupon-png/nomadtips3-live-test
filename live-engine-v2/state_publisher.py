import hashlib
import json
import time

import httpx


HASH_FIELDS = (
    "live_count",
    "preliminary_candidate_count",
    "statistics_fixture_count",
    "live_odds_fixture_count",
    "condition",
    "rejected",
    "fixtures",
    "preliminary_candidates",
    "statistics",
    "live_odds",
)


def state_hash(payload):
    material = {key: payload.get(key) for key in HASH_FIELDS}
    encoded = json.dumps(
        material,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class StatePublisher:
    def __init__(
        self,
        url,
        secret,
        collector_id="vps-primary",
        heartbeat_seconds=60,
        client=None,
    ):
        self.url = str(url or "").strip()
        self.secret = str(secret or "").strip()
        self.collector_id = str(collector_id or "vps-primary")
        self.heartbeat_seconds = max(15, int(heartbeat_seconds))
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(timeout=15)
        self.last_hash = None
        self.last_publish_monotonic = 0.0

    @property
    def configured(self):
        return bool(self.url and self.secret)

    async def close(self):
        if self._owns_client:
            await self.client.aclose()

    def due(self, digest):
        if not self.configured:
            return False
        if digest != self.last_hash:
            return True
        return (time.monotonic() - self.last_publish_monotonic) >= self.heartbeat_seconds

    async def publish(self, payload):
        digest = state_hash(payload)
        if not self.due(digest):
            return {
                "published": False,
                "reason": "UNCHANGED_OR_DISABLED",
                "state_hash": digest,
            }

        response = await self.client.post(
            self.url,
            headers={
                "Authorization": f"Bearer {self.secret}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "nomadtips3-live-engine-v2/0.4",
            },
            json={
                "collector_id": self.collector_id,
                "state_hash": digest,
                "payload": payload,
            },
        )
        response.raise_for_status()
        self.last_hash = digest
        self.last_publish_monotonic = time.monotonic()
        return {
            "published": True,
            "reason": "STATE_CHANGED_OR_HEARTBEAT",
            "state_hash": digest,
            "http_status": response.status_code,
        }
