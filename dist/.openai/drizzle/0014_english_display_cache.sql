CREATE TABLE IF NOT EXISTS english_display_cache (
  owner_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, source_hash)
);
