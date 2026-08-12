import time

import httpx

from request_signing import RequestSigner


class RemoteConfigClient:
    def __init__(
        self,
        url,
        secret,
        auth_mode="bearer",
        signing_private_key_b64="",
        refresh_seconds=15,
        client=None,
    ):
        self.url = str(url or "").strip()
        self.secret = str(secret or "").strip()
        self.auth_mode = str(auth_mode or "bearer").strip().lower()
        self.signer = RequestSigner(signing_private_key_b64)
        self.refresh_seconds = max(5, int(refresh_seconds))
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(timeout=10)
        self.last_checked_monotonic = 0.0
        self.cached = None
        self.last_error = None

    @property
    def configured(self):
        has_auth = self.secret or (self.auth_mode == "signed" and self.signer.configured)
        return bool(self.url and has_auth)

    async def close(self):
        if self._owns_client:
            await self.client.aclose()

    def due(self):
        if not self.configured:
            return False
        return (time.monotonic() - self.last_checked_monotonic) >= self.refresh_seconds

    async def get(self):
        if not self.configured:
            return None
        if not self.due():
            return self.cached

        self.last_checked_monotonic = time.monotonic()
        try:
            headers = {
                "Accept": "application/json",
                "User-Agent": "nomadtips3-live-engine-v2/1.0",
            }
            if self.secret:
                headers["Authorization"] = f"Bearer {self.secret}"
            if self.auth_mode == "signed":
                headers.update(self.signer.headers("GET", self.url))
            response = await self.client.get(self.url, headers=headers)
            response.raise_for_status()
            data = response.json()
            if not data.get("ok"):
                raise RuntimeError(data.get("error") or "REMOTE_CONFIG_FAILED")
            owner_config = data.get("ownerConfig")
            if owner_config and isinstance(owner_config.get("config"), dict):
                self.cached = owner_config
            self.last_error = None
        except Exception as error:
            self.last_error = str(error)

        return self.cached
