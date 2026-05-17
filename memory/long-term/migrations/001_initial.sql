CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_entries_namespace_key
  ON memory_entries(namespace, key);

CREATE INDEX IF NOT EXISTS memory_entries_namespace
  ON memory_entries(namespace);
