import unittest

from collector import Collector
from provider_errors import ProviderRateLimitError


class FakeStore:
    def __init__(self):
        self.checked = []
        self.settled = []

    def pending_signals(self, *_args, **_kwargs):
        return [{
            "_signal_key": "77:HOME",
            "fixture_id": 77,
            "selection": "HOME",
            "market": "AH",
            "score": {"home": 1, "away": 1},
            "ah_line": 0.75,
            "ah_odds": 1.8,
            "stake_units": 1,
        }]

    def mark_signal_checked(self, key, checked_at):
        self.checked.append((key, checked_at))

    def settle_signal(self, key, updates, settled_at):
        self.settled.append((key, updates, settled_at))
        return True


class FakeDetails:
    async def fixture_details(self, fixtures, ttl_seconds):
        return {
            "by_fixture": {
                77: {
                    "fixture": {"id": 77, "status": {"short": "FT"}},
                    "goals": {"home": 2, "away": 1},
                    "score": {"fulltime": {"home": 2, "away": 1}},
                }
            },
            "batch_count": 1,
            "cache_hits": 0,
        }


class RateLimitedDetails:
    async def fixture_details(self, fixtures, ttl_seconds):
        raise ProviderRateLimitError(12)


def collector_with(details):
    collector = Collector.__new__(Collector)
    collector.last_settlement_poll = 0.0
    collector.settlement_poll_seconds = 300
    collector.settlement_min_age_seconds = 120
    collector.store = FakeStore()
    collector.detail_fetcher = details
    return collector


class CollectorSettlementTests(unittest.IsolatedAsyncioTestCase):
    async def test_pending_signal_is_checked_and_settled(self):
        collector = collector_with(FakeDetails())
        telemetry = await collector.settle_pending_signals()

        self.assertEqual(telemetry["checked"], 1)
        self.assertEqual(telemetry["settled"], 1)
        self.assertEqual(collector.store.checked[0][0], "77:HOME")
        self.assertEqual(collector.store.settled[0][1]["outcome"], "WIN")
        self.assertEqual(collector.store.settled[0][1]["settlement"], "FULL WIN")

    async def test_provider_429_is_propagated_to_global_backoff(self):
        collector = collector_with(RateLimitedDetails())
        with self.assertRaises(ProviderRateLimitError):
            await collector.settle_pending_signals()


if __name__ == "__main__":
    unittest.main()
