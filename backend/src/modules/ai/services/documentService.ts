import { prisma } from '../../../config/prisma';
import { Role, AIDocumentVisibility, AIDocumentStatus, AIDocument } from '@prisma/client';
import { documentStorageService } from './documentStorageService';
import { DocumentAuthorizationService } from './documentAuthorizationService';
import { validateUploadFile } from '../utils/documentValidation';
import { DocumentMetadataDTO } from '../types/document.types';
import { AuditLogger } from '../../../services/auditLogger';
import { DocumentProcessingService } from './documentProcessingService';

export class DocumentService {
  /**
   * Uploads a document: performs validations, uploads to storage, and writes metadata to database.
   * If database write fails, performs best-effort cleanup of the stored file.
   */
  public static async uploadDocument(params: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    title: string;
    visibility?: AIDocumentVisibility;
    userId: string;
    role: Role;
  }): Promise<DocumentMetadataDTO> {
    const { fileBuffer, fileName, mimeType, title, visibility, userId, role } = params;

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

    // 3. File validation (layered checks: size, extension, MIME, magic bytes)
    const validation = validateUploadFile(fileBuffer, fileName, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file payload.');
    }

    // 4. Upload file to Storage provider
    let storageKey: string;
    try {
      storageKey = await documentStorageService.upload(fileBuffer, fileName, mimeType);
    } catch (storageErr: any) {
      console.error('Storage upload failed:', storageErr);
      throw new Error(`Failed to upload file to storage: ${storageErr.message}`);
    }

    // 5. Create Database record
    try {
      const document = await prisma.aIDocument.create({
        data: {
          title: cleanTitle,
          fileName,
          mimeType,
          fileSize: fileBuffer.length,
          visibility: visibility || AIDocumentVisibility.PRIVATE,
          status: AIDocumentStatus.UPLOADED, // Truthful initial state
          storageKey,
          uploadedById: userId,
        },
      });

      // Audit Log Entry
      await AuditLogger.log({
        userId,
        action: 'UPLOAD_AI_DOCUMENT',
        resource: 'AIDocument',
        details: `Uploaded document "${cleanTitle}" (${fileName}, ${fileBuffer.length} bytes)`,
      });

      // Trigger background text extraction and chunking (Phase 2C)
      DocumentProcessingService.processDocument(document.id).catch((err) => {
        console.error('[DocumentService.uploadDocument] Background processing failed:', err);
      });

      return document;
    } catch (dbErr: any) {
      console.error('Database record creation failed. Cleaning up storage...', dbErr);
      
      // Rollback: Attempt storage cleanup to prevent orphaned files (Case A)
      try {
        await documentStorageService.delete(storageKey);
      } catch (cleanupErr) {
        console.error('Failed to cleanup orphaned storage file:', cleanupErr);
      }

      throw new Error(`Failed to save document metadata: ${dbErr.message}`);
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

    const filePath = await documentStorageService.getAuthorizedAccess(document.storageKey);

    return {
      filePath,
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
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
