import tempfile
import time
import unittest
from pathlib import Path

from candidate_filter import normalize_config
from condition_engine import ConditionEngine, markets_for, momentum
from engine_store import EngineStore


def statistics(selected_boost=0):
    return {
        "attacks": {"home": 10 + selected_boost, "away": 10},
        "dangerous_attacks": {"home": 5 + selected_boost, "away": 5},
        "shots": {"home": 3 + selected_boost, "away": 3},
        "shots_on_target": {"home": 2 + selected_boost, "away": 2},
        "corners": {"home": 2 + selected_boost, "away": 2},
        "possession": {"home": 55, "away": 45},
        "red_cards": {"home": 0, "away": 0},
    }


def odds():
    return {
        "odds": [
            {
                "name": "Asian Handicap",
                "values": [
                    {"value": "Home", "handicap": "+0.75", "odd": "1.80", "main": True},
                    {"value": "Away", "handicap": "+0.75", "odd": "1.85", "main": True},
                ],
            },
            {
                "name": "Match Winner",
                "values": [
                    {"value": "Home", "odd": "1.90"},
                    {"value": "Away", "odd": "2.10"},
                ],
            },
        ]
    }


class ConditionEngineTests(unittest.TestCase):
    def test_market_parser_matches_legacy_contract(self):
        self.assertEqual(
            markets_for(odds(), "Selected", "HOME"),
            {"win": 1.9, "ah": 0.75, "ah_odds": 1.8},
        )

    def test_momentum_uses_legacy_weights_and_smoothing(self):
        now = int(time.time() * 1000)
        previous = {
            "stats": statistics(0),
            "last_percent": 60,
            "last_minute": 60,
            "last_sample_at": now - 60_000,
            "config_version": "v1",
        }
        result = momentum(statistics(2), previous, now, 61, "v1")
        self.assertIsNotNone(result)
        self.assertGreater(result["selected"], 60)
        self.assertGreaterEqual(result["evidence"], 8)

    def test_more_than_ten_signals_are_not_capped(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = EngineStore(root / "engine.sqlite3")
            engine = ConditionEngine(store, root / "inbox")
            config = normalize_config(
                {
                    "side": "HOME",
                    "minuteMin": 50,
                    "minuteMax": 89,
                    "market": "AH",
                    "oddsMin": 1.2,
                    "ahMin": 0.75,
                    "momentumMin": 10,
                    "attackEvidenceEnabled": False,
                    "confirmationRounds": 1,
                }
            )
            now = int(time.time() * 1000)
            fixtures = []
            stats_by_fixture = {}
            odds_by_fixture = {}
            for fixture_id in range(1, 13):
                fixture = {
                    "fixture_id": fixture_id,
                    "status": "2H",
                    "minute": 60,
                    "home": f"Home {fixture_id}",
                    "away": f"Away {fixture_id}",
                    "home_score": 0,
                    "away_score": 0,
                    "league": "Test",
                    "country": "Test",
                }
                fixtures.append(fixture)
                stats_by_fixture[fixture_id] = {"statistics": statistics(2)}
                odds_by_fixture[fixture_id] = odds()
                store.save_state(
                    key=f"{fixture_id}:HOME",
                    fixture_id=fixture_id,
                    selected_side="HOME",
                    stats=statistics(0),
                    last_percent=50,
                    streak=0,
                    triggered=False,
                    last_minute=59,
                    last_sample_at=now - 60_000,
                    config_version="remote:7",
                )

            result = engine.evaluate(
                fixtures,
                stats_by_fixture,
                odds_by_fixture,
                config,
                {"version": 7},
            )
            self.assertEqual(result["signal_policy"], "UNLIMITED")
            self.assertIsNone(result["signal_limit"])
            self.assertEqual(result["counts"]["new_signals"], 12)
            self.assertEqual(len(list((root / "inbox").glob("*.json"))), 12)
            store.close()


if __name__ == "__main__":
    unittest.main()
