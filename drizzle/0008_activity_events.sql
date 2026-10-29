CREATE TABLE `activity_events` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `kind` text NOT NULL,
  `summary` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_owner_time` ON `activity_events` (`owner_id`,`created_at`,`id`);
