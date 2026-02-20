CREATE TABLE `integrations_config` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`service` text NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`date` text NOT NULL,
	`meeting_type` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text DEFAULT 'single' NOT NULL,
	`char_count` integer DEFAULT 0 NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`name` text,
	`email` text,
	`avatar_url` text,
	`created_at` text NOT NULL
);
