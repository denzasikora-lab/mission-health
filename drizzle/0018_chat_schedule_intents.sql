CREATE TABLE IF NOT EXISTS chat_schedule_intents (
  owner_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  PRIMARY KEY (owner_id, message_id)
);
