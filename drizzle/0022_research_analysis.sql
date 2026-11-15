CREATE TABLE IF NOT EXISTS research_analyses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS research_analyses_owner ON research_analyses(owner_id,created_at);
