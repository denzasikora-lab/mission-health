CREATE TABLE chat_clear_state (
  owner_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE chat_cleared_messages (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  vector_pending INTEGER NOT NULL DEFAULT 1,
  retry_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX chat_vectors_to_clear ON chat_cleared_messages(vector_pending,retry_at,owner_id);
ALTER TABLE task_deliveries ADD COLUMN delivered_at TEXT;
UPDATE task_deliveries SET delivered_at=(SELECT m.created_at FROM general_chat_messages m WHERE m.id=task_deliveries.message_id AND m.owner_id=task_deliveries.owner_id);
