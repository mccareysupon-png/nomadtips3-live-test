import asyncio
import unittest

from state_publisher import StatePublisher, state_hash


class FakeResponse:
    status_code = 200

    def raise_for_status(self):
        return None


class FakeClient:
    def __init__(self):
        self.calls = []

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers or {}, "json": json})
        return FakeResponse()


class StatePublisherTests(unittest.TestCase):
    def payload(self, score=0):
        return {
            "live_count": 1,
            "preliminary_candidate_count": 1,
            "statistics_fixture_count": 0,
            "live_odds_fixture_count": 0,
            "condition": {"minute_min": 1},
            "rejected": {},
            "fixtures": [{"fixture_id": 1, "home_score": score}],
            "preliminary_candidates": [{"fixture_id": 1, "home_score": score}],
            "statistics": {},
            "live_odds": {},
            "generated_at": "changes-every-cycle-but-not-hashed",
            "request_count_process": 999,
        }

    def test_volatile_fields_do_not_change_hash(self):
        first = self.payload()
        second = dict(first)
        second["generated_at"] = "another-time"
        second["request_count_process"] = 1000
        self.assertEqual(state_hash(first), state_hash(second))

    def test_changed_state_publishes_unchanged_state_skips(self):
        async def scenario():
            client = FakeClient()
            publisher = StatePublisher(
                "https://example.invalid/v2/ingest",
                "secret",
                client=client,
                heartbeat_seconds=60,
            )

            first = await publisher.publish(self.payload(score=0))
            self.assertTrue(first["published"])
            self.assertEqual(len(client.calls), 1)

            second = await publisher.publish(self.payload(score=0))
            self.assertFalse(second["published"])
            self.assertEqual(len(client.calls), 1)

            third = await publisher.publish(self.payload(score=1))
            self.assertTrue(third["published"])
            self.assertEqual(len(client.calls), 2)

        asyncio.run(scenario())

    def test_unconfigured_publisher_is_safe_off(self):
        async def scenario():
            client = FakeClient()
            publisher = StatePublisher("", "", client=client)
            result = await publisher.publish(self.payload())
            self.assertFalse(result["published"])
            self.assertEqual(client.calls, [])

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
