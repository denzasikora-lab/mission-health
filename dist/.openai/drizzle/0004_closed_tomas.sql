CREATE TABLE `journal_text_vectors` (
	`message_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`astronaut_id` text NOT NULL,
	`model` text NOT NULL,
	`vectors_json` text NOT NULL,
	`indexed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `text_vectors_owner_profile_model` ON `journal_text_vectors` (`owner_id`,`astronaut_id`,`model`);