-- CreateTable
CREATE TABLE `user_article_section_preference` (
    `user_id` INTEGER NOT NULL,
    `section_id` INTEGER NOT NULL,
    `preference` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`user_id`, `section_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_article_section_preference` ADD CONSTRAINT `user_article_section_preference_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_article_section_preference` ADD CONSTRAINT `user_article_section_preference_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `article_section`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
