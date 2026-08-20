import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DocumentStorageProvider } from '../types/document.types';
import { sanitizeFileName } from '../utils/documentValidation';

export class LocalStorageProvider implements DocumentStorageProvider {
  private baseDir: string;

  constructor() {
    // Files will be stored in backend/uploads/ai-documents
    this.baseDir = path.resolve(process.cwd(), 'uploads', 'ai-documents');
    this.ensureDirectoryExists(this.baseDir);
  }

  /**
   * Uploads file to local disk under baseDir/uuid/sanitizedFileName.
   * Returns the storageKey (relative path: uuid/sanitizedFileName).
   */
  public async upload(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const docId = crypto.randomUUID();
    const sanitizedName = sanitizeFileName(fileName);
    
    // Directory for this specific document
    const docDir = path.join(this.baseDir, docId);
    this.ensureDirectoryExists(docDir);

    const filePath = path.join(docDir, sanitizedName);
    
    // Write file to disk
    await fs.promises.writeFile(filePath, fileBuffer);

    // Return relative storageKey
    return path.join(docId, sanitizedName);
  }

  /**
   * Returns the absolute path of the local file for authorized streaming/reading.
   */
  public async getAuthorizedAccess(storageKey: string): Promise<string> {
    // Resolve absolute path and prevent path traversal escape
    const absolutePath = path.resolve(this.baseDir, storageKey);
    if (!absolutePath.startsWith(this.baseDir)) {
      throw new Error('Access denied: Path traversal detected.');
    }

    if (!fs.existsSync(absolutePath)) {
      throw new Error('File not found in storage.');
    }

    return absolutePath;
  }

  /**
   * Deletes the file and its parent document directory if empty.
   */
  public async delete(storageKey: string): Promise<void> {
    const absolutePath = path.resolve(this.baseDir, storageKey);
    if (!absolutePath.startsWith(this.baseDir)) {
      throw new Error('Access denied: Path traversal detected.');
    }

    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
    }

    // Clean up parent directory if empty
    const parentDir = path.dirname(absolutePath);
    if (parentDir !== this.baseDir && fs.existsSync(parentDir)) {
      const files = await fs.promises.readdir(parentDir);
      if (files.length === 0) {
        await fs.promises.rmdir(parentDir);
      }
    }
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

// Single active instance of the configured storage provider
export const documentStorageService: DocumentStorageProvider = new LocalStorageProvider();
