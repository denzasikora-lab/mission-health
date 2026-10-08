ALTER TABLE `journal_messages` ADD `assistant_source` text DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `media_kind` text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `duration_ms` integer;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `frames_json` text DEFAULT '[]' NOT NULL;