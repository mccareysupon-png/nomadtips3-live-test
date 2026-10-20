-- Isolated visitor analytics, NEVER share the BALL46 football production D1.
CREATE TABLE IF NOT EXISTS sessions (
 sid TEXT PRIMARY KEY,
 first_ms INTEGER NOT NULL,
 last_ms INTEGER NOT NULL,
 path TEXT NOT NULL,
 country TEXT NOT NULL,
 city TEXT NOT NULL,
 device TEXT NOT NULL,
 ip_masked TEXT,
 referrer TEXT NOT NULL,
 pageviews INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS views (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 sid TEXT NOT NULL,
 at_ms INTEGER NOT NULL,
 path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitor_sessions_last ON sessions(last_ms);
CREATE INDEX IF NOT EXISTS idx_monitor_views_time ON views(at_ms);
CREATE INDEX IF NOT EXISTS idx_monitor_views_path ON views(path);
