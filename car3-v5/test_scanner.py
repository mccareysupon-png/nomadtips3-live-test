import unittest

from scanner import Config, second_half_candidates, parse_live_odds, normalize_stats, stats_pass


class V5LogicTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config()

    def test_second_half_window(self):
        fixtures = [
            {"fixture": {"id": 1, "status": {"short": "1H", "elapsed": 40}}},
            {"fixture": {"id": 2, "status": {"short": "2H", "elapsed": 49}}},
            {"fixture": {"id": 3, "status": {"short": "2H", "elapsed": 50}}},
            {"fixture": {"id": 4, "status": {"short": "2H", "elapsed": 90}}},
        ]
        ids = [x["fixture"]["id"] for x in second_half_candidates(fixtures, self.cfg)]
        self.assertEqual(ids, [3, 4])

    def test_live_fulltime_result_schema(self):
        rows = [{
            "fixture": {"id": 10},
            "status": {"stopped": False, "blocked": False, "finished": False},
            "odds": [{
                "id": 59,
                "name": "Fulltime Result",
                "values": [
                    {"value": "Home", "odd": "1.75", "main": None, "suspended": False},
                    {"value": "Draw", "odd": "3.10", "main": None, "suspended": False},
                    {"value": "Away", "odd": "5.20", "main": None, "suspended": False},
                ],
            }],
        }]
        parsed = parse_live_odds(rows, 59)
        self.assertEqual(parsed[10]["Home"], 1.75)
        self.assertEqual(parsed[10]["Away"], 5.20)

    def test_blocked_live_odds_are_ignored(self):
        rows = [{
            "fixture": {"id": 10},
            "status": {"stopped": False, "blocked": True, "finished": False},
            "odds": [{"id": 59, "values": [{"value": "Home", "odd": "2.0", "suspended": False}]}],
        }]
        self.assertEqual(parse_live_odds(rows, 59), {})

    def test_fixture_embedded_stats(self):
        detail = {
            "statistics": [
                {
                    "team": {"id": 100},
                    "statistics": [
                        {"type": "Shots on Goal", "value": 4},
                        {"type": "Total Shots", "value": 11},
                        {"type": "Corner Kicks", "value": 5},
                        {"type": "Ball Possession", "value": "58%"},
                    ],
                }
            ]
        }
        stats = normalize_stats(detail)
        self.assertTrue(stats_pass(stats[100], self.cfg))

    def test_missing_stats_passes_safely(self):
        self.assertFalse(stats_pass({"Shots on Goal": 4}, self.cfg))


if __name__ == "__main__":
    unittest.main()
