/*
  Warnings:

  - Made the column `section` on table `processed_article` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `processed_article` MODIFY `section` ENUM('politics', 'economy', 'society', 'culture', 'tech', 'world') NOT NULL;
