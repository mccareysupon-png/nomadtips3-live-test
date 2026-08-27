PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS signals (
  signal_id TEXT PRIMARY KEY,
  signal_key TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL,
  source_match_id TEXT NOT NULL,
  league TEXT,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  selection TEXT NOT NULL DEFAULT 'HOME',
  entry_minute INTEGER NOT NULL,
  entry_score_home INTEGER NOT NULL,
  entry_score_away INTEGER NOT NULL,
  home_ah REAL NOT NULL,
  raw_home_ah TEXT,
  odds_decimal REAL NOT NULL,
  odds_raw REAL,
  odds_format TEXT,
  bookmaker TEXT NOT NULL,
  event_source TEXT NOT NULL,
  m88_observed_at TEXT NOT NULL,
  totalcorner_observed_at TEXT NOT NULL,
  config_version TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SETTLED','VOID','ERROR')),
  locked_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signals_locked_at ON signals(locked_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_match ON signals(source_match_id);

CREATE TABLE IF NOT EXISTS signal_evidence (
  evidence_id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('TOTALCORNER','M88','NOMAD')),
  captured_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signal_evidence_signal ON signal_evidence(signal_id, source, captured_at);

CREATE TABLE IF NOT EXISTS settlements (
  signal_id TEXT PRIMARY KEY,
  final_score_home INTEGER NOT NULL,
  final_score_away INTEGER NOT NULL,
  result_grade TEXT NOT NULL
    CHECK (result_grade IN ('WIN','HALF_WIN','PUSH','HALF_LOSS','LOSS','VOID')),
  pl_units REAL NOT NULL,
  settlement_version TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  corrected_at TEXT,
  FOREIGN KEY (signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS engine_configs (
  config_version TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  config_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_health (
  component TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  details_json TEXT
);

CREATE TABLE IF NOT EXISTS signal_audit (
  audit_id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  event_at TEXT NOT NULL,
  details_json TEXT,
  FOREIGN KEY (signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signal_audit_signal ON signal_audit(signal_id, event_at);
