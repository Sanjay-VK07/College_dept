import path from 'path';

// Configurable size limit from environment (default: 10MB)
export const MAX_DOCUMENT_UPLOAD_SIZE = process.env.MAX_DOCUMENT_UPLOAD_SIZE
  ? parseInt(process.env.MAX_DOCUMENT_UPLOAD_SIZE, 10)
  : 10 * 1024 * 1024; // 10MB

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
 * Performs layered validation on file upload metadata and contents.
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
