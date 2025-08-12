/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `article_provider` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `friendly_name` to the `article_provider` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `article_provider` ADD COLUMN `friendly_name` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `article_provider_name_key` ON `article_provider`(`name`);
