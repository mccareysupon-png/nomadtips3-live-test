import unittest
import sqlite3
import tempfile
from pathlib import Path

from engine_store import EngineStore
from settlement import settle_asian, settlement_for_signal


def fixture(status="FT", home=2, away=1):
    return {
        "fixture": {"id": 7, "status": {"short": status}},
        "goals": {"home": home, "away": away},
        "score": {"fulltime": {"home": home, "away": away}},
    }


def signal(**changes):
    payload = {
        "signal_id": "VPS-7-HOME-1",
        "signal_key": "7:HOME",
        "fixture_id": "7",
        "market": "AH",
        "selection": "HOME",
        "score": {"home": 1, "away": 1},
        "target_odds": 1.8,
        "ah_line": 0.75,
        "ah_odds": 1.8,
        "stake_units": 1,
    }
    payload.update(changes)
    return payload


class SettlementTests(unittest.TestCase):
    def test_asian_full_half_push_and_loss(self):
        self.assertEqual(settle_asian(1, 0.75, 1.8)["settlement"], "FULL WIN")
        self.assertEqual(settle_asian(0, 0.25, 1.8)["settlement"], "HALF WIN")
        self.assertEqual(settle_asian(0, 0.0, 1.8)["settlement"], "PUSH")
        self.assertEqual(settle_asian(-1, 0.75, 1.8)["settlement"], "HALF LOSS")

    def test_ah_uses_post_entry_selected_team_perspective(self):
        result = settlement_for_signal(signal(), fixture(home=2, away=1), 1_700_000_000_000)
        self.assertEqual(result["outcome"], "WIN")
        self.assertEqual(result["post_entry_selected_goals"], 1)
        self.assertEqual(result["post_entry_opponent_goals"], 0)
        self.assertEqual(result["profit_units"], 0.8)

    def test_away_selection_is_oriented_correctly(self):
        result = settlement_for_signal(
            signal(selection="AWAY", score={"home": 0, "away": 0}, ah_line=0.0),
            fixture(home=0, away=1),
            1_700_000_000_000,
        )
        self.assertEqual(result["outcome"], "WIN")

    def test_win_market_draw_is_loss(self):
        result = settlement_for_signal(
            signal(market="WIN", score={"home": 0, "away": 0}, target_odds=2.0),
            fixture(home=1, away=1),
            1_700_000_000_000,
        )
        self.assertEqual(result["settlement"], "FULL LOSS")
        self.assertEqual(result["profit_units"], -1.0)

    def test_non_terminal_stays_pending_and_cancelled_is_void(self):
        self.assertIsNone(settlement_for_signal(signal(), fixture(status="2H"), 1_700_000_000_000))
        result = settlement_for_signal(signal(), fixture(status="CANC"), 1_700_000_000_000)
        self.assertEqual(result["outcome"], "VOID")

    def test_store_migrates_existing_database_and_persists_result(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "engine.sqlite3"
            connection = sqlite3.connect(path)
            connection.execute(
                """
                CREATE TABLE engine_signals (
                  signal_key TEXT PRIMARY KEY,
                  fixture_id INTEGER NOT NULL,
                  selected_side TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  created_at INTEGER NOT NULL
                )
                """
            )
            connection.commit()
            connection.close()

            store = EngineStore(path)
            payload = signal()
            self.assertTrue(store.insert_signal("7:HOME", 7, "HOME", payload, 1_000_000))
            pending = store.pending_signals(
                2_000_000,
                min_age_ms=0,
                retry_after_ms=1,
            )
            self.assertEqual(len(pending), 1)
            self.assertEqual(pending[0]["outcome"], "PENDING")
            settled = settlement_for_signal(payload, fixture(home=2, away=1), 2_000_000)
            self.assertTrue(store.settle_signal("7:HOME", settled, 2_000_000))
            recent = store.recent_signals(5)
            self.assertEqual(recent[0]["outcome"], "WIN")
            self.assertEqual(store.pending_signals(3_000_000), [])
            store.close()


if __name__ == "__main__":
    unittest.main()
