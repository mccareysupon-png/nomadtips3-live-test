-- Dedicated, NEW D1 database for BALL46 Performance Snapshot only.
-- NEVER execute on main BALL46 or Member databases.
CREATE TABLE IF NOT EXISTS performance_snapshot_v1 (
  snapshot_key TEXT PRIMARY KEY CHECK (snapshot_key = 'ball46:performance:v1:latest'),
  generated_at_ms INTEGER NOT NULL CHECK (generated_at_ms > 0),
  source_updated_at_ms INTEGER NOT NULL CHECK (source_updated_at_ms > 0),
  payload TEXT NOT NULL
);
