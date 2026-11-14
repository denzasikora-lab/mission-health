CREATE TABLE health_readings (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  snapshot_json text NOT NULL,
  source_name text NOT NULL,
  created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX health_readings_owner_time ON health_readings (owner_id,created_at,id);
