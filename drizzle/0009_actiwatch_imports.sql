CREATE TABLE `actiwatch_imports` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `digest` text NOT NULL,
  `filename` text NOT NULL,
  `object_key` text NOT NULL,
  `summary_json` text NOT NULL,
  `recorded_end` text NOT NULL,
  `diary_message_id` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actiwatch_owner_digest` ON `actiwatch_imports` (`owner_id`,`digest`);
--> statement-breakpoint
CREATE INDEX `actiwatch_owner_end` ON `actiwatch_imports` (`owner_id`,`recorded_end`,`created_at`);
