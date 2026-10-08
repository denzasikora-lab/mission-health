CREATE TABLE `journal_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`astronaut_id` text NOT NULL,
	`region` text NOT NULL,
	`region_key` text NOT NULL,
	`created_at` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`digest` text NOT NULL,
	`vector_status` text DEFAULT 'pending' NOT NULL,
	`model` text,
	`vector_json` text
);
--> statement-breakpoint
CREATE INDEX `photos_owner_profile_region_time` ON `journal_photos` (`owner_id`,`astronaut_id`,`region_key`,`created_at`);--> statement-breakpoint
ALTER TABLE `journal_messages` ADD `attachments_json` text DEFAULT '[]' NOT NULL;