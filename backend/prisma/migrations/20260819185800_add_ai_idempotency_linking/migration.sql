-- CreateEnum
CREATE TYPE "AIRequestStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "AIMessage" ADD COLUMN     "parentUserMessageId" TEXT,
ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "status" "AIRequestStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateIndex
CREATE UNIQUE INDEX "AIMessage_parentUserMessageId_key" ON "AIMessage"("parentUserMessageId");

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_parentUserMessageId_fkey" FOREIGN KEY ("parentUserMessageId") REFERENCES "AIMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
