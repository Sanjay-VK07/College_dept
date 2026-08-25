import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility, AIDocumentStatus, AIDocument } from '@prisma/client';
import { documentStorageService } from './documentStorageService';
import { DocumentAuthorizationService } from './documentAuthorizationService';
import { validateUploadFile, validateUploadDiskFile, computeFileChecksum, computeFileChecksumFromPath, safeDeleteFile, MAX_DOCUMENT_UPLOAD_SIZE } from '../utils/documentValidation';
import { DocumentMetadataDTO } from '../types/document.types';
import { AuditLogger } from '../../../services/auditLogger';
import { DocumentProcessingService } from './documentProcessingService';

import { VectorCache } from './vectorCache';

export class DocumentService {
  /**
   * Uploads a document: performs validations, uploads to storage, and writes metadata to database.
   * Supports disk-based Multer storage (0 MB RAM overhead) and buffer fallback.
   */
  public static async uploadDocument(params: {
    file?: Express.Multer.File;
    fileBuffer?: Buffer;
    fileName: string;
    mimeType: string;
    title: string;
    visibility?: AIDocumentVisibility;
    userId: string;
    role: Role;
  }): Promise<DocumentMetadataDTO> {
    const { file, fileBuffer, fileName, mimeType, title, visibility, userId, role } = params;

    const cleanupTempFile = () => {
      if (file?.path) {
        safeDeleteFile(file.path);
      }
    };

    try {
      // 1. Authorization check
      if (!DocumentAuthorizationService.canUpload(role)) {
        throw new Error('Forbidden: Your role is not authorized to upload documents.');
      }

      // 2. Metadata payload validation
      const cleanTitle = title?.trim();
      if (!cleanTitle) {
        throw new Error('Document title is required.');
      }
      if (cleanTitle.length > 255) {
        throw new Error('Document title must not exceed 255 characters.');
      }

      let fileSize = file ? file.size : fileBuffer ? fileBuffer.length : 0;

      // 3. File validation (disk-based or buffer)
      if (file?.path) {
        const validation = validateUploadDiskFile(file.path, fileSize, fileName, mimeType);
        if (!validation.valid) {
          const err = new Error(validation.error || 'Invalid file payload.');
          (err as any).status = validation.status || 400;
          throw err;
        }
      } else if (fileBuffer && fileBuffer.length > 0) {
        const validation = validateUploadFile(fileBuffer, fileName, mimeType);
        if (!validation.valid) {
          const err = new Error(validation.error || 'Invalid file payload.');
          (err as any).status = fileBuffer.length > MAX_DOCUMENT_UPLOAD_SIZE ? 413 : 400;
          throw err;
        }
      } else {
        const err = new Error('File is empty or missing content.');
        (err as any).status = 400;
        throw err;
      }

      const checksum = file?.path
        ? await computeFileChecksumFromPath(file.path)
        : computeFileChecksum(fileBuffer!);

      // 3.5 Duplicate Document Check per user
      const existingDoc = await prisma.aIDocument.findFirst({
        where: {
          uploadedById: userId,
          fileSize,
          status: { not: AIDocumentStatus.FAILED },
          title: cleanTitle,
        },
      });

      if (existingDoc) {
        const err = new Error(`Duplicate document upload detected. A document named "${cleanTitle}" with identical size already exists.`);
        (err as any).status = 409;
        (err as any).code = 'DUPLICATE_DOCUMENT';
        throw err;
      }

      // 4. Upload file to Storage provider (disk copy or buffer write)
      let storageKey: string;
      if (file?.path && documentStorageService.uploadFromPath) {
        storageKey = await documentStorageService.uploadFromPath(file.path, fileName, mimeType);
      } else {
        storageKey = await documentStorageService.upload(fileBuffer!, fileName, mimeType);
      }

      // 5. Create Database record
      const document = await prisma.aIDocument.create({
        data: {
          title: cleanTitle,
          fileName,
          mimeType,
          fileSize,
          visibility: visibility || AIDocumentVisibility.PRIVATE,
          status: AIDocumentStatus.UPLOADED, // Truthful initial state
          storageKey,
          uploadedById: userId,
        },
      });

      // Invalidate in-memory vector cache on document creation
      VectorCache.invalidate(`UPLOAD_DOCUMENT_${document.id}`);

      // Audit Log Entry
      await AuditLogger.log({
        userId,
        action: 'UPLOAD_AI_DOCUMENT',
        resource: 'AIDocument',
        details: `Uploaded document "${cleanTitle}" (${fileName}, ${fileSize} bytes)`,
      });

      // Trigger background text extraction and chunking (Phase 2C)
      DocumentProcessingService.processDocument(document.id).catch((err) => {
        console.error('[DocumentService.uploadDocument] Background processing failed:', err);
      });

      return document;
    } catch (err: any) {
      cleanupTempFile();
      throw err;
    }
  }

