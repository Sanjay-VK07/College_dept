-- AlterTable
ALTER TABLE "MockTestQuestion" ADD COLUMN     "questionVersionId" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "QuestionVersion" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "negativeMarks" DOUBLE PRECISION NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" JSONB NOT NULL,
    "explanation" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "QuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionVersion_questionId_idx" ON "QuestionVersion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVersion_questionId_versionNumber_key" ON "QuestionVersion"("questionId", "versionNumber");

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTestQuestion" ADD CONSTRAINT "MockTestQuestion_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

