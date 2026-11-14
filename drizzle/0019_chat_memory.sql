ALTER TABLE general_chat_messages ADD COLUMN vector_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE general_chat_messages ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE general_chat_messages ADD COLUMN time_zone TEXT;
ALTER TABLE general_chat_messages ADD COLUMN references_json TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS general_chat_pending ON general_chat_messages(owner_id, role, vector_status, created_at);
