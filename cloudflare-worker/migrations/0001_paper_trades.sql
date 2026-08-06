CREATE TABLE IF NOT EXISTS paper_trades (
  fixture_id INTEGER PRIMARY KEY,
  trade_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  entry_minute INTEGER NOT NULL,
  entry_home_score INTEGER NOT NULL,
  entry_away_score INTEGER NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  score_state TEXT NOT NULL DEFAULT '',
  momentum REAL,
  home_win_odds REAL,
  ah_line REAL NOT NULL,
  ah_odds REAL NOT NULL,
  stake_units REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result TEXT NOT NULL DEFAULT 'PENDING',
  settlement TEXT NOT NULL DEFAULT 'PENDING',
  final_status TEXT,
  final_home_score INTEGER,
  final_away_score INTEGER,
  post_entry_home_goals INTEGER,
  post_entry_away_goals INTEGER,
  profit_units REAL NOT NULL DEFAULT 0,
  returned_units REAL,
  split_lines TEXT,
  settled_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_status
  ON paper_trades(status);

CREATE INDEX IF NOT EXISTS idx_paper_trades_created_at
  ON paper_trades(created_at DESC);
