import { AIDocumentVisibility, AIDocumentStatus } from '@prisma/client';

export interface DocumentMetadataDTO {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  visibility: AIDocumentVisibility;
  status: AIDocumentStatus;
  uploadedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDocumentsQueryDTO {
  page?: number;
  limit?: number;
  visibility?: AIDocumentVisibility;
  search?: string;
}

export interface ListDocumentsResponseDTO {
  success: boolean;
  data: DocumentMetadataDTO[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface UploadDocumentBodyDTO {
  title: string;
  visibility?: AIDocumentVisibility;
}

export interface DocumentStorageProvider {
  /**
   * Uploads a file to storage and returns a unique storageKey.
   */
  upload(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string>;

  /**
   * Uploads a file from disk path directly to storage.
   */
  uploadFromPath?(tempFilePath: string, fileName: string, mimeType: string): Promise<string>;

  /**
   * Generates a temporary access/stream URL or returns the file path for authorized access.
   */
  getAuthorizedAccess(storageKey: string): Promise<string>;

  /**
   * Checks if a file exists in physical storage.
   */
  fileExists(storageKey: string): Promise<boolean>;

  /**
   * Deletes the file from storage.
   */
  delete(storageKey: string): Promise<void>;
}
