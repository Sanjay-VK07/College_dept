-- AlterTable
ALTER TABLE "AIBatchGenerationJob" ADD COLUMN     "autoPublishedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "regenerationRounds" INTEGER NOT NULL DEFAULT 0;

