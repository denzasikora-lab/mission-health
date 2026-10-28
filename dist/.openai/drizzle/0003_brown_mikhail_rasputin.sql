CREATE TABLE `personal_stories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`author_name` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`media_kind` text NOT NULL,
	`object_key` text NOT NULL,
	`poster_key` text,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`duration_ms` integer,
	`digest` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stories_owner_time` ON `personal_stories` (`owner_id`,`created_at`);