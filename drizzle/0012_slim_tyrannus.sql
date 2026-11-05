CREATE TABLE `chat_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`room` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_files_owner_room` ON `chat_files` (`owner_id`,`room`);--> statement-breakpoint
CREATE TABLE `team_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`author_name` text NOT NULL,
	`content` text NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_chat_time` ON `team_chat_messages` (`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `general_chat_messages` ADD `attachments_json` text DEFAULT '[]' NOT NULL;