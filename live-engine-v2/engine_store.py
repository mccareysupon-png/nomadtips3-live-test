import json
import os
import sqlite3
import tempfile
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS engine_state (
  state_key TEXT PRIMARY KEY,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  last_percent REAL,
  streak INTEGER NOT NULL DEFAULT 0,
  triggered INTEGER NOT NULL DEFAULT 0,
  last_minute INTEGER NOT NULL,
  last_sample_at INTEGER NOT NULL,
  config_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engine_state_updated ON engine_state(updated_at);
CREATE TABLE IF NOT EXISTS engine_signals (
  signal_key TEXT PRIMARY KEY,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result TEXT NOT NULL DEFAULT 'PENDING',
  settlement TEXT NOT NULL DEFAULT 'PENDING',
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  last_checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_engine_signals_created ON engine_signals(created_at DESC);
"""


class EngineStore:
    def __init__(self, path):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(target)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=NORMAL")
        self.connection.executescript(SCHEMA)
        self._ensure_signal_columns()
        self.connection.commit()

    def _ensure_signal_columns(self):
        existing = {
            row["name"]
            for row in self.connection.execute("PRAGMA table_info(engine_signals)").fetchall()
        }
        migrations = {
            "status": "TEXT NOT NULL DEFAULT 'PENDING'",
            "result": "TEXT NOT NULL DEFAULT 'PENDING'",
            "settlement": "TEXT NOT NULL DEFAULT 'PENDING'",
            "outcome": "TEXT NOT NULL DEFAULT 'PENDING'",
            "updated_at": "INTEGER NOT NULL DEFAULT 0",
            "last_checked_at": "INTEGER NOT NULL DEFAULT 0",
        }
        for column, definition in migrations.items():
            if column not in existing:
                self.connection.execute(
                    f"ALTER TABLE engine_signals ADD COLUMN {column} {definition}"
                )

    def close(self):
        self.connection.close()

    def state_for(self, key):
        row = self.connection.execute(
            "SELECT * FROM engine_state WHERE state_key = ?", (key,)
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        try:
            result["stats"] = json.loads(result.pop("stats_json") or "{}")
        except json.JSONDecodeError:
            result["stats"] = {}
        result["triggered"] = bool(result.get("triggered"))
        return result

    def has_signal(self, key):
        row = self.connection.execute(
            "SELECT 1 FROM engine_signals WHERE signal_key = ?", (key,)
        ).fetchone()
        return row is not None

    def save_state(
        self,
        *,
        key,
        fixture_id,
        selected_side,
        stats,
        last_percent,
        streak,
        triggered,
        last_minute,
        last_sample_at,
        config_version,
    ):
        self.connection.execute(
            """
            INSERT INTO engine_state (
              state_key, fixture_id, selected_side, stats_json, last_percent,
              streak, triggered, last_minute, last_sample_at, config_version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(state_key) DO UPDATE SET
              stats_json=excluded.stats_json,
              last_percent=excluded.last_percent,
              streak=excluded.streak,
              triggered=excluded.triggered,
              last_minute=excluded.last_minute,
              last_sample_at=excluded.last_sample_at,
              config_version=excluded.config_version,
              updated_at=excluded.updated_at
            """,
            (
                key,
                fixture_id,
                selected_side,
                json.dumps(stats, ensure_ascii=False, separators=(",", ":")),
                last_percent,
                int(streak),
                int(bool(triggered)),
                int(last_minute),
                int(last_sample_at),
                str(config_version),
                int(last_sample_at),
            ),
        )
        self.connection.commit()

    def insert_signal(self, key, fixture_id, selected_side, payload, created_at):
        record = {
            **payload,
            "status": "PENDING",
            "result": "PENDING",
            "settlement": "PENDING",
            "outcome": "PENDING",
            "stake_units": 1.0,
            "profit_units": 0.0,
            "returned_units": 0.0,
            "final_status": None,
            "final_score": None,
            "settled_at": None,
        }
        cursor = self.connection.execute(
            """
            INSERT OR IGNORE INTO engine_signals (
              signal_key, fixture_id, selected_side, payload_json,
              status, result, settlement, outcome,
              created_at, updated_at, last_checked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                key,
                int(fixture_id),
                selected_side,
                json.dumps(record, ensure_ascii=False, separators=(",", ":")),
                record["status"],
                record["result"],
                record["settlement"],
                record["outcome"],
                int(created_at),
                int(created_at),
            ),
        )
        self.connection.commit()
        return cursor.rowcount == 1

    def pending_signals(
        self,
        now_ms,
        *,
        min_age_ms=120_000,
        retry_after_ms=300_000,
        limit=100,
    ):
        rows = self.connection.execute(
            """
            SELECT signal_key, payload_json
            FROM engine_signals
            WHERE status = 'PENDING'
              AND created_at <= ?
              AND last_checked_at <= ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (
                int(now_ms) - max(0, int(min_age_ms)),
                int(now_ms) - max(1, int(retry_after_ms)),
                max(1, min(500, int(limit))),
            ),
        ).fetchall()
        output = []
        for row in rows:
            try:
                payload = json.loads(row["payload_json"])
            except json.JSONDecodeError:
                continue
            payload["_signal_key"] = row["signal_key"]
            output.append(payload)
        return output

    def mark_signal_checked(self, key, checked_at):
        self.connection.execute(
            """
            UPDATE engine_signals
            SET last_checked_at = ?, updated_at = ?
            WHERE signal_key = ? AND status = 'PENDING'
            """,
            (int(checked_at), int(checked_at), key),
        )
        self.connection.commit()

    def settle_signal(self, key, updates, settled_at):
        row = self.connection.execute(
            "SELECT payload_json FROM engine_signals WHERE signal_key = ?",
            (key,),
        ).fetchone()
        if not row:
            return False
        try:
            payload = json.loads(row["payload_json"])
        except json.JSONDecodeError:
            return False
        payload.update(updates)
        cursor = self.connection.execute(
            """
            UPDATE engine_signals
            SET payload_json = ?, status = ?, result = ?, settlement = ?, outcome = ?,
                updated_at = ?, last_checked_at = ?
            WHERE signal_key = ? AND status = 'PENDING'
            """,
            (
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                str(payload.get("status") or "PENDING"),
                str(payload.get("result") or "PENDING"),
                str(payload.get("settlement") or "PENDING"),
                str(payload.get("outcome") or "PENDING"),
                int(settled_at),
                int(settled_at),
                key,
            ),
        )
        self.connection.commit()
        return cursor.rowcount == 1

    def recent_signals(self, limit=50):
        rows = self.connection.execute(
            "SELECT payload_json FROM engine_signals ORDER BY created_at DESC LIMIT ?",
            (max(1, min(200, int(limit))),),
        ).fetchall()
        output = []
        for row in rows:
            try:
                output.append(json.loads(row["payload_json"]))
            except json.JSONDecodeError:
                continue
        return output

    def cleanup_states(self, before_ms):
        self.connection.execute(
            "DELETE FROM engine_state WHERE updated_at < ?", (int(before_ms),)
        )
        self.connection.commit()

    @staticmethod
    def write_signal(inbox_dir, payload):
        target_dir = Path(inbox_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        filename = "".join(
            char if char.isalnum() or char in "-_" else "-"
            for char in str(payload["signal_id"])
        )
        target = target_dir / f"{filename}.json"
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", delete=False, dir=target_dir, suffix=".tmp"
        ) as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            temporary = Path(handle.name)
        os.replace(temporary, target)
        return target
