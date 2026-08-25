import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { MAX_DOCUMENT_UPLOAD_SIZE } from '../utils/documentValidation';

const tempDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Multer disk storage configuration: streams directly to disk (0 MB RAM buffer retention)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `upload_${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_DOCUMENT_UPLOAD_SIZE,
  },
});

// Middleware for parsing a single file upload under the field name 'file'
export const documentUploadMiddleware = upload.single('file');