  /**
   * Lists and paginates authorized documents, applying strict visibility filtering at the DB query level.
   */
  public static async listDocuments(params: {
    userId: string;
    role: Role;
    page?: number;
    limit?: number;
    visibility?: AIDocumentVisibility;
    search?: string;
  }) {
    const { userId, role, page = 1, limit = 10, visibility, search } = params;

    const skip = (page - 1) * limit;

    // Get strict visibility filters based on authorization policy
    const visibilityFilter = DocumentAuthorizationService.getVisibilityFilter(userId, role);

    // Build the query where clause
    const where: any = {
      AND: [
        visibilityFilter,
        visibility ? { visibility } : {},
        search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                { fileName: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {},
      ],
    };

    const [total, documents] = await Promise.all([
      prisma.aIDocument.count({ where }),
      prisma.aIDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          visibility: true,
          status: true,
          uploadedById: true,
          createdAt: true,
          updatedAt: true,
          processingError: true,
          // Included so a resource listing can show real uploader names and real extraction
          // progress (pages processed, questions/answers detected) without the client having to
          // issue one extra status request per document.
          uploadedBy: { select: { name: true } },
          processingJob: {
            select: {
              status: true,
              statusMessage: true,
              totalPages: true,
              pagesProcessed: true,
              questionsFound: true,
              answersFound: true,
              mappingsResolved: true,
              mappingsUncertain: true,
              error: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      data: documents,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single document metadata if authorized.
   */
  public static async getDocumentById(params: {
    documentId: string;
    userId: string;
    role: Role;
  }): Promise<DocumentMetadataDTO> {
    const { documentId, userId, role } = params;

    const document = await prisma.aIDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found or unavailable.');
    }

    if (!DocumentAuthorizationService.canAccess(userId, role, document)) {
      throw new Error('Access denied: You do not have permission to view this document.');
    }

    return document;
  }

  /**
   * Returns the file path for downloading / streaming if authorized.
   */
  public static async getDownloadFilePath(params: {
    documentId: string;
    userId: string;
    role: Role;
  }): Promise<{ filePath: string; fileName: string; mimeType: string }> {
    const { documentId, userId, role } = params;

    const document = await prisma.aIDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found or unavailable.');
    }

    if (!DocumentAuthorizationService.canAccess(userId, role, document)) {
      throw new Error('Access denied: You do not have permission to download this document.');
    }

    const exists = await documentStorageService.fileExists(document.storageKey);
    if (!exists) {
      throw new Error('DOCUMENT_STORAGE_MISSING: The physical document file could not be found in storage.');
    }

    const filePath = await documentStorageService.getAuthorizedAccess(document.storageKey);

    return {
      filePath,
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
  }

  /**
   * Helper method to check if a document's storage file exists.
   */
  public static async verifyStorageExists(storageKey: string): Promise<boolean> {
    return await documentStorageService.fileExists(storageKey);
  }

  /**
   * Deletes database record and deletes file from storage.
   */
  public static async deleteDocument(params: {
    documentId: string;
    userId: string;
    role: Role;
  }): Promise<void> {
    const { documentId, userId, role } = params;

    const document = await prisma.aIDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found.');
    }

    // Authorization check
    if (!DocumentAuthorizationService.canDelete(userId, role, document)) {
      throw new Error('Access denied: You do not have permission to delete this document.');
    }

    // Delete database record first (Prisma handles cascading chunk deletion automatically)
    await prisma.aIDocument.delete({
      where: { id: documentId },
    });

    // Invalidate in-memory vector cache on document deletion
    VectorCache.invalidate(`DELETE_DOCUMENT_${documentId}`);

    // Delete from storage
    try {
      await documentStorageService.delete(document.storageKey);
    } catch (storageErr) {
      // Best effort cleanup: log error but keep db deleted
      console.error(`Failed to delete storage file '${document.storageKey}':`, storageErr);
    }

    // Audit Log Entry
    await AuditLogger.log({
      userId,
      action: 'DELETE_AI_DOCUMENT',
      resource: 'AIDocument',
      details: `Deleted document "${document.title}" (ID: ${documentId})`,
    });
  }
}
