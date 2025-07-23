-- CreateTable
CREATE TABLE `view_event` (
    `p_article_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `event_type` ENUM('impression', 'detail') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`p_article_id`, `user_id`, `event_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `view_event` ADD CONSTRAINT `view_event_p_article_id_fkey` FOREIGN KEY (`p_article_id`) REFERENCES `processed_article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `view_event` ADD CONSTRAINT `view_event_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
