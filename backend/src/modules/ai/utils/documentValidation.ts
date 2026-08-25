import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { ENV } from '../../../config/env';

// Configurable size limit from environment (default: 30MB + 50KB form boundary margin)
export const MAX_DOCUMENT_UPLOAD_SIZE = ENV.MAX_DOCUMENT_UPLOAD_SIZE || (30 * 1024 * 1024 + 50 * 1024); // 30MB + 50KB

/**
 * Computes a SHA-256 hash checksum of the uploaded document bytes (Buffer version).
 */
export function computeFileChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes a SHA-256 hash checksum from a disk file stream (0 MB RAM overhead).
 */
export function computeFileChecksumFromPath(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Safely deletes a file from disk, preventing path traversal and ignoring ENOENT errors.
 */
export async function safeDeleteFile(filePath: string, documentId?: string): Promise<boolean> {
  if (!filePath) return false;

  try {
    const uploadsBase = path.resolve(process.cwd(), 'uploads');
    const absolutePath = path.resolve(filePath);

    // Security guard: ensure file is inside the configured uploads directory
    if (!absolutePath.startsWith(uploadsBase)) {
      console.warn(`[DocumentCleanup] Path traversal blocked: ${filePath} outside ${uploadsBase}`);
      return false;
    }

    await fs.promises.unlink(absolutePath);
    console.log(`[DocumentCleanup] Deleted temp file ${documentId ? `documentId=${documentId} ` : ''}path=${path.basename(absolutePath)}`);
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log(`[DocumentCleanup] File already removed ${documentId ? `documentId=${documentId} ` : ''}path=${path.basename(filePath)}`);
      return true;
    }
    console.error(`[DocumentCleanup] Cleanup failed ${documentId ? `documentId=${documentId} ` : ''}path=${path.basename(filePath)}:`, err.message);
    return false;
  }
}

// Supported types mapping extension to MIME types
export const SUPPORTED_DOCUMENT_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/plain', 'application/octet-stream'], // sometimes markdown uploads as octet-stream
};

/**
 * Validates a file's headers/magic bytes to ensure it's not spoofed.
 */
export function validateFileSignature(buffer: Buffer, extension: string): boolean {
  if (buffer.length < 4) return false;

  const hexSignature = buffer.toString('hex', 0, 4).toLowerCase();

  switch (extension) {
    case '.pdf':
      // PDF starts with %PDF (hex: 25504446)
      return hexSignature === '25504446';
    case '.docx':
      // DOCX (Zip archive) starts with PK\x03\x04 (hex: 504b0304)
      return hexSignature === '504b0304';
    case '.txt':
    case '.md':
      // Plain text check: verify no null bytes or suspicious control characters in the first 512 bytes
      const sampleSize = Math.min(buffer.length, 512);
      for (let i = 0; i < sampleSize; i++) {
        const charCode = buffer[i];
        if (charCode === 0) {
          return false; // Null byte indicates binary file
        }
      }
      return true;
    default:
      return false;
  }
}

/**
 * Sanitizes a filename to prevent path traversal and ensure compatibility.
 */
export function sanitizeFileName(fileName: string): string {
  // Strip path segments
  const baseName = path.basename(fileName);
  
  // Replace dangerous characters and strip out traversal strings
  const sanitized = baseName
    .replace(/\.\.+/g, '.') // collapse multiple dots
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_'); // replace non-alphanumeric/safe chars with underscore

  return sanitized;
}

/**
 * Performs layered validation on disk-based file upload metadata and header contents.
 */
export function validateUploadDiskFile(
  filePath: string,
  fileSize: number,
  originalName: string,
  mimeType: string
): { valid: boolean; error?: string; status?: number } {
  if (!filePath || fileSize === 0) {
    return { valid: false, error: 'File is empty or missing content.', status: 400 };
  }

  // Size validation
  if (fileSize > MAX_DOCUMENT_UPLOAD_SIZE) {
    return {
      valid: false,
      error: `File size exceeds limit of ${(MAX_DOCUMENT_UPLOAD_SIZE / (1024 * 1024)).toFixed(0)}MB.`,
      status: 413,
    };
  }

  // Extension validation
  const ext = path.extname(originalName).toLowerCase();
  const allowedMimeTypes = SUPPORTED_DOCUMENT_TYPES[ext];

  if (!allowedMimeTypes) {
    return {
      valid: false,
      error: `Unsupported file extension '${ext}'. Allowed types: PDF, DOCX, TXT, MD.`,
      status: 400,
    };
  }

  // MIME type validation
  const cleanMime = mimeType.trim().toLowerCase();
  if (!allowedMimeTypes.includes(cleanMime)) {
    return {
      valid: false,
      error: `MIME type mismatch for extension '${ext}'. Expected one of: ${allowedMimeTypes.join(', ')}`,
      status: 400,
    };
  }

  // Read tiny 512-byte header for magic byte signature validation
  try {
    const fd = fs.openSync(filePath, 'r');
    const headerBuf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, headerBuf, 0, 512, 0);
    fs.closeSync(fd);

    const sampleBuf = headerBuf.subarray(0, bytesRead);
    if (!validateFileSignature(sampleBuf, ext)) {
      return {
        valid: false,
        error: `File signature validation failed. The file content does not match the extension '${ext}'.`,
        status: 400,
      };
    }
  } catch (e: any) {
    return { valid: false, error: `Failed to read file headers: ${e.message}`, status: 400 };
  }

  return { valid: true };
}

/**
 * Performs layered validation on file upload metadata and contents (Buffer version).
 */
export function validateUploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): { valid: boolean; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File is empty or missing content.' };
  }

  // Size validation
  if (buffer.length > MAX_DOCUMENT_UPLOAD_SIZE) {
    return {
      valid: false,
      error: `File size exceeds limit of ${(MAX_DOCUMENT_UPLOAD_SIZE / (1024 * 1024)).toFixed(0)}MB.`,
    };
  }

  // Extension validation
  const ext = path.extname(originalName).toLowerCase();
  const allowedMimeTypes = SUPPORTED_DOCUMENT_TYPES[ext];

  if (!allowedMimeTypes) {
    return {
      valid: false,
      error: `Unsupported file extension '${ext}'. Allowed types: PDF, DOCX, TXT, MD.`,
    };
  }

  // MIME type validation
  const cleanMime = mimeType.trim().toLowerCase();
  if (!allowedMimeTypes.includes(cleanMime)) {
    return {
      valid: false,
      error: `MIME type mismatch for extension '${ext}'. Expected one of: ${allowedMimeTypes.join(', ')}`,
    };
  }

  // Magic byte signature validation (detect spoofed file extensions)
  if (!validateFileSignature(buffer, ext)) {
    return {
      valid: false,
      error: `File signature validation failed. The file content does not match the extension '${ext}'.`,
    };
  }

  return { valid: true };
}
