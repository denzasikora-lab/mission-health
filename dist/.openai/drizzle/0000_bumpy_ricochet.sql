CREATE TABLE `journal_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`astronaut_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL,
	`vector_status` text DEFAULT 'pending' NOT NULL,
	`reply_to` text,
	`references_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_owner_astronaut_time` ON `journal_messages` (`owner_id`,`astronaut_id`,`created_at`);