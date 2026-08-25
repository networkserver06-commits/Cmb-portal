CREATE TABLE `activityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80),
	`entityId` int,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`message` text NOT NULL,
	`severity` enum('info','warning','emergency') NOT NULL DEFAULT 'info',
	`isActive` boolean NOT NULL DEFAULT true,
	`startsAt` timestamp NOT NULL DEFAULT (now()),
	`endsAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entitlementId` int NOT NULL,
	`userId` int NOT NULL,
	`paperId` int NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` text,
	`downloadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `downloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`paperId` int NOT NULL,
	`orderId` int,
	`source` enum('purchase','manual') NOT NULL DEFAULT 'purchase',
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entitlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `entitlements_user_paper_idx` UNIQUE(`userId`,`paperId`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`paperId` int NOT NULL,
	`reference` varchar(120) NOT NULL,
	`amountKes` decimal(10,2) NOT NULL,
	`status` enum('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`course` varchar(160) NOT NULL,
	`level` varchar(80) NOT NULL,
	`cycle` varchar(80) NOT NULL,
	`unit` varchar(160) NOT NULL,
	`paperType` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`priceKes` decimal(10,2) NOT NULL,
	`isAvailable` boolean NOT NULL DEFAULT true,
	`isFeatured` boolean NOT NULL DEFAULT false,
	`accessMode` enum('purchase','manual','disabled') NOT NULL DEFAULT 'purchase',
	`fileKey` varchar(512),
	`fileName` varchar(255),
	`fileMimeType` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `papers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(40) NOT NULL DEFAULT 'paystack',
	`providerReference` varchar(120) NOT NULL,
	`channel` varchar(80),
	`amountKes` decimal(10,2) NOT NULL,
	`status` varchar(40) NOT NULL,
	`rawEvent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_providerReference_unique` UNIQUE(`providerReference`),
	CONSTRAINT `payments_order_idx` UNIQUE(`orderId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`userId`);--> statement-breakpoint
CREATE INDEX `papers_catalog_idx` ON `papers` (`course`,`level`,`cycle`,`unit`);