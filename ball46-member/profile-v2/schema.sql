CREATE TABLE IF NOT EXISTS member_profiles (
  user_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  time_zone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  reduced_motion INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
