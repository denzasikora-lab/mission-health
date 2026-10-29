ALTER TABLE journal_messages ADD COLUMN wellbeing_json text;
--> statement-breakpoint
CREATE TABLE general_chat_messages (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at text NOT NULL,
  reply_to text,
  wellbeing_json text
);
--> statement-breakpoint
CREATE INDEX general_chat_owner_time ON general_chat_messages (owner_id,created_at,id);
--> statement-breakpoint
CREATE UNIQUE INDEX general_chat_owner_reply ON general_chat_messages (owner_id,reply_to) WHERE reply_to IS NOT NULL;
--> statement-breakpoint
CREATE TABLE personal_favorites (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  profile_id text,
  content text NOT NULL,
  source_created_at text NOT NULL,
  created_at text NOT NULL,
  wellbeing_json text
);
--> statement-breakpoint
CREATE UNIQUE INDEX favorites_owner_source ON personal_favorites (owner_id,source_type,source_id);
--> statement-breakpoint
CREATE INDEX favorites_owner_time ON personal_favorites (owner_id,created_at,id);
