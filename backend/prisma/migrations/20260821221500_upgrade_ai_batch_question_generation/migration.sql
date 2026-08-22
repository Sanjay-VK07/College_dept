-- AlterTable AIDocument
ALTER TABLE "AIDocument" ADD COLUMN IF NOT EXISTS "classificationConfidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "classificationStatus" TEXT DEFAULT 'REQUIRES_CLASSIFICATION',
ADD COLUMN IF NOT EXISTS "moduleId" TEXT,
ADD COLUMN IF NOT EXISTS "ocrStatus" TEXT DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "subjectId" TEXT,
ADD COLUMN IF NOT EXISTS "subtopicId" TEXT,
ADD COLUMN IF NOT EXISTS "topicId" TEXT;

-- AlterTable AIGeneratedQuestion
ALTER TABLE "AIGeneratedQuestion" ADD COLUMN IF NOT EXISTS "ambiguityDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "generatedAnswer" JSONB,
ADD COLUMN IF NOT EXISTS "provenanceValid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "sourcePageNumbers" JSONB,
ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT DEFAULT 'UNVERIFIED',
ADD COLUMN IF NOT EXISTS "verifiedAnswer" JSONB;

-- CreateTable AIBatchGenerationJob
CREATE TABLE IF NOT EXISTS "AIBatchGenerationJob" (
    "id" TEXT NOT NULL,
    "generationRequestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "validatedCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "pendingReviewCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "statusMessage" TEXT,
    "difficultyDistribution" JSONB,
    "typeDistribution" JSONB,
    "selectedResourceIds" TEXT[],
    "subjectId" TEXT,
    "moduleId" TEXT,
    "topicId" TEXT,
    "subtopicId" TEXT,
    "negativeMarking" BOOLEAN NOT NULL DEFAULT true,
    "solutionVisibility" TEXT NOT NULL DEFAULT 'SHOW_AFTER_RESULT',
    "sourceReferences" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIBatchGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AIBatchGenerationJob_generationRequestId_key" ON "AIBatchGenerationJob"("generationRequestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIBatchGenerationJob_createdById_idx" ON "AIBatchGenerationJob"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIBatchGenerationJob_status_idx" ON "AIBatchGenerationJob"("status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AIBatchGenerationJob_createdById_fkey'
    ) THEN
        ALTER TABLE "AIBatchGenerationJob" ADD CONSTRAINT "AIBatchGenerationJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
