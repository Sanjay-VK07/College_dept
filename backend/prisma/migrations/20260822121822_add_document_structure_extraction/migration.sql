-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "rawText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "pageType" TEXT,
    "classificationConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedQuestion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rawQuestionId" TEXT NOT NULL,
    "normalizedQuestionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" JSONB,
    "questionType" TEXT,
    "sourcePageId" TEXT NOT NULL,
    "imageRefs" TEXT[],
    "answerMappingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "mappedAnswerId" TEXT,
    "extractionConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedAnswer" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rawQuestionId" TEXT NOT NULL,
    "normalizedQuestionId" TEXT NOT NULL,
    "answerValue" JSONB NOT NULL,
    "explanation" TEXT,
    "sourcePageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentProcessingJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "statusMessage" TEXT,
    "totalPages" INTEGER,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "questionsFound" INTEGER NOT NULL DEFAULT 0,
    "answersFound" INTEGER NOT NULL DEFAULT 0,
    "mappingsResolved" INTEGER NOT NULL DEFAULT 0,
    "mappingsUncertain" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPage_documentId_idx" ON "DocumentPage"("documentId");

-- CreateIndex
CREATE INDEX "DocumentPage_pageType_idx" ON "DocumentPage"("pageType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "ExtractedQuestion_documentId_idx" ON "ExtractedQuestion"("documentId");

-- CreateIndex
CREATE INDEX "ExtractedQuestion_normalizedQuestionId_idx" ON "ExtractedQuestion"("normalizedQuestionId");

-- CreateIndex
CREATE INDEX "ExtractedQuestion_answerMappingStatus_idx" ON "ExtractedQuestion"("answerMappingStatus");

-- CreateIndex
CREATE INDEX "ExtractedAnswer_documentId_idx" ON "ExtractedAnswer"("documentId");

-- CreateIndex
CREATE INDEX "ExtractedAnswer_normalizedQuestionId_idx" ON "ExtractedAnswer"("normalizedQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentProcessingJob_documentId_key" ON "DocumentProcessingJob"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AIDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedQuestion" ADD CONSTRAINT "ExtractedQuestion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AIDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedQuestion" ADD CONSTRAINT "ExtractedQuestion_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedQuestion" ADD CONSTRAINT "ExtractedQuestion_mappedAnswerId_fkey" FOREIGN KEY ("mappedAnswerId") REFERENCES "ExtractedAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedAnswer" ADD CONSTRAINT "ExtractedAnswer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AIDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedAnswer" ADD CONSTRAINT "ExtractedAnswer_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AIDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

