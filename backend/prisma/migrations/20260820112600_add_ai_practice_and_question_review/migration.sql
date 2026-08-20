-- CreateEnum
CREATE TYPE "AIQuestionReviewStatus" AS ENUM ('AI_DRAFT', 'REVIEWED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "generationModel" TEXT,
ADD COLUMN     "reviewStatus" "AIQuestionReviewStatus";

-- CreateTable
CREATE TABLE "QuestionAISource" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAISource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPracticeAttempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIPracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionAISource_questionId_idx" ON "QuestionAISource"("questionId");

-- CreateIndex
CREATE INDEX "QuestionAISource_documentId_idx" ON "QuestionAISource"("documentId");

-- AddForeignKey
ALTER TABLE "QuestionAISource" ADD CONSTRAINT "QuestionAISource_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAISource" ADD CONSTRAINT "QuestionAISource_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AIDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPracticeAttempt" ADD CONSTRAINT "AIPracticeAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
