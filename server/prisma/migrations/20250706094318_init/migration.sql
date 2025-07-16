-- CreateTable
CREATE TABLE `article_provider` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `processed_article` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `one_line_summary` TEXT NOT NULL,
    `full_summary` TEXT NOT NULL,
    `language` VARCHAR(30) NOT NULL,
    `region` VARCHAR(30) NULL,
    `section` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider_id` INTEGER NOT NULL,
    `processed_id` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `language` VARCHAR(30) NOT NULL,
    `region` VARCHAR(30) NULL,
    `section` VARCHAR(30) NULL,
    `thumbnail_url` VARCHAR(191) NOT NULL,
    `news_url` VARCHAR(191) NOT NULL,
    `is_processed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `keyword` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `keyword` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `keyword_keyword_key`(`keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `keyword_article_mapping` (
    `p_article_id` INTEGER NOT NULL,
    `keyword_id` INTEGER NOT NULL,

    PRIMARY KEY (`p_article_id`, `keyword_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nickname` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `is_authenticated` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `user_nickname_key`(`nickname`),
    UNIQUE INDEX `user_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `is_revoked` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `refresh_token_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `like` (
    `p_article_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `liked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`p_article_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scrap` (
    `p_article_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `scrapped_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`p_article_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `article_provider`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_processed_id_fkey` FOREIGN KEY (`processed_id`) REFERENCES `processed_article`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `keyword_article_mapping` ADD CONSTRAINT `keyword_article_mapping_p_article_id_fkey` FOREIGN KEY (`p_article_id`) REFERENCES `processed_article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `keyword_article_mapping` ADD CONSTRAINT `keyword_article_mapping_keyword_id_fkey` FOREIGN KEY (`keyword_id`) REFERENCES `keyword`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_token` ADD CONSTRAINT `refresh_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `like` ADD CONSTRAINT `like_p_article_id_fkey` FOREIGN KEY (`p_article_id`) REFERENCES `processed_article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `like` ADD CONSTRAINT `like_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scrap` ADD CONSTRAINT `scrap_p_article_id_fkey` FOREIGN KEY (`p_article_id`) REFERENCES `processed_article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scrap` ADD CONSTRAINT `scrap_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
