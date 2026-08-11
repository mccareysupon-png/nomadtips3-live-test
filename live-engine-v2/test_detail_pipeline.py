import asyncio
import unittest

from detail_fetcher import DetailFetcher, chunk_fixture_ids
from detail_normalizer import compact_fixture_details


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self._payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self):
        self.calls = []

    async def get(self, path):
        self.calls.append(path)
        if path.startswith("/fixtures?ids="):
            ids = [int(value) for value in path.split("=", 1)[1].split("-")]
            return FakeResponse({
                "errors": [],
                "response": [
                    {
                        "fixture": {"id": fixture_id, "timestamp": 1},
                        "teams": {
                            "home": {"id": fixture_id * 10 + 1},
                            "away": {"id": fixture_id * 10 + 2},
                        },
                        "statistics": [
                            {
                                "team": {"id": fixture_id * 10 + 1},
                                "statistics": [
                                    {"type": "Dangerous Attacks", "value": 30},
                                    {"type": "Ball Possession", "value": "55%"},
                                ],
                            },
                            {
                                "team": {"id": fixture_id * 10 + 2},
                                "statistics": [
                                    {"type": "Dangerous Attacks", "value": 20},
                                    {"type": "Ball Possession", "value": "45%"},
                                ],
                            },
                        ],
                    }
                    for fixture_id in ids
                ],
            })
        if path == "/odds/live":
            return FakeResponse({
                "errors": [],
                "response": [
                    {"fixture": {"id": 1, "status": {"elapsed": 66}}, "odds": []},
                    {"fixture": {"id": 2, "status": {"elapsed": 70}}, "odds": []},
                    {"fixture": {"id": 999, "status": {"elapsed": 50}}, "odds": []},
                ],
            })
        raise AssertionError(path)


class DetailPipelineTests(unittest.TestCase):
    def test_chunk_max_twenty_and_dedupes(self):
        fixtures = [{"fixture_id": value} for value in range(1, 26)] + [{"fixture_id": 1}]
        groups = chunk_fixture_ids(fixtures)
        self.assertEqual([len(group) for group in groups], [20, 5])
        self.assertEqual(sum(len(group) for group in groups), 25)

    def test_twenty_five_candidates_use_two_calls_then_cache(self):
        async def scenario():
            client = FakeClient()
            fetcher = DetailFetcher(client)
            fixtures = [{"fixture_id": value} for value in range(1, 26)]

            first = await fetcher.fixture_details(fixtures, ttl_seconds=60)
            self.assertEqual(first["batch_count"], 2)
            self.assertEqual(first["cache_hits"], 0)
            self.assertEqual(fetcher.origin_requests, 2)

            second = await fetcher.fixture_details(fixtures, ttl_seconds=60)
            self.assertEqual(second["cache_hits"], 2)
            self.assertEqual(fetcher.origin_requests, 2)

            compact = compact_fixture_details(first["by_fixture"])
            self.assertEqual(compact[1]["statistics"]["dangerous_attacks"]["home"], 30)
            self.assertEqual(compact[1]["statistics"]["possession"]["away"], 45)

        asyncio.run(scenario())

    def test_live_odds_one_shared_call_and_local_filter(self):
        async def scenario():
            client = FakeClient()
            fetcher = DetailFetcher(client)
            fixtures = [{"fixture_id": 1}, {"fixture_id": 2}]

            first = await fetcher.live_odds(fixtures, ttl_seconds=10)
            self.assertEqual(sorted(first["by_fixture"]), [1, 2])
            self.assertFalse(first["cache_hit"])
            self.assertEqual(fetcher.origin_requests, 1)

            second = await fetcher.live_odds(fixtures, ttl_seconds=10)
            self.assertTrue(second["cache_hit"])
            self.assertEqual(fetcher.origin_requests, 1)

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
