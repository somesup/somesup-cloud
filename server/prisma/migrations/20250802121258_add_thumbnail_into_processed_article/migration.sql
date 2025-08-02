/*
  Warnings:

  - Added the required column `thumbnail_url` to the `processed_article` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `article` MODIFY `thumbnail_url` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `processed_article` ADD COLUMN `thumbnail_url` TEXT NOT NULL;
