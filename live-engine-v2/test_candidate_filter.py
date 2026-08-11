import unittest

from candidate_filter import filter_preliminary, normalize_config, preliminary_match


class CandidateFilterTests(unittest.TestCase):
    def setUp(self):
        self.config = normalize_config({
            "minute_min": 60,
            "minute_max": 80,
            "score_states": ["TIED"],
            "goal_gap_enabled": True,
            "max_goal_gap": 1,
        })

    def test_matching_fixture_passes(self):
        matched, reason = preliminary_match({
            "status": "2H",
            "minute": 65,
            "home_score": 1,
            "away_score": 1,
        }, self.config)
        self.assertTrue(matched)
        self.assertEqual(reason, "MATCH")

    def test_minute_range_rejects(self):
        matched, reason = preliminary_match({
            "status": "2H",
            "minute": 50,
            "home_score": 1,
            "away_score": 1,
        }, self.config)
        self.assertFalse(matched)
        self.assertEqual(reason, "MINUTE_RANGE")

    def test_score_state_rejects(self):
        matched, reason = preliminary_match({
            "status": "2H",
            "minute": 65,
            "home_score": 2,
            "away_score": 1,
        }, self.config)
        self.assertFalse(matched)
        self.assertEqual(reason, "SCORE_STATE")

    def test_summary_counts_rejections(self):
        result = filter_preliminary([
            {"status": "2H", "minute": 65, "home_score": 1, "away_score": 1},
            {"status": "2H", "minute": 50, "home_score": 1, "away_score": 1},
        ], self.config)
        self.assertEqual(result["candidate_count"], 1)
        self.assertEqual(result["rejected"]["MINUTE_RANGE"], 1)


if __name__ == "__main__":
    unittest.main()
