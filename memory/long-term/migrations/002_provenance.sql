ALTER TABLE memory_entries ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'memory-record.v1';
ALTER TABLE memory_entries ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '{}';
