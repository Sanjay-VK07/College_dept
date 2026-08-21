-- CreateEnum
CREATE TYPE "AISolutionStatus" AS ENUM ('GENERATED', 'VERIFYING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AISolutionVerificationStatus" AS ENUM ('UNVERIFIED', 'PASS', 'FAIL', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "AIExamDraftStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "AISolution" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "generationRequestId" TEXT NOT NULL,
    "draftAnswer" JSONB NOT NULL,
    "draftExplanation" TEXT NOT NULL,
    "verifiedAnswer" JSONB,
    "verifiedExplanation" TEXT,
    "status" "AISolutionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "verificationStatus" "AISolutionVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "qualityScore" DOUBLE PRECISION,
    "sourceDocumentIds" TEXT[],
    "sourceChunkIds" TEXT[],
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExamAssemblyTrace" (
    "id" TEXT NOT NULL,
    "examGenerationRequestId" TEXT NOT NULL,
    "mockTestId" TEXT,
    "generatedById" TEXT NOT NULL,
    "subjectId" TEXT,
    "requestedQuestionCount" INTEGER NOT NULL,
    "selectedQuestionCount" INTEGER NOT NULL,
    "requestedDifficulty" JSONB,
    "actualDifficultyDistribution" JSONB,
    "topicCoverage" JSONB,
    "status" "AIExamDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "validationStatus" TEXT,
    "assemblyDurationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIExamAssemblyTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AISolution_generationRequestId_key" ON "AISolution"("generationRequestId");

-- CreateIndex
CREATE INDEX "AISolution_questionId_idx" ON "AISolution"("questionId");

-- CreateIndex
CREATE INDEX "AISolution_status_idx" ON "AISolution"("status");

-- CreateIndex
CREATE INDEX "AISolution_generatedById_idx" ON "AISolution"("generatedById");

-- CreateIndex
CREATE UNIQUE INDEX "AIExamAssemblyTrace_examGenerationRequestId_key" ON "AIExamAssemblyTrace"("examGenerationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AIExamAssemblyTrace_mockTestId_key" ON "AIExamAssemblyTrace"("mockTestId");

-- CreateIndex
CREATE INDEX "AIExamAssemblyTrace_generatedById_idx" ON "AIExamAssemblyTrace"("generatedById");

-- CreateIndex
CREATE INDEX "AIExamAssemblyTrace_status_idx" ON "AIExamAssemblyTrace"("status");

-- CreateIndex
CREATE INDEX "AIExamAssemblyTrace_createdAt_idx" ON "AIExamAssemblyTrace"("createdAt");

-- AddForeignKey
ALTER TABLE "AISolution" ADD CONSTRAINT "AISolution_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISolution" ADD CONSTRAINT "AISolution_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExamAssemblyTrace" ADD CONSTRAINT "AIExamAssemblyTrace_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExamAssemblyTrace" ADD CONSTRAINT "AIExamAssemblyTrace_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
