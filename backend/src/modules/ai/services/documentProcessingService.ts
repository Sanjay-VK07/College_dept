import fs from 'fs';
import path from 'path';
const pdfParseRaw = require('pdf-parse');
const pdfParse = typeof pdfParseRaw === 'function' ? pdfParseRaw : (pdfParseRaw.default || pdfParseRaw);
import mammoth from 'mammoth';
import { prisma } from '../../../config/prisma';
import { AIDocumentStatus } from '@prisma/client';
import { LocalStorageProvider } from './documentStorageService';
import { EmbeddingFactory } from './embeddingProvider';
import { NotificationController } from '../../../controllers/notificationController';
import { ENV } from '../../../config/env';
import { DocumentOCRService } from './documentOCRService';
import { SyllabusClassificationService } from './syllabusClassificationService';

export class DocumentProcessingService {
  /**
   * Processes a document by reading it, extracting raw text, chunking,
   * calculating embeddings, storing them in PostgreSQL, and transitioning states.
   */
  public static async processDocument(documentId: string): Promise<void> {
    const document = await prisma.aIDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      console.error(`[DocumentProcessingService]: Document with ID ${documentId} not found.`);
      return;
    }

    try {
      // 1. Set Status to PROCESSING
      await prisma.aIDocument.update({
        where: { id: documentId },
        data: {
          status: AIDocumentStatus.PROCESSING,
          processingError: null,
        },
      });

      // 2. Load the file from local storage
      const storageProvider = new LocalStorageProvider();
      const absolutePath = await storageProvider.getAuthorizedAccess(document.storageKey);
      const fileBuffer = await fs.promises.readFile(absolutePath);

      // 3. Extract text according to MIME type
      let extractedText = '';
      const mime = document.mimeType.toLowerCase();

      if (mime === 'application/pdf' || document.fileName.endsWith('.pdf')) {
        try {
          const pdfInstance = new pdfParse.PDFParse(new Uint8Array(fileBuffer));
          const parsed = await pdfInstance.getText();
          extractedText = parsed.text;
        } catch (pdfErr) {
          console.warn(`[DocumentProcessingService] PDF direct text parse failed for ${document.fileName}:`, pdfErr);
        }

        // Extract raw image streams from PDF and save to public uploads directory
        try {
          const uploadDir = path.join(__dirname, '../../../../public/uploads/diagrams');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          let imgIndex = 0;
          let searchOffset = 0;
          while (true) {
            const streamIdx = fileBuffer.indexOf('stream', searchOffset);
            if (streamIdx === -1) break;
            
            const endStreamIdx = fileBuffer.indexOf('endstream', streamIdx);
            if (endStreamIdx === -1) break;
            
            const headerChunk = fileBuffer.slice(Math.max(0, streamIdx - 300), streamIdx).toString();
            
            if (headerChunk.includes('/Subtype /Image') || headerChunk.includes('/Image')) {
              let cleanData = fileBuffer.slice(streamIdx + 6, endStreamIdx);
              if (cleanData[0] === 0x0d && cleanData[1] === 0x0a) {
                cleanData = cleanData.slice(2);
              } else if (cleanData[0] === 0x0a) {
                cleanData = cleanData.slice(1);
              }
              
              if (cleanData[cleanData.length - 1] === 0x0a) {
                cleanData = cleanData.slice(0, -1);
              }
              if (cleanData[cleanData.length - 1] === 0x0d) {
                cleanData = cleanData.slice(0, -1);
              }

              if (cleanData.length > 2000) {
                const imgPath = path.join(uploadDir, `doc_${documentId}_img_${imgIndex}.jpg`);
                fs.writeFileSync(imgPath, cleanData);
                imgIndex++;
              }
            }
            searchOffset = endStreamIdx + 9;
          }
          console.log(`[DocumentProcessingService] Extracted ${imgIndex} embedded diagrams/images from PDF.`);
        } catch (imgErr) {
          console.error('[DocumentProcessingService] Failed to extract PDF images:', imgErr);
        }
      } else if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        document.fileName.endsWith('.docx')
      ) {
        const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = parsed.value;
      } else if (
        mime === 'text/plain' ||
        mime === 'text/markdown' ||
        mime.includes('image/') ||
        document.fileName.endsWith('.txt') ||
        document.fileName.endsWith('.md') ||
        document.fileName.endsWith('.png') ||
        document.fileName.endsWith('.jpg') ||
        document.fileName.endsWith('.jpeg')
      ) {
        extractedText = fileBuffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported MIME type/file extension: ${document.mimeType}`);
      }

      // 3b. OCR Processing for Scanned/Image Documents
      const ocrResult = await DocumentOCRService.processOCR(
        fileBuffer,
        mime,
        document.fileName,
        extractedText
      );

      if (ocrResult.status === 'FAILED') {
        throw new Error(ocrResult.error || 'OCR text extraction failed for scanned resource.');
      }

      extractedText = ocrResult.text;

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No readable text content extracted from document.');
      }

      // 3c. Automatic GATE Syllabus Topic Classification
      const classification = await SyllabusClassificationService.classifyDocumentContent(
        extractedText,
        document.title
      );

      await prisma.aIDocument.update({
        where: { id: documentId },
        data: {
          subjectId: classification.subjectId || null,
          moduleId: classification.moduleId || null,
          topicId: classification.topicId || null,
          subtopicId: classification.subtopicId || null,
          classificationConfidence: classification.classificationConfidence,
          classificationStatus: classification.classificationStatus,
          ocrStatus: ocrResult.status,
        },
      });

      // Hardening: Protect against zip-bombs or massive extracted text
      const maxExtractedTextLength = ENV.MAX_EXTRACTED_TEXT || 500000;
      if (extractedText.length > maxExtractedTextLength) {
        console.warn(`[DocumentProcessingService] Document ${documentId} text length (${extractedText.length}) exceeds limit. Truncating to ${maxExtractedTextLength}.`);
        extractedText = extractedText.substring(0, maxExtractedTextLength);
      }

      // 4. Split text into chunks
      const chunkSize = ENV.CHUNK_SIZE || 500;
      const chunkOverlap = ENV.CHUNK_OVERLAP || 50;
      const rawText = extractedText.replace(/\r\n/g, '\n');
      const chunks: string[] = [];

      let start = 0;
      while (start < rawText.length) {
        const end = Math.min(start + chunkSize, rawText.length);
        const chunkText = rawText.substring(start, end).trim();
        if (chunkText.length > 0) {
          chunks.push(chunkText);
        }
        start += chunkSize - chunkOverlap;
        if (start >= rawText.length - chunkOverlap) break;
      }

      if (chunks.length === 0) {
        throw new Error('Text extraction resulted in 0 text chunks.');
      }

      // Hardening: Enforce maximum chunk count limit per document
      const maxChunks = ENV.MAX_CHUNKS_PER_DOCUMENT || 1000;
      const finalChunks = chunks.length > maxChunks ? chunks.slice(0, maxChunks) : chunks;

      // 5. Generate embeddings and write to database
      const embeddingProvider = EmbeddingFactory.getProvider();

      // Clean up any existing chunks for this document first (safety retry check)
      await prisma.aIDocumentChunk.deleteMany({
        where: { documentId },
      });

      for (let i = 0; i < finalChunks.length; i++) {
        const chunkText = finalChunks[i];
        const tokenCount = Math.ceil(chunkText.length / 4);

        // Generate Embedding Vector
        const vector = await embeddingProvider.getEmbedding(chunkText);

        await prisma.aIDocumentChunk.create({
          data: {
            documentId,
            content: chunkText,
            chunkIndex: i,
            tokenCount,
            embedding: vector,
            metadata: {
              charLength: chunkText.length,
              processedAt: new Date().toISOString(),
              page: Math.floor(i / 5) + 1,
            },
          },
        });
      }

      // 6. Transition status to READY
      await prisma.aIDocument.update({
        where: { id: documentId },
        data: {
          status: AIDocumentStatus.READY,
          processedAt: new Date(),
        },
      });

      // 7. Send notification
      await NotificationController.createSystemNotification(
        'Document processing completed',
        `The document "${document.title}" has been successfully processed and added to the RAG knowledge base.`,
        'success',
        'FACULTY',
        document.uploadedById
      );

      console.log(`[DocumentProcessingService]: Document ${documentId} processed successfully into ${finalChunks.length} chunks.`);

    } catch (error: any) {
      console.error(`[DocumentProcessingService Error]: Fail to process document ${documentId}:`, error);

      // Transition status to FAILED
      await prisma.aIDocument.update({
        where: { id: documentId },
        data: {
          status: AIDocumentStatus.FAILED,
          processingError: error.message || 'Unknown processing error',
        },
      });

      // Send notification
      await NotificationController.createSystemNotification(
        'Document processing failed',
        `Failed to process document "${document.title}": ${error.message || 'Unknown error'}`,
        'error',
        'FACULTY',
        document.uploadedById
      );
    }
  }

  /**
   * Recovers stale document processing jobs stuck in PROCESSING status > 10 minutes.
   */
  public static async recoverStaleJobs(): Promise<number> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const staleDocs = await prisma.aIDocument.findMany({
      where: {
        status: AIDocumentStatus.PROCESSING,
        updatedAt: { lt: tenMinutesAgo },
      },
    });

    for (const doc of staleDocs) {
      try {
        await prisma.aIDocument.update({
          where: { id: doc.id },
          data: {
            status: AIDocumentStatus.FAILED,
            processingError: 'Processing timed out (stale job recovered). You may retry processing.',
          },
        });
      } catch (e) {}
    }

    if (staleDocs.length > 0) {
      console.log(`[DocumentProcessingService]: Recovered ${staleDocs.length} stale document processing jobs.`);
    }

    return staleDocs.length;
  }
}
