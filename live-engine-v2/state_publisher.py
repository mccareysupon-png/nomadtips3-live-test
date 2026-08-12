import hashlib\nimport json\nimport time\n\nimport httpx

from request_signing import RequestSigner
\n\nHASH_FIELDS = (\n    "live_count",\n    "preliminary_candidate_count",\n    "statistics_fixture_count",\n    "live_odds_fixture_count",\n    "condition",\n    "rejected",\n    "fixtures",\n    "preliminary_candidates",\n    "statistics",
    "live_odds",
    "engine",
    "settlement_telemetry",
    "runtime",
)
\n\ndef state_hash(payload):\n    material = {key: payload.get(key) for key in HASH_FIELDS}\n    encoded = json.dumps(\n        material,\n        ensure_ascii=False,\n        sort_keys=True,\n        separators=(",", ":"),\n    ).encode("utf-8")\n    return hashlib.sha256(encoded).hexdigest()\n\n\nclass StatePublisher:\n    def __init__(\n        self,\n        url,\n        secret,
        auth_mode="bearer",
        signing_private_key_b64="",
        collector_id="vps-primary",
        heartbeat_seconds=60,\n        client=None,\n    ):\n        self.url = str(url or "").strip()\n        self.secret = str(secret or "").strip()
        self.auth_mode = str(auth_mode or "bearer").strip().lower()
        self.signer = RequestSigner(signing_private_key_b64)
        self.collector_id = str(collector_id or "vps-primary")\n        self.heartbeat_seconds = max(15, int(heartbeat_seconds))\n        self._owns_client = client is None\n        self.client = client or httpx.AsyncClient(timeout=15)\n        self.last_hash = None\n        self.last_publish_monotonic = 0.0\n\n    @property\n    def configured(self):
        has_auth = self.secret or (self.auth_mode == "signed" and self.signer.configured)
        return bool(self.url and has_auth)
\n    async def close(self):\n        if self._owns_client:\n            await self.client.aclose()\n\n    def due(self, digest):\n        if not self.configured:\n            return False\n        if digest != self.last_hash:\n            return True\n        return (time.monotonic() - self.last_publish_monotonic) >= self.heartbeat_seconds\n\n    async def publish(self, payload):\n        digest = state_hash(payload)\n        if not self.due(digest):\n            return {\n                "published": False,\n                "reason": "UNCHANGED_OR_DISABLED",\n                "state_hash": digest,\n            }\n\n        envelope = {
            "collector_id": self.collector_id,
            "state_hash": digest,
            "payload": payload,
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "nomadtips3-live-engine-v2/1.0",
        }
        if self.secret:
            headers["Authorization"] = f"Bearer {self.secret}"
        if self.auth_mode == "signed":
            body = json.dumps(
                envelope, ensure_ascii=False, separators=(",", ":")
            ).encode("utf-8")
            headers.update(self.signer.headers("POST", self.url, body))
            response = await self.client.post(self.url, headers=headers, content=body)
        else:
            response = await self.client.post(self.url, headers=headers, json=envelope)
        response.raise_for_status()\n        self.last_hash = digest\n        self.last_publish_monotonic = time.monotonic()\n        return {\n            "published": True,\n            "reason": "STATE_CHANGED_OR_HEARTBEAT",\n            "state_hash": digest,\n            "http_status": response.status_code,\n        }\n