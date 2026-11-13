ALTER TABLE general_chat_messages ADD COLUMN health_context_json text;
--> statement-breakpoint
CREATE TABLE health_analyses (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  snapshot_json text NOT NULL,
  rules_json text NOT NULL,
  result_json text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  lease_until integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX health_analyses_owner_time ON health_analyses (owner_id,created_at,id);
