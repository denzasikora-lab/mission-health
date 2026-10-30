CREATE TABLE `personal_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_message_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`due_at` text,
	`time_zone` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_owner_source_ordinal` ON `personal_tasks` (`owner_id`,`source_message_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `tasks_owner_due` ON `personal_tasks` (`owner_id`,`status`,`due_date`,`due_at`);--> statement-breakpoint
