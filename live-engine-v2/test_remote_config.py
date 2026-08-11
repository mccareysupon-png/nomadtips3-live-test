import asyncio
import unittest

from remote_config import RemoteConfigClient


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    async def get(self, url, headers=None):
        self.calls += 1
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class RemoteConfigTests(unittest.TestCase):
    def test_unconfigured_is_safe_off(self):
        async def scenario():
            client = FakeClient([])
            remote = RemoteConfigClient("", "", client=client)
            self.assertIsNone(await remote.get())
            self.assertEqual(client.calls, 0)

        asyncio.run(scenario())

    def test_fetches_and_caches_owner_config(self):
        async def scenario():
            client = FakeClient([
                FakeResponse({
                    "ok": True,
                    "ownerConfig": {
                        "version": 3,
                        "config": {"minute_min": 55}
                    }
                })
            ])
            remote = RemoteConfigClient(
                "https://example.invalid/v2/collector/config",
                "secret",
                refresh_seconds=60,
                client=client,
            )
            first = await remote.get()
            second = await remote.get()
            self.assertEqual(first["version"], 3)
            self.assertEqual(second["config"]["minute_min"], 55)
            self.assertEqual(client.calls, 1)

        asyncio.run(scenario())

    def test_failure_keeps_last_good_config(self):
        async def scenario():
            client = FakeClient([
                FakeResponse({
                    "ok": True,
                    "ownerConfig": {
                        "version": 4,
                        "config": {"minute_min": 60}
                    }
                }),
                RuntimeError("network down")
            ])
            remote = RemoteConfigClient(
                "https://example.invalid/v2/collector/config",
                "secret",
                refresh_seconds=5,
                client=client,
            )
            good = await remote.get()
            self.assertEqual(good["version"], 4)
            remote.last_checked_monotonic = 0
            fallback = await remote.get()
            self.assertEqual(fallback["version"], 4)
            self.assertIn("network down", remote.last_error)

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
