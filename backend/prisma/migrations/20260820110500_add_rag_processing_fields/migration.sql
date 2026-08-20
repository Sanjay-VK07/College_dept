-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "AIDocumentVisibility" ADD VALUE 'STUDENT';
ALTER TYPE "AIDocumentVisibility" ADD VALUE 'FACULTY';
ALTER TYPE "AIDocumentVisibility" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "AIDocument" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT,
ALTER COLUMN "fileSize" DROP NOT NULL,
ALTER COLUMN "visibility" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AIDocumentChunk" ADD COLUMN     "embedding" DOUBLE PRECISION[],
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "tokenCount" INTEGER;

-- CreateIndex
CREATE INDEX "AIDocument_status_idx" ON "AIDocument"("status");

-- CreateIndex
CREATE INDEX "AIDocument_visibility_idx" ON "AIDocument"("visibility");

-- CreateIndex
CREATE INDEX "AIDocument_uploadedById_idx" ON "AIDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "AIDocumentChunk_documentId_idx" ON "AIDocumentChunk"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "AIDocumentChunk_documentId_chunkIndex_key" ON "AIDocumentChunk"("documentId", "chunkIndex");
