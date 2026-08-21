-- CreateEnum
CREATE TYPE "AIGeneratedQuestionStatus" AS ENUM ('GENERATED', 'VALIDATED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AIQuestionQualityStatus" AS ENUM ('PASS', 'REVIEW', 'REJECT');

-- CreateEnum
CREATE TYPE "AIQuestionSimilarityStatus" AS ENUM ('UNIQUE', 'SIMILAR', 'DUPLICATE');

-- CreateTable
CREATE TABLE "AIGeneratedQuestion" (
    "id" TEXT NOT NULL,
    "generationRequestId" TEXT,
    "stem" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
    "options" JSONB,
    "correctAnswer" JSONB NOT NULL,
    "explanation" TEXT,
    "subjectId" TEXT,
    "moduleId" TEXT,
    "topicId" TEXT,
    "subtopicId" TEXT,
    "status" "AIGeneratedQuestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "qualityStatus" "AIQuestionQualityStatus" NOT NULL DEFAULT 'REVIEW',
    "qualityScore" DOUBLE PRECISION,
    "similarityStatus" "AIQuestionSimilarityStatus" NOT NULL DEFAULT 'UNIQUE',
    "similarQuestionId" TEXT,
    "sourceDocumentIds" TEXT[],
    "sourceChunkIds" TEXT[],
    "createdQuestionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIGeneratedQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIQuestionGenerationTrace" (
    "id" TEXT NOT NULL,
    "generationRequestId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "subjectId" TEXT,
    "moduleId" TEXT,
    "topicId" TEXT,
    "subtopicId" TEXT,
    "questionType" "QuestionType",
    "requestedDifficulty" "Difficulty",
    "requestedCount" INTEGER NOT NULL DEFAULT 1,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "validationStatus" TEXT,
    "qualityStatus" TEXT,
    "sourceDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "sourceChunkCount" INTEGER NOT NULL DEFAULT 0,
    "generationDurationMs" INTEGER NOT NULL DEFAULT 0,
    "verificationDurationMs" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIQuestionGenerationTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIGeneratedQuestion_createdQuestionId_key" ON "AIGeneratedQuestion"("createdQuestionId");

-- CreateIndex
CREATE INDEX "AIGeneratedQuestion_status_idx" ON "AIGeneratedQuestion"("status");

-- CreateIndex
CREATE INDEX "AIGeneratedQuestion_createdById_idx" ON "AIGeneratedQuestion"("createdById");

-- CreateIndex
CREATE INDEX "AIGeneratedQuestion_generationRequestId_idx" ON "AIGeneratedQuestion"("generationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AIQuestionGenerationTrace_generationRequestId_key" ON "AIQuestionGenerationTrace"("generationRequestId");

-- CreateIndex
CREATE INDEX "AIQuestionGenerationTrace_generatedById_idx" ON "AIQuestionGenerationTrace"("generatedById");

-- CreateIndex
CREATE INDEX "AIQuestionGenerationTrace_createdAt_idx" ON "AIQuestionGenerationTrace"("createdAt");

-- AddForeignKey
ALTER TABLE "AIGeneratedQuestion" ADD CONSTRAINT "AIGeneratedQuestion_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedQuestion" ADD CONSTRAINT "AIGeneratedQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIQuestionGenerationTrace" ADD CONSTRAINT "AIQuestionGenerationTrace_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
