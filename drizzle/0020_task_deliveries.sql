CREATE TABLE IF NOT EXISTS task_deliveries (
  owner_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  due_key TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (owner_id, task_id, due_key)
);
CREATE INDEX IF NOT EXISTS tasks_status_due ON personal_tasks(status, due_at, owner_id);
