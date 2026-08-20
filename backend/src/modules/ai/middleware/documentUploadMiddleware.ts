import multer from 'multer';
import { MAX_DOCUMENT_UPLOAD_SIZE } from '../utils/documentValidation';

// Multer memory storage configuration with file size limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_UPLOAD_SIZE,
  },
});

// Middleware for parsing a single file upload under the field name 'file'
export const documentUploadMiddleware = upload.single('file');
