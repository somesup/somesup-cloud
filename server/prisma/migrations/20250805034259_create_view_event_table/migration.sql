-- CreateTable
CREATE TABLE `article_view_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `p_article_id` INTEGER NOT NULL,
    `event_type` ENUM('VIEW', 'DETAIL_VIEW') NOT NULL,
    `event_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `article_view_event` ADD CONSTRAINT `article_view_event_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_view_event` ADD CONSTRAINT `article_view_event_p_article_id_fkey` FOREIGN KEY (`p_article_id`) REFERENCES `processed_article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
