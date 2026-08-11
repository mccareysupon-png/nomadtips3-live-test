CREATE TABLE IF NOT EXISTS v2_latest_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_name TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  ingested_at INTEGER NOT NULL,
  collector_id TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  live_count INTEGER NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  statistics_fixture_count INTEGER NOT NULL DEFAULT 0,
  live_odds_fixture_count INTEGER NOT NULL DEFAULT 0,
  request_count_process INTEGER NOT NULL DEFAULT 0,
  rate_limit_remaining INTEGER,
  rate_limit_limit INTEGER,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS v2_owner_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'owner'
);

CREATE TABLE IF NOT EXISTS v2_signal_history (
  signal_id TEXT PRIMARY KEY,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT,
  selected_team TEXT,
  opponent TEXT,
  minute INTEGER,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_v2_signal_created
  ON v2_signal_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v2_signal_fixture
  ON v2_signal_history(fixture_id, created_at DESC);
