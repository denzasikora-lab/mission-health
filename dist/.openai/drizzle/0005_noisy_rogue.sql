CREATE TABLE `journal_training_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`astronaut_id` text NOT NULL,
	`status` text NOT NULL,
	`example_count` integer NOT NULL,
	`progress_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `training_owner_profile_time` ON `journal_training_jobs` (`owner_id`,`astronaut_id`,`created_at`);