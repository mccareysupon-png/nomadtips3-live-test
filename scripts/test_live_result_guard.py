#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "scripts"))

from live_result_guard import reconcile_match_state  # noqa: E402


class LiveResultGuardTests(unittest.TestCase):
    def test_terminal_result_cannot_roll_back_to_not_started(self):
        result = reconcile_match_state(
            {
                "status": "FT",
                "status_long": "Match Finished",
                "elapsed": 90,
                "score": {"home": 2, "away": 1},
                "fulltime_score": {"home": 2, "away": 1},
            },
            {"short": "NS", "long": "Not Started", "elapsed": None},
            {"home": None, "away": None},
            {},
        )
        self.assertEqual(result["status"], "FT")
        self.assertEqual(result["score"], {"home": 2, "away": 1})
        self.assertEqual(result["fulltime_score"], {"home": 2, "away": 1})
        self.assertTrue(result["terminal_regression_blocked"])

    def test_incomplete_live_score_keeps_last_known_side(self):
        result = reconcile_match_state(
            {"status": "2H", "score": {"home": 1, "away": 0}},
            {"short": "2H", "long": "Second Half", "elapsed": 71},
            {"home": 2, "away": None},
            {},
        )
        self.assertEqual(result["score"], {"home": 2, "away": 0})
        self.assertFalse(result["terminal_regression_blocked"])

    def test_terminal_snapshot_uses_goals_when_fulltime_pair_is_missing(self):
        result = reconcile_match_state(
            {"status": "2H", "score": {"home": 1, "away": 1}},
            {"short": "FT", "long": "Match Finished", "elapsed": 90},
            {"home": 2, "away": 1},
            {"fulltime": {"home": None, "away": None}},
        )
        self.assertEqual(result["status"], "FT")
        self.assertEqual(result["score"], {"home": 2, "away": 1})
        self.assertEqual(result["fulltime_score"], {"home": 2, "away": 1})


if __name__ == "__main__":
    unittest.main()
