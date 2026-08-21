-- CreateEnum
CREATE TYPE "AIRAGDecision" AS ENUM ('USED', 'SKIPPED_GENERAL_KNOWLEDGE', 'SKIPPED_NO_DOCUMENTS', 'RETRIEVAL_NO_RELEVANT', 'FAILED');

-- CreateEnum
CREATE TYPE "AIRAGTraceStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'NO_RELEVANT_CONTEXT', 'AI_RAG_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AIRAGQualityClassification" AS ENUM ('HIGH_CONFIDENCE', 'MEDIUM_CONFIDENCE', 'LOW_CONFIDENCE', 'NO_RELEVANT_CONTEXT', 'RETRIEVAL_FAILED');

-- CreateEnum
CREATE TYPE "AIFeedbackRating" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- CreateEnum
CREATE TYPE "AIFeedbackCategory" AS ENUM ('INCORRECT', 'NOT_RELEVANT', 'INSUFFICIENT_CONTEXT', 'GOOD_ANSWER', 'OTHER');

-- CreateTable
CREATE TABLE "AIRAGTrace" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "assistantMessageId" TEXT,
    "ragDecision" "AIRAGDecision" NOT NULL,
    "ragUsed" BOOLEAN NOT NULL DEFAULT false,
    "status" "AIRAGTraceStatus" NOT NULL DEFAULT 'PROCESSING',
    "embeddingDurationMs" INTEGER NOT NULL DEFAULT 0,
    "vectorSearchDurationMs" INTEGER NOT NULL DEFAULT 0,
    "contextAssemblyDurationMs" INTEGER NOT NULL DEFAULT 0,
    "providerDurationMs" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "authorizedChunksFound" INTEGER NOT NULL DEFAULT 0,
    "relevantChunksUsed" INTEGER NOT NULL DEFAULT 0,
    "sourceDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION,
    "qualityClassification" "AIRAGQualityClassification",
    "fallbackReason" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRAGTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIFeedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "AIFeedbackRating" NOT NULL,
    "category" "AIFeedbackCategory",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIRAGTrace_requestId_key" ON "AIRAGTrace"("requestId");

-- CreateIndex
CREATE INDEX "AIRAGTrace_conversationId_idx" ON "AIRAGTrace"("conversationId");

-- CreateIndex
CREATE INDEX "AIRAGTrace_userId_idx" ON "AIRAGTrace"("userId");

-- CreateIndex
CREATE INDEX "AIRAGTrace_createdAt_idx" ON "AIRAGTrace"("createdAt");

-- CreateIndex
CREATE INDEX "AIRAGTrace_status_idx" ON "AIRAGTrace"("status");

-- CreateIndex
CREATE INDEX "AIRAGTrace_ragUsed_idx" ON "AIRAGTrace"("ragUsed");

-- CreateIndex
CREATE INDEX "AIFeedback_userId_idx" ON "AIFeedback"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AIFeedback_messageId_userId_key" ON "AIFeedback"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "AIRAGTrace" ADD CONSTRAINT "AIRAGTrace_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRAGTrace" ADD CONSTRAINT "AIRAGTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRAGTrace" ADD CONSTRAINT "AIRAGTrace_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "AIMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRAGTrace" ADD CONSTRAINT "AIRAGTrace_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "AIMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AIMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
